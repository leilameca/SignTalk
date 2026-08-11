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

const OFFICIAL_LSD_DICTIONARY = 'Diccionario oficial CONADIS · MINERD · ANSORDO';
const clampConfidence = (value: number) => Math.max(0.5, Math.min(0.96, value));
const normalizedDistance = (hand: NormalizedLandmark[], first: number, second: number, palmSize: number) => distance(hand[first], hand[second]) / Math.max(palmSize, 0.001);
const indexDirection = (hand: NormalizedLandmark[]) => ({ x: hand[8].x - hand[5].x, y: hand[8].y - hand[5].y });

const makeAlphabetPrediction = (letter: string, confidence: number, qualifier = 'forma estática'): LocalSignPrediction => ({
  label: letter,
  confidence: clampConfidence(confidence),
  detail: `Abecedario LSD · ${qualifier} · ${OFFICIAL_LSD_DICTIONARY}`,
});

/**
 * Dactilología dominicana basada en el abecedario oficial. Algunas formas de puño
 * son visualmente muy parecidas; se mantienen con menor confianza para exigir
 * estabilidad y permitir corrección manual antes de agregarlas.
 */
export function classifyLsdAlphabet(hand: NormalizedLandmark[]): LocalSignPrediction | null {
  if (hand.length < 21) return null;
  const { palmSize, thumb, fingers, extended } = handShape(hand);
  if (palmSize < 0.04) return null;
  const [index, middle, ring, pinky] = fingers;
  const indexThumb = normalizedDistance(hand, 4, 8, palmSize);
  const middleThumb = normalizedDistance(hand, 4, 12, palmSize);
  const ringThumb = normalizedDistance(hand, 4, 16, palmSize);
  const pinkyThumb = normalizedDistance(hand, 4, 20, palmSize);
  const indexMiddle = normalizedDistance(hand, 8, 12, palmSize);
  const middleRing = normalizedDistance(hand, 12, 16, palmSize);
  const direction = indexDirection(hand);
  const horizontalIndex = Math.abs(direction.x) > Math.abs(direction.y) * 1.2;
  const downwardIndex = direction.y > Math.abs(direction.x) * 0.75;
  const crossedIndexMiddle = (hand[8].x - hand[12].x) * (hand[6].x - hand[10].x) < 0;

  if (indexThumb < 0.42 && middle && ring && pinky) return makeAlphabetPrediction('F', 0.9, 'índice y pulgar unidos');
  if (index && middle && ring && !pinky && !thumb) return makeAlphabetPrediction('W', 0.88, 'tres dedos extendidos');
  if (index && middle && !ring && !pinky) {
    if (horizontalIndex) return makeAlphabetPrediction('H', 0.86, 'índice y medio hacia el centro');
    if (thumb) return makeAlphabetPrediction(downwardIndex ? 'P' : 'K', 0.83, downwardIndex ? 'forma K orientada al receptor' : 'índice, medio y pulgar');
    if (crossedIndexMiddle) return makeAlphabetPrediction('R', 0.86, 'índice y medio cruzados');
    return makeAlphabetPrediction(indexMiddle < 0.48 ? 'U' : 'V', indexMiddle < 0.48 ? 0.84 : 0.88, indexMiddle < 0.48 ? 'índice y medio juntos' : 'índice y medio separados');
  }
  if (thumb && index && !middle && !ring && !pinky) {
    if (horizontalIndex) return makeAlphabetPrediction('G', 0.86, 'índice y pulgar hacia el centro');
    if (downwardIndex) return makeAlphabetPrediction('Q', 0.82, 'forma G orientada hacia abajo');
    return makeAlphabetPrediction('L', 0.9, 'índice arriba y pulgar afuera');
  }
  if (thumb && !index && !middle && !ring && pinky) return makeAlphabetPrediction('Y', 0.92, 'pulgar y meñique extendidos');
  if (!thumb && !index && !middle && !ring && pinky) return makeAlphabetPrediction('I', 0.9, 'meñique extendido');
  if (!thumb && extended === 4) return makeAlphabetPrediction('B', 0.9, 'mano plana con dedos juntos');
  if (!thumb && index && !middle && !ring && !pinky) {
    const indexPipAngle = jointAngle(hand[5], hand[6], hand[7]);
    if (indexPipAngle < 125) return makeAlphabetPrediction('X', 0.84, 'índice en forma de gancho');
    return makeAlphabetPrediction('D', indexThumb < 0.75 ? 0.84 : 0.76, 'índice arriba y demás dedos en círculo');
  }

  const allTipsNearThumb = [indexThumb, middleThumb, ringThumb, pinkyThumb].every((value) => value < 0.72);
  if (extended === 0 && allTipsNearThumb) return makeAlphabetPrediction('O', 0.86, 'puntas de los dedos formando un círculo');

  const curvedSpread = extended <= 1
    && indexThumb > 0.8
    && middleThumb > 0.8
    && normalizedDistance(hand, 8, 20, palmSize) > 1.15;
  if (curvedSpread) return makeAlphabetPrediction('C', 0.82, 'mano curva en forma de C');

  if (extended === 0) {
    const thumbDistances = [
      normalizedDistance(hand, 4, 5, palmSize),
      normalizedDistance(hand, 4, 9, palmSize),
      normalizedDistance(hand, 4, 13, palmSize),
      normalizedDistance(hand, 4, 17, palmSize),
    ];
    const closest = thumbDistances.indexOf(Math.min(...thumbDistances));
    if (closest === 3) return makeAlphabetPrediction('M', 0.76, 'pulgar hacia el meñique bajo tres dedos');
    if (closest === 2) return makeAlphabetPrediction('N', 0.76, 'pulgar bajo dos dedos');
    if (closest === 1) return makeAlphabetPrediction('T', 0.75, 'pulgar entre índice y medio');
    const fingertipsFoldedTowardThumb = (indexThumb + middleThumb + ringThumb + pinkyThumb) / 4 < 1.05;
    return makeAlphabetPrediction(fingertipsFoldedTowardThumb ? 'E' : (thumb ? 'A' : 'S'), 0.74, fingertipsFoldedTowardThumb ? 'dedos doblados sobre el pulgar' : 'forma de puño');
  }

  return null;
}

