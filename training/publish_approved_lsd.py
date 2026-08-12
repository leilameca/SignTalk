"""Publish the approved LSD dataset by exporting and training a new model."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    missing = [name for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.getenv(name)]
    if missing:
        print("Faltan variables de entorno para publicar el modelo LSD:", ", ".join(missing))
        print("Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de ejecutar este comando.")
        return 1

    steps = [
        [sys.executable, str(root / "training" / "backfill_body_landmarks.py")],
        [sys.executable, str(root / "training" / "export_dataset.py")],
        [sys.executable, str(root / "training" / "train.py")],
    ]

    for command in steps:
        print("->", " ".join(command))
        completed = subprocess.run(command, cwd=root)
        if completed.returncode != 0:
            return completed.returncode

    print("Modelo LSD publicado en public/models/lsd/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
