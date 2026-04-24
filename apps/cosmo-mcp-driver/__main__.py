"""Package entrypoint — `python -m apps.cosmo_mcp_driver ...` or direct script run.

Mirrors the hybrid-import pattern used by apps/synthesis-worker/main.py to cope with the
hyphenated directory name the repo ships today.
"""

from __future__ import annotations

try:
    from .cli import main
except ImportError:  # pragma: no cover — direct-script execution fallback
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from cli import main  # type: ignore[no-redef]


if __name__ == "__main__":
    raise SystemExit(main())
