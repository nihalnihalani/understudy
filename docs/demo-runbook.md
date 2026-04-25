# Demo Runbook

The on-stage script for the 3-minute pitch. Beat-by-beat timing lives in architecture.md §15; this file is where each operator logs their cue-card.

## Pre-stage (T-24h)

1. Run `scripts/prewarm_demo.py` against prod Redis — seeds `us:replay:{synth_id}`, `langcache:gemini:{hash}`, `vset:agent:{id}:memory`, `dream:{run_id}` (architecture.md §14).
2. Verify `cosign verify` + `cosign verify-attestation --type slsaprovenance` both pass against the published agent base image.
3. Record `fixtures/demo.mp4` via `scripts/record_sample.sh` (60s Shopify orders filter + CSV export).
4. Flip `DEMO_MODE` to `hybrid` (live for first 8s, replay after) — architecture.md §14.

## Live Wundergraph verification (T-12h)

The replay-mode demo path works without any of this — these steps prove the
**live** Cosmo Connect path so the four-protocol pop at 2:15 is real, not a
canned chip render. Run once the morning of; if any step fails, demo in
`DEMO_MODE=replay` and skip the live `curl` at 2:15.

### 1. Cosmo Cloud account + federated graph

```bash
wgc auth login                                 # opens browser; SSO into Cosmo Studio
wgc federated-graph list                       # confirm the graph exists
# If 'understudy' is missing, create it:
wgc federated-graph create understudy \
  --routing-url http://cosmo-router:4000/graphql \
  --label-matcher 'team=understudy'
```

Grab the API key (Cosmo Studio → Settings → API Keys) and put it in `.env`:

```
COSMO_API_KEY=cosmo_xxx...
COSMO_FEDERATED_GRAPH_NAME=understudy   # match the name above
COSMO_NAMESPACE=default
```

### 2. Pull + boot the Cosmo Router (the `connect:` block dry-run)

```bash
docker login ghcr.io                           # use a GitHub PAT with read:packages
docker pull ghcr.io/wundergraph/cosmo-router:latest

docker compose up cosmo-router -d
docker compose logs -f cosmo-router | grep -E "connect|listening|error" | head -20
```

Expected: a "Connect listener bound on /connect" or equivalent log line.
**If the router rejects the `connect:` block** (older versions name keys
differently), copy the exact error key path from logs and adjust
`apps/cosmo-router/config.yaml` to match — the `connect:` schema is at
https://cosmo-docs.wundergraph.com/connect/overview. Re-pull + restart.

### 3. Push trusted docs from a real synthesis

```bash
DEMO_MODE=live python -m apps.synthesis-worker.main \
  --recording fixtures/mp4/demo-shopify.mp4 \
  --synth-id dryrun-$(date +%s)
```

Confirm the worker logged `wgc operations push` succeeding (not the offline
soft-fail). Then:

```bash
wgc operations list understudy --client dryrun-<id>
# Expected: one row per Query/Mutation field in the SDL
```

### 4. Hit all four protocols

For an agent named `dryrun-<id>` (or any pre-seeded agent like `agent_alpha`):

```bash
BASE=http://localhost:4000
AGENT=agent_alpha   # swap in your dryrun id once registered

# GraphQL
curl -sf -X POST "$BASE/graphql" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ orders { id status } }"}' | head

# REST (JSON over HTTP)
curl -sf "$BASE/connect/$AGENT/json/Orders"

# gRPC (needs grpcurl)
grpcurl -plaintext "$BASE:4000" "$AGENT.Orders/Run"

# OpenAPI spec — open in browser or curl
curl -sf "$BASE/connect/$AGENT/openapi.json" | jq '.paths | keys'
```

If all four return data (or even a meaningful 4xx that isn't 404), the
live Wundergraph integration is verified. If any return 404, fall back to
replay mode for the demo and file a follow-up — the chips still render
from the prewarm fixtures.

### Failure-mode kill-switch

```bash
./scripts/demo_mode_switch.sh replay           # everything back to canned
```

The chips on the AgentWall still render (prewarm seeds the canonical key);
only the `curl` at 2:15 needs to be skipped from the cue card.

---

## Pre-pitch (T-5m)

1. **Verify prewarm.** Run `python scripts/prewarm_demo.py --check` against the
   production Redis. Exits 0 with a green `DEMO READY` summary when every
   expected key exists (replay, LangCache, AMS turns, Dream Query, Vector Set).
   Exits 1 with a red list of missing keys if prewarm didn't run or was partial —
   in that case rerun `python scripts/prewarm_demo.py` before walking on.
2. (Optional, cost) Pre-warm the stage Fly agent by rendering
   `infra/fly/agent.fly.toml.tmpl` with `pre_warm=true` for the demo agent
   (sets `min_machines_running=1`). See `infra/fly/README.md` for the cost
   trade-off.

## On-stage cues

See architecture.md §15 for the minute-by-minute table. Kill-switch:
`scripts/demo_mode_switch.sh replay` flips DEMO_MODE on Fly.io and the local
Docker Compose stack in one command. Browser sessions run on TinyFish's
hosted cloud; no second runtime surface needs flipping.

### 2:15 — Four-protocol pop (Cosmo Connect)

Right after the federated endpoint blinks live (architecture.md §15, 2:00-2:15
beat), click an agent tile on the wall and hover its four chips: **GraphQL**,
**gRPC**, **REST**, **OpenAPI**. Copy the gRPC URL and paste it into the
terminal: `curl -sf {url}/health`. Beat: *"one recording → four protocols,
served from one federated graph."* Trusted Documents emitted by the synthesis
worker drive the Cosmo Connect surface — no extra Gemini call.

## Owner task

Final demo content lands with task **#10 — Design UI with Stitch MCP** and surrounding polish tasks.
