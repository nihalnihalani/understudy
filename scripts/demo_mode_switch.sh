#!/usr/bin/env bash
# Flip the running synthesis API between live / replay / hybrid without redeploying.
# Architecture.md §14 (Hermetic Demo Mode).
set -euo pipefail

mode="${1:-live}"
case "${mode}" in
  live|replay|hybrid) ;;
  *) echo "usage: $0 {live|replay|hybrid}" >&2; exit 2 ;;
esac

# TODO(task #9): update DEMO_MODE env on Fly Machines + Mac Mini pool.
echo "TODO(task #9): set DEMO_MODE=${mode}"
