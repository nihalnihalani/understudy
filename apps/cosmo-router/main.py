"""Router config helpers.

The router process itself is the upstream Cosmo binary
(`ghcr.io/wundergraph/cosmo-router`) — see docker-compose.yml. This module
exposes the paths other services rely on (config.yaml, supergraph.json,
subgraphs directory) and a tiny loader so Python callers (tests, the
cosmo-mcp-driver) can inspect current state without shelling out.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

ROUTER_DIR = Path(__file__).resolve().parent
CONFIG_PATH = ROUTER_DIR / "config.yaml"
SUPERGRAPH_PATH = ROUTER_DIR / "supergraph.json"
SUBGRAPHS_DIR = ROUTER_DIR / "subgraphs"


def router_base_url() -> str:
    """Host-visible URL of the router — set via COSMO_ROUTER_URL in .env."""
    return os.environ.get("COSMO_ROUTER_URL", "http://localhost:4000")


def studio_url() -> str:
    """Cosmo Studio URL surfaced to the frontend (architecture.md §7 demo)."""
    return os.environ.get("STUDIO_URL", "https://cosmo.wundergraph.com/studio")


def load_supergraph() -> dict[str, object]:
    """Return the composed supergraph.json currently on disk.

    Raises FileNotFoundError if composition hasn't run yet —
    `apps/cosmo-router/compose_supergraph.sh` is the writer.
    """
    return json.loads(SUPERGRAPH_PATH.read_text())


def registered_subgraphs() -> list[str]:
    """Names of every subgraph currently part of the supergraph."""
    return [sg["name"] for sg in load_supergraph().get("subgraphs", [])]
