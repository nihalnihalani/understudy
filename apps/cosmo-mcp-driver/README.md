# apps/cosmo-mcp-driver — Headless Cosmo MCP wrapper

Runs Cosmo MCP CLI as a stdio server from the synthesis pipeline (architecture.md §7). Exposes:

- `dream_query(desired_operation)` — inverts the "what schema must exist?" problem; returns SDL delta + resolver stubs + live-traffic breaking-change report (architecture.md §4).
- `propose_subgraph(sdl_delta)` — runs `schema_change_proposal_workflow`, registers the subgraph, binds EDFS topics.

When `COSMO_MOCK=true`, returns canned responses so the synthesizer can run offline.

Owner task: **#4 — Build Cosmo MCP driver**.
