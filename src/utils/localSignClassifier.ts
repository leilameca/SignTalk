import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface LocalSignPrediction {
  label: string;
  confidence: number;
  detail: string;
}

export interface LocalSignFrame {
  hand: NormalizedLandmark[];
  timestamp: number;
}

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const jointAngle = (a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) => {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magnitude = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z);
  return magnitude ? Math.acos(Math.max(-1, Math.min(1, dot / magnitude))) * 180 / Math.PI : 0;
};

const fingerExtended = (hand: NormalizedLandmark[], tip: number, pip: number, mcp: number) => {
  const wrist = hand[0];
  const dip = tip - 1;
  return jointAngle(hand[mcp], hand[pip], hand[dip]) > 145
    && jointAngle(hand[pip], hand[dip], hand[tip]) > 145
    && distance(hand[tip], wrist) > distance(hand[pip], wrist) * 1.05;
};

const handShape = (hand: NormalizedLandmark[]) => {
  const palmSize = distance(hand[0], hand[9]);
  const thumb = jointAngle(hand[2], hand[3], hand[4]) > 135
    && distance(hand[4], hand[2]) > palmSize * 0.72;
  const fingers = [
    fingerExtended(hand, 8, 6, 5),
    fingerExtended(hand, 12, 10, 9),
    fingerExtended(hand, 16, 14, 13),
    fingerExtended(hand, 20, 18, 17),
  ];
  return { palmSize, thumb, fingers, extended: fingers.filter(Boolean).length };
};

/** Dynamic signs must be inferred from a sequence, never from one frozen frame. */
export function classifyLocalSignSequence(frames: LocalSignFrame[], variant: 'LSD' | 'ASL'): LocalSignPrediction | null {
  if (frames.length < 5) return null;
  const recent = frames.slice(-8);
  const first = recent[0].hand;
  const last = recent[recent.length - 1].hand;
  if (first.length < 21 || last.length < 21) return null;

  const shapes = recent.map(({ hand }) => handShape(hand));
  const openPalmRatio = shapes.filter(({ thumb, extended }) => thumb && extended === 4).length / shapes.length;
  const averagePalmSize = shapes.reduce((total, shape) => total + shape.palmSize, 0) / shapes.length;
  const horizontalTravel = Math.abs(last[0].x - first[0].x) / Math.max(averagePalmSize, 0.04);
  const verticalTravel = Math.abs(last[0].y - first[0].y) / Math.max(averagePalmSize, 0.04);
  const duration = recent[recent.length - 1].timestamp - recent[0].timestamp;

  // LSD and ASL both use an open palm with a deliberate lateral greeting motion.
  if (duration >= 650 && openPalmRatio >= 0.75 && horizontalTravel >= 0.75 && verticalTravel <= 0.8) {
    return {
      label: 'Hola',
      confidence: Math.min(0.94, 0.8 + Math.min(horizontalTravel, 1.4) * 0.08),
      detail: `Saludo con movimiento lateral · ${variant}`,
    };
  }

  return null;
}

export function classifyLocalSign(hand: NormalizedLandmark[], variant: 'LSD' | 'ASL'): LocalSignPrediction | null {
  if (hand.length < 21) return null;

  const { palmSize, thumb, fingers, extended } = handShape(hand);
  if (palmSize < 0.04) return null;
  const [index, middle, ring, pinky] = fingers;
  const alphabet = variant === 'ASL' ? 'ASL' : 'LSD/ASL';

  if (thumb && index && !middle && !ring && pinky) {
    return { label: 'Te quiero', confidence: 0.93, detail: 'Pulgar, índice y meñique extendidos' };
  }
  if (!thumb && extended === 4) {
    return { label: 'B', confidence: 0.84, detail: `Dactilología ${alphabet}` };
  }
  if (index && middle && !ring && !pinky) {
    return { label: 'Dos', confidence: 0.86, detail: 'Índice y medio extendidos' };
  }
  if (index && !middle && !ring && !pinky) {
    return { label: 'Uno', confidence: 0.84, detail: 'Índice extendido' };
  }
  if (thumb && extended === 0 && hand[4].y < hand[2].y) {
    return { label: 'Bien', confidence: 0.82, detail: 'Pulgar levantado' };
  }
  if (!thumb && extended === 0) {
    return { label: 'A', confidence: 0.78, detail: `Puño cerrado · dactilología ${alphabet}` };
  }
  if (!thumb && !index && !middle && !ring && pinky) {
    return { label: 'I', confidence: 0.8, detail: `Dactilología ${alphabet}` };
  }

  return null;
}
