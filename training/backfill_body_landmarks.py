"""Enrich every existing private recording with pose landmarks without discarding hand data."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from urllib.parse import quote

import cv2
import mediapipe as mp
import requests
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
CURRENT_STAGE = "startup"


def compact_pose(landmarks) -> list[dict[str, float]]:
    return [{
        "x": round(float(point.x), 4),
        "y": round(float(point.y), 4),
        "z": round(float(point.z), 4),
        "visibility": round(float(point.visibility or 0), 3),
    } for point in landmarks]


def enrich_sequence(video_path: Path, sequence: list[dict], landmarker: vision.PoseLandmarker) -> tuple[list[dict], int]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return sequence, 0
    enriched = []
    body_frames = 0
    previous_timestamp = -1
    try:
        for frame in sequence:
            timestamp = max(previous_timestamp + 1, int(frame.get("timestampMs", 0)))
            previous_timestamp = timestamp
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp)
            ok, image = capture.read()
            pose = []
            if ok:
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp)
                if result.pose_landmarks:
                    pose = compact_pose(result.pose_landmarks[0])
                    body_frames += 1
            enriched.append({**frame, "pose": pose})
    finally:
        capture.release()
    return enriched, body_frames


def main() -> int:
    global CURRENT_STAGE
    CURRENT_STAGE = "configuration"
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise SystemExit("Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.")
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    CURRENT_STAGE = "database-list"
    recordings = []
    page_size = 500
    while True:
        page_headers = {**headers, "Range": f"{len(recordings)}-{len(recordings) + page_size - 1}"}
        response = requests.get(
            f"{supabase_url}/rest/v1/sign_recordings",
            params={"select": "id,storage_path,status,landmark_sequence", "order": "created_at.asc"},
            headers=page_headers,
            timeout=60,
        )
        response.raise_for_status()
        page = response.json()
        recordings.extend(page)
        if len(page) < page_size:
            break

    pending = []
    for recording in recordings:
        sequence = recording.get("landmark_sequence") or []
        body_frames = sum(1 for frame in sequence if len(frame.get("pose") or []) >= 25)
        if body_frames < 8:
            pending.append(recording)
    if not pending:
        print(f"Las {len(recordings)} grabaciones existentes ya contienen contexto corporal.")
        return 0

    with tempfile.TemporaryDirectory(prefix="signtalk-body-backfill-") as temporary:
        CURRENT_STAGE = "pose-model-download"
        temporary_path = Path(temporary)
        model_path = temporary_path / "pose_landmarker_lite.task"
        model_response = requests.get(POSE_MODEL_URL, timeout=120)
        model_response.raise_for_status()
        model_path.write_bytes(model_response.content)
        CURRENT_STAGE = "pose-model-initialize"
        options = vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.45,
            min_tracking_confidence=0.45,
        )
        enriched_count = 0
        hand_only_count = 0
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            CURRENT_STAGE = "recording-processing"
            for index, recording in enumerate(pending, start=1):
                storage_path = str(recording.get("storage_path") or "")
                extension = Path(storage_path).suffix or ".webm"
                video_path = temporary_path / f"recording-{index}{extension}"
                object_url = f"{supabase_url}/storage/v1/object/sign-dataset/{quote(storage_path, safe='/')}"
                CURRENT_STAGE = "recording-download"
                video_response = requests.get(object_url, headers=headers, timeout=120)
                if not video_response.ok:
                    print(f"AVISO: una grabación no pudo descargarse ({video_response.status_code}); conserva sus manos.")
                    hand_only_count += 1
                    continue
                video_path.write_bytes(video_response.content)
                CURRENT_STAGE = "pose-extraction"
                sequence, body_frames = enrich_sequence(video_path, recording.get("landmark_sequence") or [], landmarker)
                if body_frames < 8:
                    print("AVISO: una grabación no muestra suficiente torso; seguirá aportando sus manos.")
                    hand_only_count += 1
                    video_path.unlink(missing_ok=True)
                    continue
                CURRENT_STAGE = "database-update"
                update = requests.patch(
                    f"{supabase_url}/rest/v1/sign_recordings",
                    params={"id": f"eq.{recording['id']}"},
                    headers={**headers, "Content-Type": "application/json", "Prefer": "return=minimal"},
                    json={"landmark_sequence": sequence},
                    timeout=60,
                )
                update.raise_for_status()
                enriched_count += 1
                video_path.unlink(missing_ok=True)
                print(f"Grabación enriquecida: {body_frames} fotogramas corporales.")
                CURRENT_STAGE = "recording-processing"
    print(f"Migración corporal: {enriched_count} enriquecidas, {hand_only_count} conservadas con manos, {len(recordings) - len(pending)} ya estaban listas.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as error:
        print(f"::error title=Body backfill failed::stage={CURRENT_STAGE}; type={type(error).__name__}")
        raise SystemExit(1) from None
