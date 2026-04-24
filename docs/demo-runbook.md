# Demo Runbook

The on-stage script for the 3-minute pitch. Beat-by-beat timing lives in architecture.md §15; this file is where each operator logs their cue-card.

## Pre-stage (T-24h)

1. Run `scripts/prewarm_demo.py` against prod Redis — seeds `us:replay:{synth_id}`, `langcache:gemini:{hash}`, `vset:agent:{id}:memory`, `dream:{run_id}` (architecture.md §14).
2. Verify `cosign verify` + `cosign verify-attestation --type slsaprovenance` both pass against the published agent base image.
3. Record `fixtures/demo.mp4` via `scripts/record_sample.sh` (60s Shopify orders filter + CSV export).
4. Flip `DEMO_MODE` to `hybrid` (live for first 8s, replay after) — architecture.md §14.

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
