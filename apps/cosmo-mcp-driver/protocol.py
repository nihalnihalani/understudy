"""Transport-neutral protocol for the Cosmo MCP tool surface.

Both `CosmoStdioMCP` (talks to `wgc` over stdio) and `CosmoCloudMCP` (talks to the Cosmo
Cloud MCP Gateway over HTTPS) implement this. The driver in `driver.py` depends only on
the protocol, so swapping transports is a one-line change — and `COSMO_MOCK=1` plugs in
`CosmoMockMCP` without touching any call site.

Tool names mirror Cosmo MCP's published surface (architecture.md §4):

- `dream_query` — invert schema synthesis: *"here is the query the agent wants to run,
   tell me what SDL has to exist"*
- `validate_against_live_traffic` — run the traffic validator over a proposed SDL delta
- `schema_change_proposal_workflow` — propose → compose → publish the subgraph version
- `register_edfs_events` — bind EDFS Kafka/NATS topics for event-driven resolver fields
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class CosmoMCPClient(Protocol):
    """Minimum tool-call surface the driver needs from any Cosmo MCP transport."""

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Invoke a Cosmo MCP tool by name and return its structured JSON result."""
        ...

    async def close(self) -> None:
        """Tear down the underlying transport (stdio subprocess or HTTP session)."""
        ...
