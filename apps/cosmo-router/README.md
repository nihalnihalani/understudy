# apps/cosmo-router — Federation gateway

Wundergraph Cosmo Router exposing the composed supergraph across every generated agent's subgraph (architecture.md §2, §7). Each `dream_query` + `schema_change_proposal_workflow` cycle publishes a new subgraph; this router serves the unified GraphQL surface on :4000.

The router binary itself is the upstream `ghcr.io/wundergraph/cosmo-router` image; this directory holds the config template, the seed supergraph, composition tooling, and demo subgraph fixtures.

## Layout

```
apps/cosmo-router/
├── config.yaml                 # router config (EDFS, OAuth, supergraph polling)
├── supergraph.json             # composed supergraph the router polls
├── compose_supergraph.sh       # composes supergraph.json from subgraphs/
├── studio_embed.html           # iframe fragment for the frontend (task #10)
├── subgraphs/
│   ├── agent_alpha.graphql     # seed fixture — order export demo
│   └── agent_beta.graphql      # seed fixture — lead enrichment demo
└── scripts/
    └── offline_compose.py      # fallback composer when wgc is unavailable
```

`scripts/register_agent_subgraph.sh` (at the repo root) is the script the Cosmo MCP driver (apps/cosmo-mcp-driver/) invokes at the end of Dream Query to publish a new agent's subgraph.

## Running

```bash
docker compose up cosmo-router
# once healthy (auth currently disabled — see Config highlights below):
curl -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{__schema{types{name}}}"}'
```

## Registering a new agent's subgraph

```bash
scripts/register_agent_subgraph.sh \
  --name agent_gamma \
  --sdl path/to/gamma.graphql \
  --routing-url http://agent_gamma:4001/graphql
```

The script runs `wgc subgraph create` + `wgc subgraph publish` when `COSMO_API_KEY` is set, then re-runs `compose_supergraph.sh` so the router's on-disk supergraph picks up the new subgraph within the 5s poll interval.

Offline fallback: if `wgc` is missing or `COSMO_API_KEY` is unset, cloud registration is skipped and only local composition runs — preserves the hackathon demo path.

## Config highlights

- **Supergraph polling** — `execution_config.file` watches `supergraph.json` every 5s.
- **Auth** — currently disabled (`authorization.require_authentication: false` in `config.yaml`). InsForge 2.0 moved to API-key auth; the original OAuth/JWKS provider is obsolete. Re-introduce here once the production token-issuer is decided (per-agent InsForge API keys, Clerk, Auth0, etc.).
- **EDFS** — Kafka (`EDFS_KAFKA_*`) and NATS (`EDFS_NATS_*`) providers both configured so Dream Query's `register_edfs_events` step can choose per topic.
- **Secrets via env only** — every credential is `${VAR}` substitution; never write secrets into `config.yaml`.

## Cosmo Studio embed

`studio_embed.html` is a small iframe fragment the frontend drops into the generated-agent dashboard. The frontend substitutes `__STUDIO_URL__` with `process.env.NEXT_PUBLIC_STUDIO_URL` (sourced from the root `.env` `STUDIO_URL` variable). See task #10.

Owner task: **#6 — Build Cosmo router federation gateway**.
