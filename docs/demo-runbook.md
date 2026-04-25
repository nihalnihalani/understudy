# Demo Runbook

The on-stage script for the 3-minute pitch. Beat-by-beat timing lives in architecture.md §15; this file is where each operator logs their cue-card.

## Pre-stage (T-24h)

1. Run `scripts/prewarm_demo.py` against prod Redis — seeds `us:replay:{synth_id}`, `langcache:gemini:{hash}`, `vset:agent:{id}:memory`, `dream:{run_id}` (architecture.md §14).
2. Verify `cosign verify` + `cosign verify-attestation --type slsaprovenance` both pass against the published agent base image.
3. Record `fixtures/demo.mp4` via `scripts/record_sample.sh` (60s Shopify orders filter + CSV export).
4. Flip `DEMO_MODE` to `hybrid` (live for first 8s, replay after) — architecture.md §14.

## Live Wundergraph verification (T-12h)

The replay-mode demo path works without any of this — these steps prove the
**live** ConnectRPC path so the four-protocol pop at 2:15 is real, not a
canned chip render. **Verified end-to-end on 2026-04-25** against
`router@0.311.0` + Cosmo Cloud (org `nihal.nihalani`, graph `understudy`).
Run once the morning of; if any step fails, demo in `DEMO_MODE=replay` and
skip the live `curl` at 2:15.

### 1. Cosmo Cloud account + federated graph + subgraph

```bash
wgc auth login                                 # opens browser; SSO into Cosmo Studio
wgc auth whoami                                # confirm org slug

wgc federated-graph list
# If 'understudy' is missing, create it:
wgc federated-graph create understudy \
  --routing-url http://cosmo-router:4000/graphql \
  --label-matcher 'team=understudy'

# Cosmo Cloud requires at least one subgraph to compose the graph.
# Note: agent_alpha.graphql still has a `type Subscription` — Cosmo Cloud's
# publish step rejects that as Event-Driven without EDFS directives. Strip
# the Subscription block to a temp file before publishing:
awk '/^# Live fulfilment events/{exit} {print}' \
  apps/cosmo-router/subgraphs/agent_alpha.graphql > /tmp/agent_alpha-no-sub.graphql

wgc subgraph create agent_alpha --namespace default \
  --label team=understudy \
  --routing-url http://agent_alpha:4001/graphql
wgc subgraph publish agent_alpha --namespace default \
  --schema /tmp/agent_alpha-no-sub.graphql

# Confirm graph composes:
wgc federated-graph list   # expect IS_COMPOSABLE: ✔
```

Set `.env` (no separate API-key step needed — wgc uses the SSO session;
`COSMO_API_KEY` just acts as a feature flag for `cosmo_writer.py`):

```
COSMO_API_KEY=sso              # any non-empty value enables the wgc path
COSMO_FEDERATED_GRAPH_NAME=understudy
COSMO_NAMESPACE=default
COSMO_OPERATIONS_DIR=apps/cosmo-router/operations
```

### 2. Generate proto for ConnectRPC + boot the Cosmo Router

The OSS router doesn't ship via a public Docker image (auth-walled), so we
download the binary directly:

```bash
mkdir -p /tmp/cosmo-router-bin && cd /tmp/cosmo-router-bin
wgc router download-binary --out .
cd -

# Generate the gRPC service the router will discover:
wgc grpc-service generate AgentAlpha \
  --input /tmp/agent_alpha-no-sub.graphql \
  --output apps/cosmo-router/services/agent_alpha \
  --package-name agent_alpha.v1 \
  --with-operations apps/cosmo-router/services/agent_alpha
# `--with-operations` requires the dir to already contain QueryX.graphql /
# MutationY.graphql files. cosmo_writer.py writes them automatically; for a
# manual smoke test add a few by hand:
# echo 'query QueryOrders { orders { id status } }' \
#   > apps/cosmo-router/services/agent_alpha/QueryOrders.graphql

# Boot the router (DEMO_MODE clashes with router's bool config; clear env):
cd /tmp && env -i HOME="$HOME" PATH="$PATH" \
  FRONTEND_ORIGIN=http://localhost:5173 STUDIO_URL=https://cosmo.wundergraph.com \
  /tmp/cosmo-router-bin/router \
    -config "$OLDPWD/apps/cosmo-router/config.yaml" 2>&1 | tee /tmp/router.log &
sleep 4
grep -E "ConnectRPC server ready|registering services" /tmp/router.log
```

Expected log lines:
```
"discovered service" full_name=agent_alpha.v1.AgentAlpha
"loaded operations for service" service=agent_alpha.v1.AgentAlpha operation_count=N
"ConnectRPC server ready" addr=[::]:5026
```

### 3. Push Trusted Documents (separate from Connect; persisted-op cache)

```bash
mkdir -p /tmp/wgc-test
cat > /tmp/wgc-test/HealthPing.graphql <<'EOF'
query HealthPing { __typename }
EOF
wgc operations push understudy --namespace default \
  --client wgc-cli-smoke \
  --file /tmp/wgc-test/HealthPing.graphql
# Expected: "pushed 1 operations: 1 created, 0 up to date, 0 conflicts"
```

### 4. Hit every protocol

```bash
# GraphQL — federated endpoint
curl -sf -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ orders { id status } }"}'

# Connect / REST / JSON — same URL, content-type-negotiated
curl -sf -X POST http://localhost:5026/agent_alpha.v1.AgentAlpha/QueryOrders \
  -H 'Content-Type: application/json' \
  -H 'Connect-Protocol-Version: 1' \
  -d '{}'

# gRPC (requires grpcurl)
grpcurl -plaintext -d '{}' localhost:5026 agent_alpha.v1.AgentAlpha/QueryOrders
```

A successful response or even a 502 `failed to execute GraphQL query`
proves the protocol surface is wired (502 just means no upstream subgraph
server is running on `:4001` — the federation chain is correct, the
backing service is what's missing).

### Failure-mode kill-switch

```bash
./scripts/demo_mode_switch.sh replay
```

Chips on the AgentWall still render (prewarm seeds the canonical key);
only the live `curl` at 2:15 gets skipped from the cue card.

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

### 2:15 — Four-protocol pop (Cosmo ConnectRPC)

Right after the federated endpoint blinks live (architecture.md §15, 2:00-2:15
beat), click an agent tile on the wall and hover its four chips: **GraphQL**,
**gRPC**, **REST**, **Connect**. Copy the REST URL and paste in the terminal:

```bash
curl -X POST {url} -H 'Content-Type: application/json' \
  -H 'Connect-Protocol-Version: 1' -d '{}' | head
```

Beat: *"one recording → one URL → gRPC + REST + Connect over content-type
negotiation, plus the GraphQL endpoint." Cosmo Router's ConnectRPC server
on :5026 exposes every operation as four wire formats from one proto file
generated by `wgc grpc-service generate`.* No extra Gemini call.

## Owner task

Final demo content lands with task **#10 — Design UI with Stitch MCP** and surrounding polish tasks.
