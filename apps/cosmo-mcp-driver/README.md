# apps/cosmo-mcp-driver — Headless Cosmo MCP wrapper

Runs Cosmo MCP as a headless driver from the synthesis pipeline (architecture.md §4 & §7). This is **the core loop** of Understudy — Cosmo Dream Query inverts schema synthesis exactly the way we need it inverted.

## Surface

`CosmoDreamQuery` exposes four methods, one per Cosmo MCP tool:

| Method | MCP tool | Returns |
|---|---|---|
| `dream_query(desired_operation)` | `dream_query` | `SDLDelta { sdl_delta, resolver_stubs, confidence }` |
| `validate_against_live_traffic(sdl_delta)` | `validate_against_live_traffic` | `BreakingChangeReport { has_breaking_changes, affected_clients, severity }` |
| `propose_schema_change(sdl_delta, subgraph_name)` | `schema_change_proposal_workflow` | `SubgraphVersion { subgraph_id, version, composition_check }` |
| `register_edfs_events(fields)` | `register_edfs_events` | `TopicBindings` |

Every `dream_query` result lands in Redis under `dream:{run_id}` per architecture.md §9 keyspace.

## Transports

Two concrete implementations of the tiny `CosmoMCPClient` protocol:

- **`CosmoStdioMCP`** — shells out to `wgc mcp serve --stdio`, line-delimited JSON-RPC. Preferred.
- **`CosmoCloudMCP`** — HTTPS JSON-RPC against `COSMO_CLOUD_MCP_URL`. Fallback when stdio isn't available.

Selection is env-driven:

- `COSMO_MOCK=1` → `CosmoMockMCP` (fixture-backed, offline, hermetic demo)
- `COSMO_TRANSPORT=cloud` → `CosmoCloudMCP`
- default → `CosmoStdioMCP`

## CLI (used on stage — architecture.md §15 1:20-1:40)

```bash
python -m apps.cosmo_mcp_driver dream "export yesterday's orders as CSV"
python -m apps.cosmo_mcp_driver register \
  --subgraph-name agent_orders_exporter \
  --sdl apps/cosmo-router/subgraphs/agent_orders_exporter.graphql \
  --edfs-fields productUpdated
```

`dream` prints a colored SDL diff + a `traffic validator: PASS (0 breaking changes vs 4,200 client ops)` line.

`register` writes the SDL to `apps/cosmo-router/subgraphs/<name>.graphql` (picked up by the router, task #6) and prints a green `composition OK` confirmation.

Bearer tokens are never echoed — we own architecture.md §18 risk #2 honestly.

## Fixtures (`fixtures/cosmo/`)

- `orders-query.json` — query-shape SDL, used by the demo's "export orders" beat
- `products-mutation.json` — mutation + EDFS subscription, exercises `@edfs__kafkaPublish`

Owner task: **#4 — Build Cosmo MCP driver**.
