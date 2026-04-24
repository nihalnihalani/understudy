"""Make `apps/synthesis-worker/` importable as `synthesis_worker` for tests.

The directory lives under a hyphenated path (`apps/synthesis-worker`) to match the
scaffold layout used across the repo; Python doesn't allow hyphens in module names,
so we path-inject for tests. The main entrypoint is still runnable via
`python apps/synthesis-worker/main.py`.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_WORKER_DIR = _REPO_ROOT / "apps" / "synthesis-worker"
if str(_WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(_WORKER_DIR))
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
