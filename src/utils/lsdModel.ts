import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const MAX_HANDS = 2;
const LANDMARKS_PER_HAND = 21;
const HAND_FEATURES = LANDMARKS_PER_HAND * 3;
const BASE_FEATURE_COUNT = HAND_FEATURES * MAX_HANDS + MAX_HANDS;
const MOTION_FEATURES_PER_HAND = 6;
const INTER_HAND_FEATURES = 4;
const POSE_SOURCE_INDICES = [0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 23, 24] as const;
const POSE_POINT_COUNT = POSE_SOURCE_INDICES.length + 2; // cuello y pecho derivados
const POSE_FEATURES = POSE_POINT_COUNT * 3 + 1;
const HAND_BODY_FEATURES = 9; // muñeca xyz relativa al pecho + seis distancias anatómicas
const MOTION_FEATURE_COUNT = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS + INTER_HAND_FEATURES;
const BODY_FEATURE_COUNT = MOTION_FEATURE_COUNT + POSE_FEATURES + HAND_BODY_FEATURES * MAX_HANDS;

export interface LsdSequenceFrame {
  hands: NormalizedLandmark[][];
  handedness: string[];
  pose?: NormalizedLandmark[];
}

interface LsdModelManifest {
  available: boolean;
  version: string;
  variant: 'LSD';
  sequenceLength: number;
  featureCount: number;
  featureContract?: string;
  confidenceThreshold: number;
  experimental?: boolean;
  labels: Array<{ code: string; displayName: string }>;
  metrics: { macroF1: number; minimumClassRecall: number; testSamples: number } | null;
  trainedAt: string | null;
}

interface LoadedLsdModel {
  manifest: LsdModelManifest;
  model: import('@tensorflow/tfjs').LayersModel;
  tf: typeof import('@tensorflow/tfjs');
}

export interface LsdModelPrediction {
  code: string;
  label: string;
  confidence: number;
  version: string;
  accepted: boolean;
  threshold: number;
}

let loadedModel: LoadedLsdModel | null = null;
let modelPromise: Promise<LoadedLsdModel | null> | null = null;
let lastManifestCheck = 0;
const MODEL_RECHECK_MS = 60_000;

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

interface EncodedHand {
  normalized: number[];
  wrist: [number, number, number];
  palmSize: number;
  order: number;
}

function normalizeHand(hand: NormalizedLandmark[]): Omit<EncodedHand, 'order'> | null {
  if (hand.length < LANDMARKS_PER_HAND) return null;
  const wrist = hand[0];
  const palmSize = distance(hand[9], wrist);
  if (palmSize < 0.0001) return null;
  const normalized = hand.slice(0, LANDMARKS_PER_HAND).flatMap((point) => [point.x, point.y, point.z].map((value, axis) => {
    const origin = axis === 0 ? wrist.x : axis === 1 ? wrist.y : wrist.z;
    return Math.max(-4, Math.min(4, (value - origin) / palmSize));
  }));
  return { normalized, wrist: [wrist.x, wrist.y, wrist.z], palmSize };
}

function frameEntries(frame: LsdSequenceFrame): EncodedHand[] {
  return frame.hands.slice(0, MAX_HANDS).map((hand, index) => {
    const handData = normalizeHand(hand);
    const side = (frame.handedness[index] || '').toLowerCase();
    const order = side === 'left' ? 0 : side === 'right' ? 1 : hand[0]?.x ?? 0;
    return handData ? { ...handData, order } : null;
  }).filter((entry): entry is EncodedHand => Boolean(entry)).sort((a, b) => a.order - b.order);
}

interface EncodedPose {
  normalized: number[];
  chest: [number, number, number];
  scale: number;
  anchors: Array<[number, number, number]>;
}

const midpoint = (a: NormalizedLandmark, b: NormalizedLandmark): [number, number, number] => [
  (a.x + b.x) / 2,
  (a.y + b.y) / 2,
  (a.z + b.z) / 2,
];

function normalizePose(pose: NormalizedLandmark[] | undefined): EncodedPose | null {
  if (!pose || pose.length < 25) return null;
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const shoulderScale = distance(leftShoulder, rightShoulder);
  if (shoulderScale < 0.02) return null;
  const neck = midpoint(leftShoulder, rightShoulder);
  const hips = midpoint(pose[23], pose[24]);
  const chest: [number, number, number] = neck.map((value, axis) => value * 0.65 + hips[axis] * 0.35) as [number, number, number];
  const points: Array<[number, number, number]> = POSE_SOURCE_INDICES.map((index) => [pose[index].x, pose[index].y, pose[index].z]);
  points.push(neck, chest);
  const normalized = points.flatMap((point) => point.map((value, axis) => Math.max(-6, Math.min(6, (value - chest[axis]) / shoulderScale))));
  const mouth = midpoint(pose[9], pose[10]);
  const anchors: Array<[number, number, number]> = [
    [pose[0].x, pose[0].y, pose[0].z], mouth, neck, chest,
    [leftShoulder.x, leftShoulder.y, leftShoulder.z],
    [rightShoulder.x, rightShoulder.y, rightShoulder.z],
  ];
  return { normalized, chest, scale: shoulderScale, anchors };
}

function encodeLegacyFrame(frame: LsdSequenceFrame, featureCount: number): number[] {
  const encoded = new Array(featureCount).fill(0);
  const entries = frameEntries(frame);
  entries.slice(0, MAX_HANDS).forEach((entry, slot) => {
    encoded.splice(slot * HAND_FEATURES, HAND_FEATURES, ...entry.normalized);
    encoded[HAND_FEATURES * MAX_HANDS + slot] = 1;
  });
  return encoded;
}

