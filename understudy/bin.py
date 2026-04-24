"""Console-script entry points for the hyphenated `apps/` services.

`apps/synthesis-worker/` and `apps/cosmo-mcp-driver/` ship with hyphenated
directory names that match the repo-wide scaffold convention. Python cannot
import hyphen-named packages via the normal `python -m apps.synthesis_worker.main`
path, so this module provides thin entry-point wrappers that inject the
relevant directory onto `sys.path` before dispatching.

Registered as console scripts in pyproject.toml `[project.scripts]`, which
gives operators stable commands (`understudy-synthesis-worker`,
`understudy-cosmo-driver`) and keeps the README/compose invocations short.

Why entry points over a directory rename: the hyphenated names are referenced
in architecture.md, docs/deployment.md, docker-compose.yml, and every engineer's
README. Renaming requires coordinated edits across the team; entry points
achieve the same CLI ergonomics with one localized change.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parent.parent
_SYNTH_WORKER_DIR = _REPO_ROOT / "apps" / "synthesis-worker"
_COSMO_DRIVER_DIR = _REPO_ROOT / "apps" / "cosmo-mcp-driver"


def synthesis_worker_main() -> None:
    """Run the synthesis worker loop (`understudy-synthesis-worker`)."""
    if str(_SYNTH_WORKER_DIR) not in sys.path:
        sys.path.insert(0, str(_SYNTH_WORKER_DIR))
    from main import run_worker  # type: ignore[import-not-found]

    asyncio.run(run_worker())


def cosmo_driver_main() -> int:
    """Run the Cosmo MCP driver CLI (`understudy-cosmo-driver`)."""
    if str(_COSMO_DRIVER_DIR) not in sys.path:
        sys.path.insert(0, str(_COSMO_DRIVER_DIR))
    from cli import main  # type: ignore[import-not-found]

    return int(main() or 0)
