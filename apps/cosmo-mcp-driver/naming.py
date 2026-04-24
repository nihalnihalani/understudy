"""Subgraph naming contract shared with the Cosmo router (task #6).

Single source of truth for:

- the regex `wgc subgraph create --name` accepts (`[a-z][a-z0-9_]*`)
- names the router pre-provisions as demo seeds, which the driver must not clobber
- the docker-network routing-URL default (`http://{name}:4001/graphql`)

The router's `scripts/register_agent_subgraph.sh` enforces the same regex — the driver
validates up front so we fail before touching disk or MCP, not after.
"""

from __future__ import annotations

import re

_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")

# Seeded by the router (task #6) as demo fixtures — architecture.md §7 references all
# three. The driver must never overwrite a `.graphql` file for any of these.
RESERVED_SUBGRAPH_NAMES: frozenset[str] = frozenset({"agent_alpha", "agent_beta", "agent_gamma"})


class InvalidSubgraphName(ValueError):
    """Raised when a subgraph name fails the Cosmo naming contract."""


def validate_subgraph_name(name: str) -> None:
    """Raise `InvalidSubgraphName` if `name` doesn't match `[a-z][a-z0-9_]*` or is reserved."""
    if not _NAME_RE.match(name):
        raise InvalidSubgraphName(
            f"invalid subgraph name {name!r}: must match [a-z][a-z0-9_]*"
        )
    if name in RESERVED_SUBGRAPH_NAMES:
        raise InvalidSubgraphName(
            f"subgraph name {name!r} is reserved by the router's demo fixtures"
        )


def default_routing_url(subgraph_name: str) -> str:
    """Docker-compose network default — each agent serves `/graphql` on port 4001."""
    return f"http://{subgraph_name}:4001/graphql"
