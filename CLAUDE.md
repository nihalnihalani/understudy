# Understudy — Orientation for Claude sessions

Understudy is a meta-agentic platform: a 60-second screen recording becomes a signed, deployed web agent with a federated GraphQL API and persistent memory. Built for the Ship to Prod — Agentic Engineering Hackathon (April 2026). The full system design — component diagrams, synthesis pipeline, ER model, Redis keyspace, Gemini prompts, failure modes — lives in [architecture.md](./architecture.md). Read it before making non-trivial changes.

## Key invariants

- **Three-Gemini model pinning is non-negotiable.** Action detection uses `gemini-3.1-flash-lite`, intent abstraction uses `gemini-3.1-pro`, script emission uses `gemini-3-flash`. Pins live in `understudy/models.py`; import from there — do not hardcode model IDs elsewhere. Rationale in architecture.md §11 (3 Flash's 78% SWE-bench beats 3.1 Pro on code).
- **Hermetic demo mode must work.** The `DEMO_MODE` env flag (`live` | `replay` | `hybrid`) swaps live Gemini calls for Redis `us:replay:{synth_id}` cached responses. Any new synthesis code path must honor this switch (architecture.md §14). If you add a new outbound call, add a replay branch too.
- **SLSA L2 supply chain is non-negotiable.** Every generated agent image carries an SLSA L2 provenance predicate, a build-time SBOM, and a keyless cosign signature via Fulcio anchored in Rekor. Do not merge changes that skip signing or downgrade to post-build scans. Verification runs on boot via Fly.io Machines pre-start hooks (architecture.md §6). Browser sessions run on **TinyFish's hosted browser infrastructure** — we do not operate our own browser pool.

## Repo map

- `apps/` — FastAPI ingest, 3-Gemini synthesis worker, Cosmo MCP driver, agent template, federation router
- `infra/` — Fly manifests, Chainguard Dockerfiles + SLSA config, InsForge warm-pool scripts, GitHub Actions CI
- `understudy/` — shared Python package (model constants, shared types)
- `scripts/` — demo prewarm, mode switch, sample recording
- `docs/gemini-prompts/` — the three prompt specs mirrored from architecture.md §10
