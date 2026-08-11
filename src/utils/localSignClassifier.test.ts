import assert from 'node:assert/strict';
import test from 'node:test';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { classifyAslAlphabet, classifyAslAlphabetSequence, classifyLocalSign, classifyLocalSignSequence, classifyLsdAlphabet } from './localSignClassifier';

const point = (x: number, y: number, z = 0): NormalizedLandmark => ({ x, y, z, visibility: 1 });

function makeHand(extended: boolean[], thumbExtended = false): NormalizedLandmark[] {
  const hand = Array.from({ length: 21 }, () => point(0.5, 0.75));
  hand[0] = point(0.5, 0.9);
  hand[1] = point(0.42, 0.8);
  hand[2] = point(0.36, 0.72);
  hand[3] = thumbExtended ? point(0.29, 0.64) : point(0.4, 0.68);
  hand[4] = thumbExtended ? point(0.21, 0.56) : point(0.43, 0.72);
  const bases = [0.42, 0.5, 0.58, 0.66];
  const indexes = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  indexes.forEach((landmarks, finger) => {
    const x = bases[finger];
    hand[landmarks[0]] = point(x, 0.68);
    hand[landmarks[1]] = extended[finger] ? point(x, 0.51) : point(x, 0.62);
    hand[landmarks[2]] = extended[finger] ? point(x, 0.35) : point(x + 0.025, 0.68);
    hand[landmarks[3]] = extended[finger] ? point(x, 0.19) : point(x + 0.01, 0.73);
  });
  return hand;
}

const translateHand = (hand: NormalizedLandmark[], x: number, y: number) => hand.map((landmark) => ({ ...landmark, x: landmark.x + x, y: landmark.y + y }));

test('reconoce formas inequívocas del abecedario oficial LSD', () => {
  assert.equal(classifyLsdAlphabet(makeHand([true, true, true, true]))?.label, 'B');
  assert.equal(classifyLsdAlphabet(makeHand([false, false, false, true]))?.label, 'I');
  assert.equal(classifyLsdAlphabet(makeHand([true, false, false, false], true))?.label, 'L');
});

test('reconoce el alfabeto manual ASL sin agregar la Ñ dominicana', () => {
  assert.equal(classifyAslAlphabet(makeHand([true, true, true, true]))?.label, 'B');
  assert.equal(classifyAslAlphabet(makeHand([false, false, false, true]))?.label, 'I');
  assert.match(classifyAslAlphabet(makeHand([true, false, false, false], true))?.detail || '', /Abecedario ASL/);

  const nHand = makeHand([false, false, false, false]);
  const nMovement = Array.from({ length: 10 }, (_, index) => ({
    hand: translateHand(nHand, index % 2 ? 0.04 : 0, 0),
    timestamp: index * 100,
  }));
  assert.notEqual(classifyAslAlphabetSequence(nMovement)?.label, 'Ñ');
});

test('no presenta la regla ASL de te quiero como palabra LSD', () => {
  assert.equal(classifyLocalSign(makeHand([true, false, false, true], true), 'LSD'), null);
  assert.equal(classifyLocalSign(makeHand([true, false, false, true], true), 'ASL')?.label, 'Te quiero');
});

test('reconoce una trayectoria básica hacia arriba en modo señas LSD', () => {
  const base = makeHand([true, false, false, false]);
  const frames = Array.from({ length: 8 }, (_, index) => ({
    hand: translateHand(base, 0, -index * 0.018),
    timestamp: index * 110,
  }));
  assert.equal(classifyLocalSignSequence(frames, 'LSD')?.label, 'Arriba');
});

test('distingue las trayectorias oficiales básicas de Hola y Gracias', () => {
  const openHand = makeHand([true, true, true, true], true);
  const hello = Array.from({ length: 8 }, (_, index) => ({
    hand: translateHand(openHand, index * 0.035, 0),
    timestamp: index * 110,
  }));
  const thanks = Array.from({ length: 8 }, (_, index) => ({
    hand: translateHand(openHand, 0, index * 0.022),
    timestamp: index * 110,
  }));
  assert.equal(classifyLocalSignSequence(hello, 'LSD')?.label, 'Hola');
  assert.equal(classifyLocalSignSequence(thanks, 'LSD')?.label, 'Gracias');
});
