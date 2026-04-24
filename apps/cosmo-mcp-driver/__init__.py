"""Headless Cosmo MCP driver — Dream Query + schema_change_proposal_workflow (architecture.md §4, §7).

Public surface:

- `CosmoDreamQuery` — driver class with `dream_query`, `validate_against_live_traffic`,
  `propose_schema_change`, and `register_edfs_events`
- `CosmoStdioMCP` / `CosmoCloudMCP` / `CosmoMockMCP` — swappable transports
- `CosmoMCPClient` — the protocol both transports satisfy

CLI: `python -m apps.cosmo_mcp_driver dream "..."` / `register --subgraph-name ... --sdl ...`
"""

from __future__ import annotations

try:
    from .clients import CosmoCloudMCP, CosmoMockMCP, CosmoStdioMCP
    from .driver import (
        BreakingChangeReport,
        CosmoDreamQuery,
        SDLDelta,
        SubgraphVersion,
        TopicBindings,
    )
    from .naming import (
        RESERVED_SUBGRAPH_NAMES,
        InvalidSubgraphName,
        default_routing_url,
        validate_subgraph_name,
    )
    from .protocol import CosmoMCPClient
except ImportError:  # pragma: no cover — direct-script execution fallback
    pass

__all__ = [
    "BreakingChangeReport",
    "CosmoCloudMCP",
    "CosmoDreamQuery",
    "CosmoMCPClient",
    "CosmoMockMCP",
    "CosmoStdioMCP",
    "InvalidSubgraphName",
    "RESERVED_SUBGRAPH_NAMES",
    "SDLDelta",
    "SubgraphVersion",
    "TopicBindings",
    "default_routing_url",
    "validate_subgraph_name",
]
