#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(python3 - <<'PY'
import json
from pathlib import Path

manifest = json.loads(Path("manifest.json").read_text())
print(manifest["version"])
PY
)"
ARCHIVE_NAME="ra-to-calendar-v${VERSION}.zip"
ARCHIVE_PATH="$DIST_DIR/$ARCHIVE_NAME"

mkdir -p "$DIST_DIR"
rm -f "$ARCHIVE_PATH"

cd "$ROOT_DIR"

zip -r "$ARCHIVE_PATH" \
  manifest.json \
  README.md \
  LICENSE \
  content \
  popup \
  icons \
  -x '*.git*' \
  -x 'dist/*' \
  -x 'scripts/*' \
  -x '.github/*'

echo "Created $ARCHIVE_PATH"

