import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const MAX_HANDS = 2;
const LANDMARKS_PER_HAND = 21;
const HAND_FEATURES = LANDMARKS_PER_HAND * 3;

export interface LsdSequenceFrame {
  hands: NormalizedLandmark[][];
  handedness: string[];
}

interface LsdModelManifest {
  available: boolean;
  version: string;
  variant: 'LSD';
  sequenceLength: number;
  featureCount: number;
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
}

let modelPromise: Promise<LoadedLsdModel | null> | null = null;

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function normalizeHand(hand: NormalizedLandmark[]): number[] | null {
  if (hand.length < LANDMARKS_PER_HAND) return null;
  const wrist = hand[0];
  const palmSize = distance(hand[9], wrist);
  if (palmSize < 0.0001) return null;
  return hand.slice(0, LANDMARKS_PER_HAND).flatMap((point) => [point.x, point.y, point.z].map((value, axis) => {
    const origin = axis === 0 ? wrist.x : axis === 1 ? wrist.y : wrist.z;
    return Math.max(-4, Math.min(4, (value - origin) / palmSize));
  }));
}

function encodeFrame(frame: LsdSequenceFrame, featureCount: number): number[] {
  const encoded = new Array(featureCount).fill(0);
  const entries = frame.hands.slice(0, MAX_HANDS).map((hand, index) => {
    const normalized = normalizeHand(hand);
    const side = (frame.handedness[index] || '').toLowerCase();
    const order = side === 'left' ? 0 : side === 'right' ? 1 : hand[0]?.x ?? 0;
    return normalized ? { normalized, order } : null;
  }).filter((entry): entry is { normalized: number[]; order: number } => Boolean(entry)).sort((a, b) => a.order - b.order);
  entries.slice(0, MAX_HANDS).forEach((entry, slot) => {
    encoded.splice(slot * HAND_FEATURES, HAND_FEATURES, ...entry.normalized);
    encoded[HAND_FEATURES * MAX_HANDS + slot] = 1;
  });
  return encoded;
}

function encodeSequence(frames: LsdSequenceFrame[], manifest: LsdModelManifest): number[][] | null {
  const visible = frames.filter((frame) => frame.hands.length > 0);
  if (visible.length < 8) return null;
  return Array.from({ length: manifest.sequenceLength }, (_, index) => {
    const sourceIndex = Math.round(index * (visible.length - 1) / Math.max(1, manifest.sequenceLength - 1));
    return encodeFrame(visible[sourceIndex], manifest.featureCount);
  });
}

export async function loadLsdModel(): Promise<LoadedLsdModel | null> {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    const response = await fetch('/models/lsd/manifest.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json() as LsdModelManifest;
    if (!manifest.available || !manifest.labels.length) return null;
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const model = await tf.loadLayersModel('/models/lsd/model.json');
    return { manifest, model, tf };
  })().catch(() => null);
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
    if (!label || confidence < loaded.manifest.confidenceThreshold) return null;
    return { code: label.code, label: label.displayName, confidence, version: loaded.manifest.version };
  } finally {
    input.dispose();
  }
}

export type LsdLoadedModel = Awaited<ReturnType<typeof loadLsdModel>>;