export function classifyLsdAlphabetSequence(frames: LocalSignFrame[]): LocalSignPrediction | null {
  if (frames.length < 6) return null;
  const recent = frames.slice(-10);
  const predictions = recent.map(({ hand }) => classifyLsdAlphabet(hand));
  const base = predictions.filter((item): item is LocalSignPrediction => Boolean(item));
  if (!base.length) return null;
  const first = recent[0].hand;
  const last = recent[recent.length - 1].hand;
  const palmSize = recent.reduce((total, frame) => total + handShape(frame.hand).palmSize, 0) / recent.length;
  const travelX = (last[0].x - first[0].x) / Math.max(palmSize, 0.04);
  const travelY = (last[0].y - first[0].y) / Math.max(palmSize, 0.04);
  const directions = recent.slice(1).map((frame, index) => Math.sign(frame.hand[8].x - recent[index].hand[8].x)).filter(Boolean);
  const horizontalTurns = directions.slice(1).filter((direction, index) => direction !== directions[index]).length;

  const iRatio = base.filter((item) => item.label === 'I').length / recent.length;
  if (iRatio >= 0.6 && Math.abs(travelX) > 0.3 && Math.abs(travelY) > 0.25) return makeAlphabetPrediction('J', 0.86, 'movimiento de J con el meñique');

  const nRatio = base.filter((item) => item.label === 'N').length / recent.length;
  if (nRatio >= 0.5 && Math.abs(travelX) > 0.28 && horizontalTurns >= 1) return makeAlphabetPrediction('Ñ', 0.84, 'movimiento lateral de la forma N');

  const indexOnlyRatio = recent.filter(({ hand }) => {
    const shape = handShape(hand);
    return shape.fingers[0] && !shape.fingers[1] && !shape.fingers[2] && !shape.fingers[3];
  }).length / recent.length;
  if (indexOnlyRatio >= 0.75 && Math.abs(travelX) > 0.7 && Math.abs(travelY) > 0.25 && horizontalTurns >= 1) {
    return makeAlphabetPrediction('Z', 0.86, 'movimiento trazado con el índice');
  }

  const counts = new Map<string, LocalSignPrediction[]>();
  base.forEach((prediction) => counts.set(prediction.label, [...(counts.get(prediction.label) || []), prediction]));
  const stable = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!stable || stable[1].length / recent.length < 0.65) return null;
  return stable[1].reduce((best, prediction) => prediction.confidence > best.confidence ? prediction : best);
}