function encodeSequence(frames: LsdSequenceFrame[], manifest: LsdModelManifest): number[][] | null {
  const visible = frames.filter((frame) => frame.hands.length > 0);
  if (visible.length < 8) return null;
  const sampled = Array.from({ length: manifest.sequenceLength }, (_, index) => {
    const sourceIndex = Math.round(index * (visible.length - 1) / Math.max(1, manifest.sequenceLength - 1));
    return visible[sourceIndex];
  });
  const supportsMotion = manifest.featureContract === 'lsd-motion-v2' && manifest.featureCount === MOTION_FEATURE_COUNT;
  const supportsBody = manifest.featureContract === 'lsd-body-v3' && manifest.featureCount === BODY_FEATURE_COUNT;
  if (!supportsMotion && !supportsBody) {
    return sampled.map((frame) => encodeLegacyFrame(frame, manifest.featureCount));
  }
  const anchors: Array<{ wrist: [number, number, number]; palmSize: number } | null> = new Array(MAX_HANDS).fill(null);
  const previousDisplacements: Array<[number, number, number] | null> = new Array(MAX_HANDS).fill(null);
  return sampled.map((frame) => {
    const encoded = new Array(manifest.featureCount).fill(0);
    const entries = frameEntries(frame).slice(0, MAX_HANDS);
    entries.forEach((entry, slot) => {
      encoded.splice(slot * HAND_FEATURES, HAND_FEATURES, ...entry.normalized);
      encoded[HAND_FEATURES * MAX_HANDS + slot] = 1;
      anchors[slot] ??= { wrist: entry.wrist, palmSize: entry.palmSize };
      const anchor = anchors[slot]!;
      const displacement = entry.wrist.map((value, axis) => Math.max(-6, Math.min(6, (value - anchor.wrist[axis]) / Math.max(anchor.palmSize, 0.0001)))) as [number, number, number];
      const previous = previousDisplacements[slot];
      const velocity = displacement.map((value, axis) => previous ? Math.max(-3, Math.min(3, value - previous[axis])) : 0);
      const motionStart = BASE_FEATURE_COUNT + slot * MOTION_FEATURES_PER_HAND;
      encoded.splice(motionStart, 3, ...displacement);
      encoded.splice(motionStart + 3, 3, ...velocity);
      previousDisplacements[slot] = displacement;
    });
    if (entries.length === 2) {
      const scale = Math.max((entries[0].palmSize + entries[1].palmSize) / 2, 0.0001);
      const vector = entries[1].wrist.map((value, axis) => Math.max(-6, Math.min(6, (value - entries[0].wrist[axis]) / scale)));
      const relationStart = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS;
      encoded.splice(relationStart, 3, ...vector);
      encoded[relationStart + 3] = Math.min(8, Math.hypot(...vector));
    }
    if (manifest.featureContract === 'lsd-body-v3') {
      const pose = normalizePose(frame.pose);
      const poseStart = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS + INTER_HAND_FEATURES;
      if (pose) {
        encoded.splice(poseStart, POSE_POINT_COUNT * 3, ...pose.normalized);
        encoded[poseStart + POSE_POINT_COUNT * 3] = 1;
        entries.forEach((entry, slot) => {
          const start = poseStart + POSE_FEATURES + slot * HAND_BODY_FEATURES;
          const wristRelative = entry.wrist.map((value, axis) => Math.max(-8, Math.min(8, (value - pose.chest[axis]) / pose.scale)));
          const distances = pose.anchors.map((anchor) => Math.min(12, Math.hypot(...entry.wrist.map((value, axis) => (value - anchor[axis]) / pose.scale))));
          encoded.splice(start, HAND_BODY_FEATURES, ...wristRelative, ...distances);
        });
      }
    }
    return encoded;
  });
}

export async function loadLsdModel(forceRefresh = false): Promise<LoadedLsdModel | null> {
  if (!forceRefresh && loadedModel && Date.now() - lastManifestCheck < MODEL_RECHECK_MS) return loadedModel;
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    lastManifestCheck = Date.now();
    const response = await fetch(`/models/lsd/manifest.json?check=${lastManifestCheck}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json() as LsdModelManifest;
    if (!manifest.available || !manifest.labels.length) return null;
    if (loadedModel?.manifest.version === manifest.version) return loadedModel;
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const model = await tf.loadLayersModel(`/models/lsd/model.json?v=${encodeURIComponent(manifest.version)}`);
    loadedModel?.model.dispose();
    loadedModel = { manifest, model, tf };
    return loadedModel;
  })().catch(() => loadedModel).finally(() => { modelPromise = null; });
  return modelPromise;
}

export async function predictLsdSequence(loaded: LoadedLsdModel, frames: LsdSequenceFrame[]): Promise<LsdModelPrediction | null> {
  const encoded = encodeSequence(frames, loaded.manifest);
  if (!encoded) return null;
  const input = loaded.tf.tensor3d([encoded], [1, loaded.manifest.sequenceLength, loaded.manifest.featureCount]);
  try {
    const output = loaded.model.predict(input) as import('@tensorflow/tfjs').Tensor;
    const probabilities = await output.data();
    output.dispose();
    let bestIndex = 0;
    for (let index = 1; index < probabilities.length; index += 1) if (probabilities[index] > probabilities[bestIndex]) bestIndex = index;
    const label = loaded.manifest.labels[bestIndex];
    const confidence = Number(probabilities[bestIndex] || 0);
    if (!label) return null;
    return {
      code: label.code,
      label: label.displayName,
      confidence,
      version: loaded.manifest.version,
      accepted: confidence >= loaded.manifest.confidenceThreshold,
      threshold: loaded.manifest.confidenceThreshold,
    };
  } finally {
    input.dispose();
  }
}

export type LsdLoadedModel = Awaited<ReturnType<typeof loadLsdModel>>;
