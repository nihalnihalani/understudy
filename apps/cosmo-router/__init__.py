"""Federation gateway exposing all generated agents through one Cosmo supergraph (architecture.md §7)."""

from .main import (
    CONFIG_PATH,
    ROUTER_DIR,
    SUBGRAPHS_DIR,
    SUPERGRAPH_PATH,
    load_supergraph,
    registered_subgraphs,
    router_base_url,
    studio_url,
)

__all__ = [
    "CONFIG_PATH",
    "ROUTER_DIR",
    "SUBGRAPHS_DIR",
    "SUPERGRAPH_PATH",
    "load_supergraph",
    "registered_subgraphs",
    "router_base_url",
    "studio_url",
]
