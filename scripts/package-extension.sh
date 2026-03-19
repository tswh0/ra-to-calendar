#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

python3 - <<'PY'
import json
import zipfile
from pathlib import Path

root = Path.cwd()
manifest = json.loads((root / "manifest.json").read_text())
version = manifest["version"]
dist_dir = root / "dist"
dist_dir.mkdir(exist_ok=True)

archive_path = dist_dir / f"ra-to-calendar-v{version}.zip"
include_paths = [
    root / "manifest.json",
    root / "README.md",
    root / "LICENSE",
    root / "content",
    root / "popup",
    root / "icons",
]

with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in include_paths:
        if path.is_dir():
            for file_path in sorted(path.rglob("*")):
                if file_path.is_file():
                    archive.write(file_path, file_path.relative_to(root))
        elif path.is_file():
            archive.write(path, path.relative_to(root))

print(f"Created {archive_path}")
PY
