"""Train, evaluate and publish a small browser-ready LSD sequence model."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import tensorflow as tf
import tensorflowjs as tfjs
from sklearn.metrics import classification_report, confusion_matrix, f1_score, recall_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.utils.class_weight import compute_class_weight

from preprocess import BASE_FEATURE_COUNT, FEATURE_CONTRACT, FEATURE_COUNT, INTER_HAND_FEATURES, MOTION_FEATURES_PER_HAND, MAX_HANDS, POSE_POINT_COUNT, COORDINATES, SEQUENCE_LENGTH, prepare_dataset, validate_coverage


def split_by_participant(features, labels, groups, seed: int):
    outer = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    train_val, test = next(outer.split(features, labels, groups))
    inner = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed + 1)
    train_relative, validation_relative = next(inner.split(features[train_val], labels[train_val], groups[train_val]))
    return train_val[train_relative], train_val[validation_relative], test


def build_model(class_count: int) -> tf.keras.Model:
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(SEQUENCE_LENGTH, FEATURE_COUNT)),
        tf.keras.layers.Masking(mask_value=0.0),
        tf.keras.layers.GRU(64),
        tf.keras.layers.Dropout(0.25),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.25),
        tf.keras.layers.Dense(class_count, activation="softmax"),
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def augment_startup(features: np.ndarray, labels: np.ndarray, copies: int = 16):
    augmented_features, augmented_labels = [features], [labels]
    local_coordinate_width = BASE_FEATURE_COUNT - 2
    for _ in range(copies - 1):
        candidate = features.copy()
        visible = candidate[:, :, local_coordinate_width:BASE_FEATURE_COUNT].sum(axis=2, keepdims=True) > 0
        local_noise = np.random.normal(0, 0.018, size=candidate[:, :, :local_coordinate_width].shape).astype(np.float32)
        candidate[:, :, :local_coordinate_width] += local_noise * visible
        motion_noise = np.random.normal(0, 0.012, size=candidate[:, :, BASE_FEATURE_COUNT:].shape).astype(np.float32)
        candidate[:, :, BASE_FEATURE_COUNT:] += motion_noise * visible
        shift = np.random.randint(-2, 3)
        candidate = np.roll(candidate, shift, axis=1)
        augmented_features.append(candidate)
        augmented_labels.append(labels)
    return np.concatenate(augmented_features), np.concatenate(augmented_labels)


def main(arguments) -> None:
    np.random.seed(arguments.seed)
    tf.random.set_seed(arguments.seed)
    payload = json.loads(arguments.input.read_text(encoding="utf-8"))
    dataset = prepare_dataset(payload)
    settings = payload.get("settings") or {}
    minimum_samples = arguments.minimum_samples if arguments.minimum_samples is not None else int(settings.get("minimum_samples", 1))
    minimum_participants = arguments.minimum_participants if arguments.minimum_participants is not None else int(settings.get("minimum_participants", 1))
    minimum_f1 = arguments.minimum_f1 if arguments.minimum_f1 is not None else float(settings.get("minimum_macro_f1", 0.70))
    minimum_recall = arguments.minimum_recall if arguments.minimum_recall is not None else float(settings.get("minimum_class_recall", 0.45))
    confidence_threshold = float(settings.get("confidence_threshold", 0.68))
    allow_experimental = bool(settings.get("allow_experimental", False))
    validate_coverage(dataset, minimum_samples, minimum_participants)

    label_codes = sorted(set(dataset.labels.tolist()))
    label_to_index = {label: index for index, label in enumerate(label_codes)}
    encoded_labels = np.asarray([label_to_index[label] for label in dataset.labels], dtype=np.int32)
    participant_count = len(set(dataset.participants.tolist()))
    participants_by_label: dict[int, set[str]] = defaultdict(set)
    for label, participant in zip(encoded_labels.tolist(), dataset.participants.tolist()):
        participants_by_label[int(label)].add(str(participant))
    minimum_label_participants = min(len(participants) for participants in participants_by_label.values())
    # A participant holdout is valid only when every class has enough different
    # people. The total participant count alone is insufficient for new labels.
    experimental = participant_count < 3 or min(np.bincount(encoded_labels)) < 3 or minimum_label_participants < 3
    if experimental and not allow_experimental:
        raise SystemExit("Los datos requieren modo experimental, pero el panel lo tiene desactivado.")
    if experimental:
        train = validation = test = np.arange(len(dataset.features))
        training_features, training_labels = augment_startup(dataset.features, encoded_labels)
    else:
        train, validation, test = split_by_participant(dataset.features, encoded_labels, dataset.participants, arguments.seed)
        for name, indexes in (("entrenamiento", train), ("validación", validation), ("prueba", test)):
            missing = set(range(len(label_codes))) - set(encoded_labels[indexes].tolist())
            if missing:
                raise SystemExit(f"La división de {name} no contiene: {', '.join(label_codes[index] for index in sorted(missing))}. Reúne más participantes.")
        training_features, training_labels = dataset.features[train], encoded_labels[train]

    weights = compute_class_weight(class_weight="balanced", classes=np.arange(len(label_codes)), y=training_labels)
    model = build_model(len(label_codes))
    monitor = "loss" if experimental else "val_loss"
    callbacks = [tf.keras.callbacks.EarlyStopping(monitor=monitor, patience=12, restore_best_weights=True), tf.keras.callbacks.ReduceLROnPlateau(monitor=monitor, patience=5, factor=0.5, min_lr=1e-5)]
    model.fit(
        training_features, training_labels,
        validation_data=None if experimental else (dataset.features[validation], encoded_labels[validation]),
        epochs=arguments.epochs,
        batch_size=min(arguments.batch_size, len(train)),
        class_weight={index: float(weight) for index, weight in enumerate(weights)},
        callbacks=callbacks,
        verbose=2,
    )

    probabilities = model.predict(dataset.features[test], verbose=0)
    predictions = probabilities.argmax(axis=1)
    macro_f1 = float(f1_score(encoded_labels[test], predictions, average="macro"))
    per_class_recall = recall_score(encoded_labels[test], predictions, average=None, labels=np.arange(len(label_codes)), zero_division=0)
    pose_presence_index = BASE_FEATURE_COUNT + MOTION_FEATURES_PER_HAND * MAX_HANDS + INTER_HAND_FEATURES + POSE_POINT_COUNT * COORDINATES
    body_context_samples = int(np.sum(np.max(dataset.features[:, :, pose_presence_index], axis=1) > 0))
    report = {
        "macroF1": macro_f1,
        "minimumClassRecall": float(per_class_recall.min()),
        "testSamples": int(len(test)),
        "participants": int(len(set(dataset.participants.tolist()))),
        "minimumParticipantsPerClass": minimum_label_participants,
        "samples": int(len(dataset.features)),
        "bodyContextSamples": body_context_samples,
        "evaluationMode": "experimental-resubstitution" if experimental else "participant-holdout",
        "classification": classification_report(encoded_labels[test], predictions, target_names=label_codes, output_dict=True, zero_division=0),
        "confusionMatrix": confusion_matrix(encoded_labels[test], predictions, labels=np.arange(len(label_codes))).tolist(),
    }
    # Production thresholds are meaningful only with a participant holdout.
    # Experimental resubstitution metrics are reported, never presented as
    # generalization evidence, and are governed by allow_experimental instead.
    if not experimental and (macro_f1 < minimum_f1 or float(per_class_recall.min()) < minimum_recall):
        raise SystemExit(f"Modelo rechazado por calidad: macro F1={macro_f1:.3f}, recall mínimo={per_class_recall.min():.3f}.")

    with tempfile.TemporaryDirectory(prefix="signtalk-lsd-") as temporary:
        staging = Path(temporary) / "model"
        staging.mkdir()
        tfjs.converters.save_keras_model(model, str(staging))
        manifest = {
            "available": True,
            "version": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
            "variant": "LSD",
            "sequenceLength": SEQUENCE_LENGTH,
            "featureCount": FEATURE_COUNT,
            "featureContract": FEATURE_CONTRACT,
            "confidenceThreshold": confidence_threshold,
            "experimental": experimental,
            "evaluationMode": report["evaluationMode"],
            "labels": [{"code": code, "displayName": dataset.label_names.get(code, code)} for code in label_codes],
            "metrics": {"macroF1": macro_f1, "minimumClassRecall": float(per_class_recall.min()), "testSamples": len(test), "samples": len(dataset.features), "participants": participant_count, "minimumParticipantsPerClass": minimum_label_participants, "bodyContextSamples": body_context_samples},
            "trainedAt": datetime.now(timezone.utc).isoformat(),
        }
        (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        (staging / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if arguments.output.exists():
            shutil.rmtree(arguments.output)
        shutil.copytree(staging, arguments.output)
    print(f"Modelo LSD aprobado y publicado en {arguments.output}. Macro F1: {macro_f1:.3f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("training/data/approved-lsd.json"))
    parser.add_argument("--output", type=Path, default=Path("public/models/lsd"))
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--minimum-samples", type=int)
    parser.add_argument("--minimum-participants", type=int)
    parser.add_argument("--minimum-f1", type=float)
    parser.add_argument("--minimum-recall", type=float)
    parser.add_argument("--seed", type=int, default=20260810)
    try:
        main(parser.parse_args())
    except (SystemExit, ValueError) as error:
        message = str(error).lower()
        category = "experimental-disabled" if "modo experimental" in message \
            else "coverage" if "cobertura insuficiente" in message \
            else "participant-split" if "división" in message \
            else "quality-gate" if "rechazado por calidad" in message \
            else "data-validation"
        print(f"::error title=LSD training failed::category={category}; type={type(error).__name__}")
        raise SystemExit(1) from None
    except Exception as error:
        print(f"::error title=LSD training failed::category=runtime; type={type(error).__name__}")
        raise SystemExit(1) from None
