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
HAND_FEATURES = LANDMARKS_PER_HAND * COORDINATES
BASE_FEATURE_COUNT = HAND_FEATURES * MAX_HANDS + MAX_HANDS
MOTION_FEATURES_PER_HAND = 6  # desplazamiento xyz + velocidad xyz
INTER_HAND_FEATURES = 4  # vector xyz + distancia entre muñecas
POSE_SOURCE_INDICES = (0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 23, 24)
POSE_POINT_COUNT = len(POSE_SOURCE_INDICES) + 2  # cuello y pecho derivados
POSE_FEATURES = POSE_POINT_COUNT * COORDINATES + 1
HAND_BODY_FEATURES = 9  # muñeca xyz relativa al pecho + seis distancias anatómicas
BODY_CONTEXT_FEATURES = POSE_FEATURES + HAND_BODY_FEATURES * MAX_HANDS
FEATURE_COUNT = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS + INTER_HAND_FEATURES + BODY_CONTEXT_FEATURES
FEATURE_CONTRACT = "lsd-body-v3"


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


def normalize_hand(hand: Any) -> tuple[np.ndarray, np.ndarray, float] | None:
    if not isinstance(hand, list) or len(hand) < LANDMARKS_PER_HAND:
        return None
    points = np.stack([_point(point) for point in hand[:LANDMARKS_PER_HAND]])
    wrist = points[0].copy()
    palm_size = float(np.linalg.norm(points[9] - wrist))
    if palm_size < 1e-4:
        return None
    normalized = np.clip((points - wrist) / palm_size, -4.0, 4.0)
    return normalized.reshape(-1).astype(np.float32), wrist, palm_size


def frame_entries(frame: Any) -> list[tuple[float, np.ndarray, np.ndarray, float]]:
    hands = frame.get("hands", []) if isinstance(frame, dict) else []
    handedness = frame.get("handedness", []) if isinstance(frame, dict) else []
    entries = []
    for index, hand in enumerate(hands[:MAX_HANDS]):
        hand_data = normalize_hand(hand)
        if hand_data is None:
            continue
        normalized, wrist, palm_size = hand_data
        side = str(handedness[index]).lower() if index < len(handedness) else ""
        wrist_x = float(hand[0].get("x", 0)) if hand and isinstance(hand[0], dict) else 0.0
        order = 0 if side == "left" else 1 if side == "right" else wrist_x
        entries.append((order, normalized, wrist, palm_size))
    entries.sort(key=lambda item: item[0])
    return entries[:MAX_HANDS]


def normalize_pose(frame: Any) -> tuple[np.ndarray, np.ndarray, float, list[np.ndarray]] | None:
    pose = frame.get("pose", []) if isinstance(frame, dict) else []
    if not isinstance(pose, list) or len(pose) < 25:
        return None
    points = [_point(point) for point in pose]
    left_shoulder, right_shoulder = points[11], points[12]
    shoulder_scale = float(np.linalg.norm(left_shoulder - right_shoulder))
    if shoulder_scale < 0.02:
        return None
    neck = (left_shoulder + right_shoulder) / 2.0
    hips = (points[23] + points[24]) / 2.0
    chest = neck * 0.65 + hips * 0.35
    selected = [points[index] for index in POSE_SOURCE_INDICES] + [neck, chest]
    normalized = np.clip((np.stack(selected) - chest) / shoulder_scale, -6.0, 6.0).reshape(-1).astype(np.float32)
    mouth = (points[9] + points[10]) / 2.0
    anchors = [points[0], mouth, neck, chest, left_shoulder, right_shoulder]
    return normalized, chest, shoulder_scale, anchors


def encode_motion_sequence(frames: list[Any]) -> np.ndarray:
    result = np.zeros((len(frames), FEATURE_COUNT), dtype=np.float32)
    anchors: list[tuple[np.ndarray, float] | None] = [None] * MAX_HANDS
    previous_displacements: list[np.ndarray | None] = [None] * MAX_HANDS
    for frame_index, frame in enumerate(frames):
        entries = frame_entries(frame)
        for slot, (_, values, wrist, palm_size) in enumerate(entries):
            start = slot * HAND_FEATURES
            result[frame_index, start:start + HAND_FEATURES] = values
            result[frame_index, HAND_FEATURES * MAX_HANDS + slot] = 1.0
            if anchors[slot] is None:
                anchors[slot] = (wrist.copy(), palm_size)
            anchor_wrist, anchor_scale = anchors[slot]
            displacement = np.clip((wrist - anchor_wrist) / max(anchor_scale, 1e-4), -6.0, 6.0)
            previous = previous_displacements[slot]
            velocity = np.zeros(3, dtype=np.float32) if previous is None else np.clip(displacement - previous, -3.0, 3.0)
            motion_start = BASE_FEATURE_COUNT + slot * MOTION_FEATURES_PER_HAND
            result[frame_index, motion_start:motion_start + 3] = displacement
            result[frame_index, motion_start + 3:motion_start + 6] = velocity
            previous_displacements[slot] = displacement
        if len(entries) == 2:
            first_wrist, first_scale = entries[0][2], entries[0][3]
            second_wrist, second_scale = entries[1][2], entries[1][3]
            scale = max((first_scale + second_scale) / 2.0, 1e-4)
            vector = np.clip((second_wrist - first_wrist) / scale, -6.0, 6.0)
            relation_start = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS
            result[frame_index, relation_start:relation_start + 3] = vector
            result[frame_index, relation_start + 3] = min(8.0, float(np.linalg.norm(vector)))
        pose_data = normalize_pose(frame)
        if pose_data is not None:
            pose_values, chest, body_scale, body_anchors = pose_data
            pose_start = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS + INTER_HAND_FEATURES
            result[frame_index, pose_start:pose_start + POSE_POINT_COUNT * COORDINATES] = pose_values
            result[frame_index, pose_start + POSE_POINT_COUNT * COORDINATES] = 1.0
            for slot, (_, _, wrist, _) in enumerate(entries):
                start = pose_start + POSE_FEATURES + slot * HAND_BODY_FEATURES
                wrist_relative = np.clip((wrist - chest) / body_scale, -8.0, 8.0)
                distances = [min(12.0, float(np.linalg.norm((wrist - anchor) / body_scale))) for anchor in body_anchors]
                result[frame_index, start:start + HAND_BODY_FEATURES] = np.concatenate((wrist_relative, np.asarray(distances, dtype=np.float32)))
    return result


def sequence_features(frames: Any) -> np.ndarray | None:
    if not isinstance(frames, list) or not frames:
        return None
    visible_frames = [frame for frame in frames if frame_entries(frame)]
    if len(visible_frames) < 8:
        return None
    # Math.floor(x + .5) coincide con Math.round del navegador, incluso en empates.
    indexes = np.floor(np.linspace(0, len(visible_frames) - 1, SEQUENCE_LENGTH) + 0.5).astype(int)
    sampled_frames = [visible_frames[index] for index in indexes]
    return encode_motion_sequence(sampled_frames)


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
