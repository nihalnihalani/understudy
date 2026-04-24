# Demo Runbook

The on-stage script for the 3-minute pitch. Beat-by-beat timing lives in architecture.md §15; this file is where each operator logs their cue-card.

## Pre-stage (T-24h)

1. Run `scripts/prewarm_demo.py` against prod Redis — seeds `us:replay:{synth_id}`, `langcache:gemini:{hash}`, `vset:agent:{id}:memory`, `dream:{run_id}` (architecture.md §14).
2. Verify `cosign verify` + `cosign verify-attestation --type slsaprovenance` both pass against the published agent base image.
3. Record `fixtures/demo.mp4` via `scripts/record_sample.sh` (60s Shopify orders filter + CSV export).
4. Flip `DEMO_MODE` to `hybrid` (live for first 8s, replay after) — architecture.md §14.

## On-stage cues

See architecture.md §15 for the minute-by-minute table. Kill-switch: `scripts/demo_mode_switch.sh replay` flips to pure replay instantly.

## Owner task

Final demo content lands with task **#10 — Design UI with Stitch MCP** and surrounding polish tasks.
