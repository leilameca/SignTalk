"""Shared feature contract for SignTalk LSD sequence training."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np

SEQUENCE_LENGTH = 48
LANDMARKS_PER_HAND = 21
COORDINATES = 3
MAX_HANDS = 2
FEATURE_COUNT = LANDMARKS_PER_HAND * COORDINATES * MAX_HANDS + MAX_HANDS


@dataclass(frozen=True)
class PreparedDataset:
    features: np.ndarray
    labels: np.ndarray
    participants: np.ndarray
    label_names: dict[str, str]


def _point(point: Any) -> np.ndarray:
    if not isinstance(point, dict):
        return np.zeros(3, dtype=np.float32)
    return np.asarray([point.get("x", 0), point.get("y", 0), point.get("z", 0)], dtype=np.float32)


def normalize_hand(hand: Any) -> np.ndarray | None:
    if not isinstance(hand, list) or len(hand) < LANDMARKS_PER_HAND:
        return None
    points = np.stack([_point(point) for point in hand[:LANDMARKS_PER_HAND]])
    wrist = points[0].copy()
    palm_size = float(np.linalg.norm(points[9] - wrist))
    if palm_size < 1e-4:
        return None
    normalized = np.clip((points - wrist) / palm_size, -4.0, 4.0)
    return normalized.reshape(-1).astype(np.float32)


def frame_features(frame: Any) -> np.ndarray:
    result = np.zeros(FEATURE_COUNT, dtype=np.float32)
    hands = frame.get("hands", []) if isinstance(frame, dict) else []
    handedness = frame.get("handedness", []) if isinstance(frame, dict) else []
    entries = []
    for index, hand in enumerate(hands[:MAX_HANDS]):
        normalized = normalize_hand(hand)
        if normalized is None:
            continue
        side = str(handedness[index]).lower() if index < len(handedness) else ""
        wrist_x = float(hand[0].get("x", 0)) if hand and isinstance(hand[0], dict) else 0.0
        order = 0 if side == "left" else 1 if side == "right" else wrist_x
        entries.append((order, normalized))
    entries.sort(key=lambda item: item[0])
    hand_width = LANDMARKS_PER_HAND * COORDINATES
    for slot, (_, values) in enumerate(entries[:MAX_HANDS]):
        start = slot * hand_width
        result[start:start + hand_width] = values
        result[hand_width * MAX_HANDS + slot] = 1.0
    return result


def sequence_features(frames: Any) -> np.ndarray | None:
    if not isinstance(frames, list) or not frames:
        return None
    encoded = np.stack([frame_features(frame) for frame in frames])
    visible = encoded[:, -MAX_HANDS:].sum(axis=1) > 0
    encoded = encoded[visible]
    if len(encoded) < 8:
        return None
    indexes = np.rint(np.linspace(0, len(encoded) - 1, SEQUENCE_LENGTH)).astype(int)
    return encoded[indexes]


def prepare_dataset(payload: dict[str, Any]) -> PreparedDataset:
    samples = payload.get("samples", [])
    features, labels, participants = [], [], []
    label_names: dict[str, str] = {}
    for sample in samples:
        code = str(sample.get("label_code") or "").strip()
        participant = str(sample.get("participant_id") or "").strip()
        sequence = sequence_features(sample.get("landmark_sequence"))
        if not code or not participant or sequence is None:
            continue
        features.append(sequence)
        labels.append(code)
        participants.append(participant)
        label_names[code] = str(sample.get("label_name") or code)
    if not features:
        raise ValueError("No hay secuencias aprobadas válidas para entrenar.")
    return PreparedDataset(np.stack(features), np.asarray(labels), np.asarray(participants), label_names)


def validate_coverage(dataset: PreparedDataset, minimum_samples: int, minimum_participants: int) -> None:
    sample_counts = Counter(dataset.labels.tolist())
    participant_counts: dict[str, set[str]] = defaultdict(set)
    for label, participant in zip(dataset.labels, dataset.participants):
        participant_counts[str(label)].add(str(participant))
    problems = []
    if "none" not in sample_counts:
        problems.append("falta la clase neutral 'none'")
    for label, count in sorted(sample_counts.items()):
        if count < minimum_samples:
            problems.append(f"{label}: {count}/{minimum_samples} muestras")
        people = len(participant_counts[label])
        if people < minimum_participants:
            problems.append(f"{label}: {people}/{minimum_participants} participantes")
    if problems:
        raise ValueError("Cobertura insuficiente; no se publicará el modelo:\n- " + "\n- ".join(problems))

