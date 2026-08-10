"""Export approved LSD landmark sequences from Supabase without downloading videos."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import requests


def export_dataset(output: Path) -> int:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not service_key:
        raise SystemExit("Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY como secretos del entorno.")

    endpoint = f"{url}/rest/v1/sign_recordings"
    params = {
        "select": "id,participant_id,landmark_sequence,duration_ms,frame_count,camera_facing,created_at,sign_labels!inner(code,display_name,variant)",
        "status": "eq.approved",
        "sign_labels.variant": "eq.LSD",
        "order": "created_at.asc",
    }
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    response = requests.get(endpoint, params=params, headers=headers, timeout=60)
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        raise SystemExit("Supabase no devolvió una lista de grabaciones.")

    samples = []
    for row in rows:
        label = row.pop("sign_labels", None) or {}
        samples.append({
            **row,
            "label_code": label.get("code"),
            "label_name": label.get("display_name"),
            "variant": label.get("variant"),
        })

    settings_response = requests.get(
        f"{url}/rest/v1/model_training_settings",
        params={"select": "*", "variant": "eq.LSD", "limit": "1"},
        headers=headers,
        timeout=30,
    )
    settings_response.raise_for_status()
    settings_rows = settings_response.json()
    settings = settings_rows[0] if isinstance(settings_rows, list) and settings_rows else {}

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"schemaVersion": 1, "settings": settings, "samples": samples}, ensure_ascii=False), encoding="utf-8")
    print(f"Exportadas {len(samples)} muestras LSD aprobadas a {output}")
    return len(samples)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("training/data/approved-lsd.json"))
    arguments = parser.parse_args()
    export_dataset(arguments.output)
