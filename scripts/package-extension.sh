#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

python3 - <<'PY'
import json
import zipfile
from pathlib import Path

root = Path.cwd()
version = json.loads((root / "manifest.json").read_text())["version"]
dist_dir = root / "dist"
dist_dir.mkdir(exist_ok=True)

archive_path = dist_dir / f"ra-to-calendar-v{version}.zip"
include_paths = ["manifest.json", "LICENSE", "content", "popup", "icons", "lib"]

with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in include_paths:
        path = root / name
        files = sorted(path.rglob("*")) if path.is_dir() else [path]
        for file_path in files:
            if file_path.is_file() and not file_path.name.startswith("."):
                archive.write(file_path, file_path.relative_to(root))

print(f"Created {archive_path.relative_to(root)}")
PY