/** Dynamic signs must be inferred from a sequence, never from one frozen frame. */
export function classifyLocalSignSequence(frames: LocalSignFrame[], variant: 'LSD' | 'ASL'): LocalSignPrediction | null {
  if (frames.length < 5) return null;
  const lastTimestamp = frames[frames.length - 1].timestamp;
  const recent = frames.filter((frame) => frame.timestamp >= lastTimestamp - 1_200).slice(-18);
  const first = recent[0].hand;
  const last = recent[recent.length - 1].hand;
  if (first.length < 21 || last.length < 21) return null;

  const shapes = recent.map(({ hand }) => handShape(hand));
  const openPalmRatio = shapes.filter(({ thumb, extended }) => thumb && extended === 4).length / shapes.length;
  const averagePalmSize = shapes.reduce((total, shape) => total + shape.palmSize, 0) / shapes.length;
  const horizontalTravel = Math.abs(last[0].x - first[0].x) / Math.max(averagePalmSize, 0.04);
  const verticalTravel = Math.abs(last[0].y - first[0].y) / Math.max(averagePalmSize, 0.04);
  const duration = recent[recent.length - 1].timestamp - recent[0].timestamp;

  if (variant === 'LSD') {
    const indexOnlyRatio = shapes.filter(({ thumb, fingers }) => !thumb && fingers[0] && !fingers[1] && !fingers[2] && !fingers[3]).length / shapes.length;
    const signedVerticalTravel = (last[0].y - first[0].y) / Math.max(averagePalmSize, 0.04);
    if (duration >= 500 && indexOnlyRatio >= 0.7 && Math.abs(signedVerticalTravel) >= 0.55 && horizontalTravel <= 0.7) {
      return {
        label: signedVerticalTravel < 0 ? 'Arriba' : 'Abajo',
        confidence: clampConfidence(0.82 + Math.min(Math.abs(signedVerticalTravel), 1.2) * 0.06),
        detail: `Dirección con el índice · ${OFFICIAL_LSD_DICTIONARY}`,
      };
    }

    const noApertures = recent.map(({ hand }, index) => {
      const palm = shapes[index].palmSize;
      return (normalizedDistance(hand, 4, 8, palm) + normalizedDistance(hand, 4, 12, palm)) / 2;
    });
    const apertureRange = Math.max(...noApertures) - Math.min(...noApertures);
    const noDirections = noApertures.slice(1).map((value, index) => Math.sign(value - noApertures[index])).filter(Boolean);
    const noTurns = noDirections.slice(1).filter((direction, index) => direction !== noDirections[index]).length;
    const lowerFingersClosed = shapes.filter(({ fingers }) => !fingers[2] && !fingers[3]).length / shapes.length;
    if (duration >= 650 && lowerFingersClosed >= 0.75 && apertureRange >= 0.32 && noTurns >= 2) {
      return { label: 'No', confidence: 0.86, detail: `Apertura y cierre repetido · ${OFFICIAL_LSD_DICTIONARY}` };
    }
  }

  // El saludo se valida por una trayectoria deliberada, no por una postura aislada.
  if (duration >= 650 && openPalmRatio >= 0.75 && horizontalTravel >= 0.75 && verticalTravel <= 0.8) {
    return {
      label: 'Hola',
      confidence: Math.min(0.94, 0.8 + Math.min(horizontalTravel, 1.4) * 0.08),
      detail: `Saludo con movimiento lateral · ${variant}`,
    };
  }

  if (variant === 'LSD') {
    const signedVerticalTravel = (last[0].y - first[0].y) / Math.max(averagePalmSize, 0.04);
    if (duration >= 650 && openPalmRatio >= 0.75 && signedVerticalTravel >= 0.45 && horizontalTravel <= 0.65) {
      return {
        label: 'Gracias',
        confidence: clampConfidence(0.81 + Math.min(signedVerticalTravel, 1.1) * 0.07),
        detail: `Mano plana en arco hacia adelante · ${OFFICIAL_LSD_DICTIONARY}`,
      };
    }
  }

  return null;
}

export function classifyLocalSign(hand: NormalizedLandmark[], variant: 'LSD' | 'ASL'): LocalSignPrediction | null {
  if (hand.length < 21) return null;

  const { palmSize, thumb, fingers, extended } = handShape(hand);
  if (palmSize < 0.04) return null;
  const [index, middle, ring, pinky] = fingers;
  const alphabet = variant === 'ASL' ? 'ASL' : 'LSD';

  if (variant === 'ASL' && thumb && index && !middle && !ring && pinky) {
    return { label: 'Te quiero', confidence: 0.93, detail: 'Pulgar, índice y meñique extendidos' };
  }
  if (variant === 'ASL' && !thumb && extended === 4) {
    return { label: 'B', confidence: 0.84, detail: `Dactilología ${alphabet}` };
  }
  if (index && middle && !ring && !pinky) {
    return { label: 'Dos', confidence: 0.86, detail: 'Índice y medio extendidos' };
  }
  if (index && !middle && !ring && !pinky) {
    return { label: 'Uno', confidence: 0.84, detail: 'Índice extendido' };
  }
  if (variant === 'ASL' && thumb && extended === 0 && hand[4].y < hand[2].y) {
    return { label: 'Bien', confidence: 0.82, detail: 'Pulgar levantado' };
  }
  if (variant === 'ASL' && !thumb && extended === 0) {
    return { label: 'A', confidence: 0.78, detail: `Puño cerrado · dactilología ${alphabet}` };
  }
  if (variant === 'ASL' && !thumb && !index && !middle && !ring && pinky) {
    return { label: 'I', confidence: 0.8, detail: `Dactilología ${alphabet}` };
  }

  return null;
}
