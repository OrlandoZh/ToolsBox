#!/usr/bin/env bash
set -euo pipefail

OLD_DIR="${1:-../src}"
NEW_DIR="${2:-./src}"

if [[ ! -d "$OLD_DIR" || ! -d "$NEW_DIR" ]]; then
  echo "Usage: bash scripts/similarity-check.sh <old_dir> <new_dir>"
  exit 1
fi

if command -v jscpd >/dev/null 2>&1; then
  echo "Running jscpd..."
  jscpd "$OLD_DIR" "$NEW_DIR"
  exit $?
fi

echo "jscpd not found. Installing globally is optional."
echo "Manual fallback:"
echo "1) Compare folder-level diffs: git diff --no-index $OLD_DIR $NEW_DIR"
echo "2) Search suspicious long identical lines with your editor"
