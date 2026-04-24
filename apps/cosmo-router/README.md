# apps/cosmo-router — Federation gateway

Wundergraph Cosmo Router serving the composed supergraph across every generated agent's subgraph (architecture.md §2, §7). Each `dream_query` + `schema_change_proposal_workflow` cycle publishes a new subgraph; this router exposes the unified GraphQL surface.

The router binary itself comes from the upstream `ghcr.io/wundergraph/cosmo-router` image. This directory holds the config template + registration logic.

Owner task: **#6 — Build Cosmo router federation gateway**.
