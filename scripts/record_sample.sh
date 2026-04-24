#!/usr/bin/env bash
# Capture a 60s demo-workflow screen recording for offline synthesis testing.
# Produces fixtures/demo.mp4 — the one mp4 the .gitignore allow-lists.
set -euo pipefail

out="${1:-fixtures/demo.mp4}"
mkdir -p "$(dirname "${out}")"

# TODO(task #11): use ffmpeg avfoundation (macOS) / x11grab (linux) for a 60s capture.
echo "TODO(task #11): record 60s → ${out}"
