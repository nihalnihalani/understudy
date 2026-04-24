"""Top-level convenience exports for the Cosmo MCP driver.

Kept for backwards compatibility with callers that import from `main` directly (the
pre-task-#4 placeholder exposed `dream_query` and `propose_subgraph` here). New code
should import `CosmoDreamQuery` from `apps.cosmo_mcp_driver.driver`.
"""

from __future__ import annotations

from typing import Any

try:
    from .driver import (
        BreakingChangeReport,
        CosmoDreamQuery,
        SDLDelta,
        SubgraphVersion,
        TopicBindings,
    )
except ImportError:  # pragma: no cover — direct-script execution fallback
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from driver import (  # type: ignore[no-redef]
        BreakingChangeReport,
        CosmoDreamQuery,
        SDLDelta,
        SubgraphVersion,
        TopicBindings,
    )


async def dream_query(desired_operation: str, run_id: str = "ad-hoc") -> dict[str, Any]:
    """Legacy shim — prefer `CosmoDreamQuery(run_id).dream_query(...)`."""
    async with CosmoDreamQuery(run_id=run_id) as dq:
        delta = await dq.dream_query(desired_operation)
        return delta.to_dict()


async def propose_subgraph(sdl_delta: str, subgraph_name: str = "ad-hoc") -> dict[str, Any]:
    """Legacy shim — prefer `CosmoDreamQuery(run_id).propose_schema_change(...)`."""
    async with CosmoDreamQuery(run_id=f"propose-{subgraph_name}") as dq:
        version = await dq.propose_schema_change(sdl_delta, subgraph_name)
        return version.to_dict()


__all__ = [
    "BreakingChangeReport",
    "CosmoDreamQuery",
    "SDLDelta",
    "SubgraphVersion",
    "TopicBindings",
    "dream_query",
    "propose_subgraph",
]
