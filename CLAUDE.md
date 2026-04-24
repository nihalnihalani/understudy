# Project Rules for Claude Code

## Project Overview

**Understudy** — A meta-agentic platform. Record a 60-second screen capture of a web workflow, and Understudy synthesizes a production-ready signed + deployed web agent with a federated GraphQL API and persistent memory. Treat this repo as hackathon-grade software with some production-shaped pieces (SLSA L2 supply chain, federated router, Redis 8 substrate), not a finished platform.

**Hackathon:** Ship to Prod — Agentic Engineering Hackathon | April 2026 | San Francisco
**Tagline:** *"Show it once. Understudy takes over."*
**Prize Targets (expected stack: ~$5,000 cash + 4× Mac Mini + AirPods Pro + $2M Accelerator Golden Ticket):**
- **TinyFish 1st** — 4× Mac Mini + $300 credits + $2M Accelerator Golden Ticket
- **Wundergraph 1st** — $2,000 (Cosmo Dream Query used natively)
- **Chainguard** — $1,000 (SLSA L2 + cosign + Fulcio + Rekor)
- **InsForge 1st** — $1,000 (Remote OAuth MCP + Model Gateway)
- **Redis — Best Agent** — AirPods Pro + 10k credits (Vector Sets int8 + LangCache + AMS)
- **Guild — Most Innovative** — $1,000 Visa (meta-agentic = innovation bullseye)

**Primary reference:** [architecture.md](./architecture.md) has the full system design — component diagrams, synthesis pipeline, Dream Query interaction, ER data model, Redis keyspace, Gemini 3 prompt chains, supply-chain flow, and failure-mode analysis. **Read it before any non-trivial change.**

### Architecture

- **Action detection (vision)**: Gemini 3.1 Flash-Lite — frame-level multimodal function responses
- **Intent abstraction**: Gemini 3.1 Pro with `thinking_level: high`
- **Script emission**: Gemini 3 Flash — 78% SWE-bench Verified; the best coder in the family
- **Schema synthesis**: Wundergraph Cosmo MCP — **Dream Query**, EDFS (Kafka/NATS), `schema_change_proposal_workflow`, live-traffic validation
- **Federation**: Cosmo Router — gateways every generated agent subgraph under one SDL
- **Target runtime**: TinyFish CLI + Agent Skill System on TinyFish's hosted browser infrastructure — we do not operate our own browser pool
- **Per-agent backend**: InsForge 2.0 — Remote OAuth MCP, PostgREST auto-API, Edge Functions, Model Gateway (inference fallback)
- **Memory**: Redis 8 — Vector Sets int8 (75% less memory), LangCache semantic cache, Agent Memory Server with auto topic/entity extraction
- **Supply chain**: Chainguard wolfi-base + SLSA L2 provenance + build-time SBOM + Sigstore cosign keyless via Fulcio + Rekor
- **Runtime**: Fly.io Machines (cosign pre-start hook); browser sessions execute on TinyFish's hosted infrastructure
- **CI**: GitHub Actions — keyless Fulcio OIDC signing, SLSA L2 attestation, Rekor anchoring
- **API layer**: FastAPI (Python 3.11) — ingest, synthesis orchestration, SSE trace stream, supply-chain receipt endpoints
- **Frontend**: Vite + React + shadcn/ui — upload UI, synthesis HUD, agent dashboard, Dream Query embed, SLSA receipt viewer, in-browser screen recorder

### Project Structure

```text
understudy/
├── CLAUDE.md                          # this file
├── README.md
├── architecture.md                    # full system architecture — READ BEFORE NON-TRIVIAL CHANGES
├── pyproject.toml                     # Python package + pytest + ruff + mypy config
├── package.json                       # npm workspaces: apps/agent-template, apps/web
├── Makefile                           # dev entry points (make api | worker | web | dev | test)
├── docker-compose.yml                 # redis + cosmo-router + insforge stub for local dev
├── apps/
│   ├── api/                           # FastAPI ingest + synthesis orchestration + SSE
│   ├── synthesis-worker/              # 3-Gemini pipeline (keyframe → action → intent → script)
│   ├── cosmo-mcp-driver/              # headless wrapper around Cosmo MCP CLI (Dream Query + proposal)
│   ├── cosmo-router/                  # federation gateway for all generated agents
│   ├── agent-template/                # TypeScript base TinyFish CLI scaffold (generated agents extend)
│   └── web/                           # Vite + React + shadcn dashboard
├── understudy/                        # shared Python package
│   ├── models.py                      # ★ THE ONLY place Gemini model IDs live
│   ├── memory/                        # Redis AMS client + vector helpers
│   └── bin.py                         # console-script entry points (works around hyphen dirs)
├── infra/
│   ├── fly/                           # Fly.io manifests + fly-start.sh cosign pre-start hook
│   ├── chainguard/                    # wolfi-base Dockerfile + per-agent build template + SLSA L2 config
│   ├── insforge-pool/                 # warm-pool provisioning scripts
│   └── github-actions/                # CI: base image build + SLSA L2 attest + Fulcio sign + Rekor + push
├── scripts/
│   ├── prewarm_demo.py                # seeds LangCache + AMS + Vector Sets + Dream Query cache
│   ├── demo_mode_switch.sh            # flip DEMO_MODE across services atomically
│   ├── record_sample.sh               # capture a fresh sample recording
│   ├── register_agent_subgraph.sh     # register a newly synthesized agent with Cosmo router
│   └── verify_release.sh              # cosign verify + verify-attestation helpers
├── tests/                             # pytest suite (cross-stack; 74+ passing)
│   ├── conftest.py
│   ├── synthesis_worker/              # unit tests for the 3-Gemini pipeline
│   ├── test_supply_chain.py           # cosign/SLSA/Rekor verification paths
│   ├── test_cosmo_to_router.py        # Dream Query → subgraph registration flow
│   ├── test_int8_quantization.py      # Vector Sets int8 correctness
│   ├── test_langcache.py
│   ├── test_ams_namespace.py
│   ├── test_e2e_smoke.py
│   └── ...
├── docs/
│   ├── demo-runbook.md
│   └── gemini-prompts/                # prompt specs mirrored from architecture.md §10
│       ├── action_detection_flash_lite.md
│       ├── intent_abstraction_pro.md
│       └── script_emission_flash.md
└── fixtures/                          # sample recordings + replay snapshots
```

### Key Technical Decisions (Invariants)

**These three are non-negotiable. A PR that violates any of them must not merge.**

1. **Three-Gemini model pinning.** Action detection uses `gemini-3.1-flash-lite`, intent abstraction uses `gemini-3.1-pro`, script emission uses `gemini-3-flash`. Pins live in `understudy/models.py`. **Import from there — never hardcode a model ID elsewhere.** A pre-tool-use hook in `.claude/settings.json` blocks edits that embed a `gemini-3*` ID in any other file. Rationale in architecture.md §11: 3 Flash's 78% SWE-bench beats 3.1 Pro on code, and action detection doesn't need thinking tokens.

2. **Hermetic demo mode must work.** The `DEMO_MODE` env flag (`live` | `replay` | `hybrid`) swaps live Gemini calls for Redis `us:replay:{synth_id}` cached responses. Any new synthesis code path must honor this switch (architecture.md §14). **If you add a new outbound call, add a replay branch to it in the same PR.** `scripts/prewarm_demo.py` seeds the replay cache the night before a demo.

3. **SLSA L2 supply chain.** Every generated agent image carries a SLSA L2 provenance predicate, a build-time SBOM, and a keyless cosign signature via Fulcio anchored in Rekor. **Never skip signing. Never downgrade to post-build scanning.** Verification runs on boot via Fly pre-start hooks (`infra/fly/fly-start.sh`). Browser sessions run on TinyFish's hosted infrastructure — we no longer operate a Mac Mini pool (removed in `fc7317e`).

### Other Technical Decisions (Strong Defaults — Change With Care)

- **Cosmo Dream Query is the synthesizer.** Every generated agent's subgraph SDL comes from Dream Query. We already know *what* the agent wants to query; Dream Query answers *how the schema must change*. This is exactly the primitive's intended use. Do not replace it with hand-written SDL generation.
- **Meta-agentic, not agentic.** The deliverable is a running, signed, federated web agent — not a chatbot. If a new feature makes this look more like a chat product, push back.
- **No mocks on the demo path.** Real Gemini calls (or cached replay), real Redis, real Cosmo router, live `cosign verify` on stage. Judges notice mocks. `COSMO_MOCK=true` exists only for offline dev.
- **Pre-warm before demo.** Run `python scripts/prewarm_demo.py` the night before. Do not run live synthesis for the first time during the live demo.
- **Memory is Agent Memory Server, not chat history.** Per-agent AMS namespaces with auto topic/entity extraction + int8 Vector Set recall. Don't accept PRs that sneak in "save chat transcript" as a shortcut.
- **Density is a goal.** Int8 Vector Sets + Chainguard slim images + InsForge Remote MCP pooling. If you make a change that balloons per-agent footprint, flag it.
- **Federation is part of the product.** Cosmo Router gateways every agent under one SDL. A synthesized agent that only exposes a local endpoint is not done.

### Synthesis Core Loop

```
RECORDING (.mp4, ≤60s)
  ↓  ffmpeg keyframe extraction
KEYFRAMES + audio transcript
  ↓  Gemini 3.1 Flash-Lite (multimodal fn response, per-frame)
ACTION EVENTS (click targets, form inputs, URL transitions)
  ↓  Gemini 3.1 Pro (thinking_level: high)
ABSTRACT INTENT (step graph with preconditions + postconditions)
  ↓  Gemini 3 Flash (script_emission prompt, 78% SWE-bench)
TINYFISH SCRIPT + TARGET QUERY SHAPE
  ↓  Cosmo MCP Dream Query (schema_change_proposal_workflow)
SUBGRAPH SDL + live-traffic validation
  ↓  Jinja2 Dockerfile render (agent-template + pinned Skills + signed SDL hash)
AGENT IMAGE (Chainguard wolfi-base)
  ↓  SLSA L2 attestation + build-time SBOM + cosign keyless (Fulcio) + Rekor log
SIGNED IMAGE (GHCR)
  ↓  Fly Machine launch (cosign pre-start hook verifies Rekor inclusion)
FEDERATED AGENT (Cosmo subgraph registered → live GraphQL endpoint)
  ↓  AMS namespace provisioned + LangCache key prefix claimed
READY — every subsequent run populates Agent Memory Server
```

Every stage emits SSE trace events keyed by `synth_id` to Redis Streams (`us:trace:{synth_id}`). The API surfaces them at `GET /synthesize/{id}/stream`.

### Demo Theater (3 min)

This is THE demo. Optimize every feature for it.

1. **0:00–0:20** Hook; live-record a demo SaaS workflow (open → filter orders → export CSV, 60s)
2. **0:20–0:40** Gemini 3.1 Flash-Lite detects UI events per keyframe (multimodal fn response visible in HUD)
3. **0:40–1:00** Gemini 3.1 Pro abstracts intent (`thinking_level: high` tokens stream)
4. **1:00–1:20** Gemini 3 Flash emits the script (SWE-bench 78% pitch beat)
5. **1:20–1:40** Cosmo **Dream Query** generates subgraph SDL live + live-traffic validator passes
6. **1:40–2:00** Chainguard builds + SLSA L2 attests + cosign signs via Fulcio → `cosign verify` runs live on stage
7. **2:00–2:15** Deploy: federated endpoint blinks live in Cosmo Studio
8. **2:15–2:30** Hit endpoint: agent runs via TinyFish CLI; TinyFish-hosted browser visible; InsForge + Redis AMS fill live
9. **2:30–2:40** Repeat query → Redis **LangCache** hit <50ms (visible latency drop in HUD)
10. **2:40–2:55** Related query → Agent Memory Server Vector Set recall
11. **2:55–3:00** Wall of 10 synthesized agents — *"The agent that builds agents."*

### Sponsor Integration Map

| Sponsor | Role | Integration depth |
|---------|------|-------------------|
| **Gemini 3 / 3.1** | Three-stage synthesis brain (action / intent / script) | DEEP — each model used where it's objectively best |
| **Wundergraph Cosmo** | Dream Query for subgraph SDL; Router federates all agents; EDFS for event fields | DEEP — Dream Query is the synthesizer, not a side call |
| **Chainguard** | Wolfi-base images + SLSA L2 provenance + SBOM + cosign Fulcio Rekor | DEEP — live-verifiable supply chain |
| **InsForge 2.0** | Per-agent backend via Remote OAuth MCP + Model Gateway (inference fallback) | DEEP — no stdio shim, real remote MCP |
| **TinyFish** | Generated agents are TinyFish CLI + Skill-pinned scripts; TinyFish hosts the browser pool | DEEP — 2× task completion vs MCP |
| **Redis 8** | Vector Sets int8 + LangCache + Agent Memory Server (auto topic/entity) | DEEP — three April-2026 features on one substrate |

### Data Models (Redis Keyspace — see architecture.md §9 for full spec)

- `us:run:{synth_id}` — hash: synthesis run state (status, stage, durations, cost)
- `us:trace:{synth_id}` — Redis Stream: SSE trace events (stage, message, ts, duration_ms)
- `us:replay:{synth_id}` — hash: cached Gemini responses per stage (powers `DEMO_MODE=replay`)
- `us:agent:{agent_id}:manifest` — signed runtime manifest (image digest, SDL hash, Skill pins)
- `us:ams:{agent_id}:*` — Agent Memory Server namespace (short + long term; auto extraction)
- `us:langcache:{hash}` — LangCache semantic-cache entry (≤50ms repeat queries)
- `us:vec:{agent_id}` — Vector Set (int8 quantized embeddings) for recall
- `us:pool:insforge` — InsForge warm-pool tenant descriptors

### API Surface (apps/api)

```
POST   /synthesize                      Ingest a recording; returns synth_id + 202
GET    /synthesize/{id}                 Current status + stage + cost
GET    /synthesize/{id}/stream          SSE stream of trace events
GET    /synthesize/{id}/receipt         Supply-chain receipt (image digest, SLSA attestation URI, Rekor entry)
POST   /agents                          Register a freshly synthesized agent with Cosmo router
GET    /agents/{id}                     Agent manifest + endpoint + skill pins
GET    /healthz                         Liveness + DEMO_MODE + sponsor-service probes
```

Every synthesis endpoint appends trace events via `_log_if_synth_route` middleware in `apps/api/main.py`.

---

## Git Workflow — Pull Request Required

**MANDATORY**: All changes go through a pull request before merging to `main`. Never commit or push directly to `main`.

### Workflow (Fully Automated)

After making changes, Claude Code must execute all steps without manual intervention:

1. **Create a feature branch** from `main`: `git checkout -b <type>/<short-description>`
2. **Stage and commit** changes to the feature branch with conventional commit messages
3. **Push the feature branch** to remote: `git push -u origin <branch-name>`
4. **Open a pull request** against `main` using `gh pr create`
5. **Auto-review the PR** — use `gh pr diff` to read the full diff, then review for:
   - correctness and type safety
   - compliance with the three invariants (Gemini pins, `DEMO_MODE` replay branches, SLSA L2)
   - test coverage (new outbound call ⇒ new replay branch ⇒ new test case)
   - security issues (cosign bypass, hardcoded secrets, unsigned images)
   - breaking changes to Cosmo Router SDL or Agent Memory Server schemas
6. **If issues found** — fix them automatically, commit the fixes to the same branch, push, re-review
7. **Repeat 5–6** until all issues resolve
8. **Approve the PR** — `gh pr review --approve -b "Automated review passed: <summary>"`
9. **Merge the PR** — `gh pr merge --squash --delete-branch`

### Rules

- Never commit or push directly to `main`
- Never merge without running the automated review cycle (steps 5–7)
- Never merge with unresolved review issues
- Never force push to any branch
- Never skip hooks with `--no-verify` (hooks enforce invariant #1)
- One logical change per PR — keep PRs small and reviewable
- PR title follows Conventional Commits (e.g., `feat(synthesis-worker): add hybrid-mode fallback timer`)
- PR body must include **Summary** and **Test Plan** sections
- Commit messages explain the *why* (the *what* is in the diff)
- Pre-commit hook failure ⇒ fix + create a NEW commit (never `--amend`)
- Review fixes land as new commits (do not force-push over review history)

### Supply-Chain Gate for `infra/` Changes

Any PR that touches `infra/chainguard/`, `infra/github-actions/`, `infra/fly/`, or `scripts/verify_release.sh` must be reviewed with the **supply-chain-reviewer** subagent before merge. These paths control SLSA L2 attestation, cosign signing, and Rekor anchoring. Regressions here are catastrophic.

## Branching & Commit Conventions

- **Main branch**: `main`
- **Commit format**: [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` / `feat(scope):` — new feature
  - `fix:` / `fix(scope):` — bug fix
  - `docs:` — documentation
  - `refactor:` — code refactor (no behavior change)
  - `chore:` — build/tooling
  - `test:` — test changes
  - `perf:` — performance
  - `ci:` — CI config

- **Scopes** (match existing git log):
  `api`, `synthesis-worker`, `cosmo-driver`, `router`, `agent-template`, `web`, `ui`,
  `memory`, `supply-chain`, `infra`, `scripts`, `tests`, `docs`, `demo`

- **Branch naming**: `<type>/<kebab-description>` (e.g., `feat/hybrid-budget-timer`, `fix/ams-namespace-collision`)

## Build & Test Commands

```bash
# ─── Install ─────────────────────────────────────────
make install                # Python (-e .[dev]) + npm workspaces

# ─── Local dev (individual targets) ──────────────────
make redis                  # Redis 8 on :6379 (reuses running container)
make api                    # FastAPI on :8080 (uvicorn --reload)
make worker                 # synthesis-worker (consumes jobs:synthesis stream)
make web                    # Vite on :5173

# ─── Local dev (all in one) ──────────────────────────
make dev                    # redis + api + worker + web in parallel (ctrl-c stops all)

# ─── Full stack via docker-compose ───────────────────
make docker-up              # redis + cosmo-router + insforge stub
make docker-down

# ─── Testing ─────────────────────────────────────────
make test                   # pytest (uses REDIS_URL=redis://localhost:6379/15 by default)
pytest tests/test_supply_chain.py          # supply-chain verification paths
pytest tests/test_cosmo_to_router.py       # Dream Query → subgraph registration
pytest tests/synthesis_worker/             # 3-Gemini pipeline unit tests
pytest tests/test_e2e_smoke.py             # end-to-end synthesis (replay mode)

# ─── Lint / typecheck ────────────────────────────────
make lint                   # ruff + eslint
make typecheck              # apps/web TypeScript
ruff check . && ruff format .
mypy understudy             # strict mode per pyproject.toml

# ─── Demo prep ───────────────────────────────────────
python scripts/prewarm_demo.py             # seed LangCache + AMS + Vector Sets + Dream Query cache
./scripts/demo_mode_switch.sh replay       # flip DEMO_MODE across services atomically
./scripts/record_sample.sh                 # capture a fresh sample recording

# ─── Supply-chain verification (live on stage) ───────
./scripts/verify_release.sh ghcr.io/nihalnihalani/understudy-agent-base:latest
# ⇒ cosign verify + cosign verify-attestation --type slsaprovenance
```

## Environment Variables

Only a few are strictly required for local dev. See `.env.example` for the full template.

```bash
# ─── REQUIRED ────────────────────────────────────────
GEMINI_API_KEY=             # Gemini 3 / 3.1 API key — synthesis pipeline
GOOGLE_API_KEY=             # SDK reads this name internally; set to same value
TINYFISH_API_KEY=           # TinyFish CLI + Agent Skills
INSFORGE_PROJECT_URL=       # From InsForge dashboard → Project Settings → General
INSFORGE_API_KEY=           # From InsForge dashboard; auth is Authorization: Bearer

# ─── REQUIRED (defaults work locally) ────────────────
REDIS_URL=redis://localhost:6379
COSMO_ROUTER_URL=http://localhost:4000
DEMO_MODE=live              # live | replay | hybrid (architecture.md §14)

# ─── OPTIONAL (prod / CI only) ───────────────────────
GHCR_TOKEN=                 # GitHub Container Registry push
FLY_API_TOKEN=              # Fly.io Machines deploy
CHAINGUARD_REGISTRY=cgr.dev/chainguard
COSIGN_CERT_IDENTITY=       # Fulcio identity (set in infra/fly/fly.toml for prod)
COSIGN_CERT_OIDC_ISSUER=    # Fulcio OIDC issuer
MODEL_GATEWAY_URL=          # InsForge Model Gateway — hybrid-mode fallback target
HYBRID_LIVE_BUDGET_S=8.0    # hybrid-mode: live budget before falling back to replay
COSMO_MOCK=false            # offline dev only — cosmo-mcp-driver returns canned output
```

## Agent Team Strategy

Use agent teams for any task that benefits from parallel work across independent modules. Teams are enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.

### When to Use Teams

- Multi-app features spanning `apps/api`, `apps/synthesis-worker`, and `apps/web`
- Research + implementation in parallel (one teammate explores Cosmo Dream Query response shape, another builds the driver; one benchmarks int8 Vector Sets, another wires AMS namespaces)
- Code review with competing perspectives (supply-chain safety, demo impact, correctness)
- Debugging with competing hypotheses — teammates test different theories simultaneously on pipeline failures
- Any task with 3+ independent subtasks that don't touch the same files

### When NOT to Use Teams

- Sequential tasks with heavy dependencies (e.g., render a Jinja Dockerfile *then* sign it)
- Single-file changes or tightly coupled files (e.g., edits to `understudy/models.py` alone — only one teammate touches that file, ever)
- Simple bug fixes or small tweaks
- Tasks where coordination overhead exceeds the benefit
- **Anything touching the three invariants** — route through the lead with plan approval first

### Team Configuration

- Start with **3–5 teammates** for most workflows
- Aim for **5–6 tasks per teammate** to keep everyone productive
- **Opus for the lead** (reasoning, coordination, invariant gate-keeping); **Sonnet for teammates** (focused implementation)
- Use **delegate mode** (`Shift+Tab`) when the lead should only coordinate, not write code
- Use **supply-chain-reviewer** as a dedicated reviewer subagent for any `infra/` PR
- Use **gemini-pipeline-tracer** when debugging replay-mode misses, pipeline regressions, or model-pinning violations

### Team Communication Rules

- `SendMessage` (type: `message`) for direct teammate communication — always refer to teammates by **name**
- `SendMessage` (type: `broadcast`) **only** for critical blockers affecting everyone (e.g., "Redis down, all tests failing")
- `TaskCreate` / `TaskUpdate` / `TaskList` for work coordination — teammates self-claim unblocked tasks
- When a teammate finishes, they check `TaskList` for the next unblocked task (prefer lowest ID first)
- Mark tasks `completed` **only** after verification passes (tests green, invariants held)

### Task Dependencies

- Use `addBlockedBy` to express ordering (e.g., "agent-template cosign preboot depends on `infra/chainguard/` build config landing")
- Teammates skip blocked tasks and pick up unblocked work
- When a blocking task completes, dependent tasks auto-unblock

### Parallelizable Modules

These can be built simultaneously with zero file-level conflict:

- **Synthesis-worker stages** — `action_detection.py`, `intent_abstraction.py`, `script_emission.py` each behind the shared `gemini_client.py`
- **API route files** — `apps/api/routes/synthesize.py`, `routes/agents.py`, `routes/health.py` (once they exist)
- **Web dashboard panels** — upload HUD, synthesis timeline, Dream Query embed, receipt viewer, agent wall (each an independent React component in `apps/web/src/`)
- **Cosmo driver transports** — stdio, cloud, and mock each in their own file under `apps/cosmo-mcp-driver/`
- **Test files** — each `tests/test_*.py` is independent
- **Infra targets** — Fly manifest vs. Chainguard Dockerfile vs. GitHub Actions vs. InsForge warm-pool scripts

### Sequential Dependencies

These must land in order:

1. **`understudy/models.py`** — blocks every synthesis stage
2. **Gemini client + `DEMO_MODE` replay plumbing** (`apps/synthesis-worker/gemini_client.py`, `langcache.py`) — blocks all three synthesis stages
3. **Synthesis stages** (action → intent → script) — blocks pipeline orchestration
4. **Cosmo MCP driver** — blocks subgraph-registration flow
5. **Agent-template cosign preboot** (`apps/agent-template/src/preboot/verify.ts`) — blocks signed-image deployment
6. **Chainguard SLSA L2 build** (`infra/chainguard/`) — blocks signed image production
7. **Fly pre-start cosign hook** (`infra/fly/fly-start.sh`) — blocks runtime verification
8. **API ingest + SSE trace** — blocks frontend synthesis HUD
9. **Cosmo router registration** — blocks live federated endpoint
10. **`prewarm_demo.py` + replay fixtures** — blocks hermetic demo mode
11. **Wall-of-agents UI** — blocks final demo beat

### Team Roles

- **Lead** — Architecture, interface design, invariant enforcement, PR review gate
- **Synthesis Dev** — 3-Gemini pipeline (`apps/synthesis-worker/`) + `DEMO_MODE` replay + `understudy/models.py`
- **Schema/Router Dev** — Cosmo MCP driver + Dream Query flow + router registration + EDFS
- **Supply-Chain Dev** — Chainguard Dockerfiles + SLSA L2 CI + cosign preboot + Fly pre-start hooks
- **Memory Dev** — Redis 8 substrate: AMS client, int8 Vector Sets, LangCache, per-agent namespacing
- **API/Backend Dev** — FastAPI ingest + SSE trace + receipts + InsForge 2.0 integration
- **Frontend Dev** — Vite + React dashboard: upload HUD, synthesis timeline, Dream Query embed, receipt viewer, in-browser screen recorder
- **Demo Dev** — `prewarm_demo.py`, demo runbook, replay fixtures, stage rehearsal, backup video

### Plan Approval for Risky Work

Require **plan approval** before implementation for:
- Any edit to `understudy/models.py` (invariant #1)
- Any new outbound call in synthesis (must add replay branch — invariant #2)
- Any change to `infra/chainguard/`, `infra/github-actions/release.yml`, or `scripts/verify_release.sh` (invariant #3)
- Architectural changes to the Cosmo router SDL or AMS namespace layout
- Anything that would invalidate pre-warmed replay fixtures

Teammate works in read-only mode, submits a plan, lead approves/rejects. Only after approval does the teammate implement.

### Shutdown Protocol

- When all tasks complete, the lead sends `shutdown_request` to each teammate
- Teammates approve shutdown after confirming their work is committed + merged
- Lead calls `TeamDelete` to clean up team resources

---

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, **STOP and re-plan immediately** — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity, especially for synthesis-pipeline changes

### 2. Subagent Strategy

- Use subagents liberally to keep main context clean
- Offload codebase research, exploration, and parallel analysis via the **Explore** agent
- For `infra/` reviews, use **supply-chain-reviewer**
- For synthesis pipeline debugging, use **gemini-pipeline-tracer**
- One focused task per subagent

### 3. Verification Before "Done"

Never mark a task complete without proving it works:

- `make test` passes locally
- `make typecheck` passes for any `apps/web` change
- `ruff check .` passes for any Python change
- **Invariant #1**: `grep -rn "gemini-3" --include="*.py" --include="*.ts"` returns only `understudy/models.py`
- **Invariant #2**: any new outbound call has a `DEMO_MODE=replay` branch and a test covering it
- **Invariant #3**: `./scripts/verify_release.sh <image>` succeeds for any release path change
- Synthesis-worker change: `pytest tests/synthesis_worker/ && pytest tests/test_e2e_smoke.py`
- Cosmo driver change: `pytest tests/test_cosmo_to_router.py`
- Supply-chain change: `pytest tests/test_supply_chain.py && pytest tests/test_release_workflow.py`
- Frontend change: start `make web`, open the flow in a real browser, walk through the demo beats
- Ask: *"Would a hackathon judge be impressed by this in 3 minutes?"*

### 4. Demo-Driven Development

- Every feature should be visible in the 3-min demo — if it isn't, deprioritize
- Polish > breadth — a flawless 3-Gemini pipeline with live `cosign verify` beats 6 half-baked features
- The **live `cosign verify` on stage** is the supply-chain wow moment — it MUST work
- The **<50ms LangCache hit** is the latency wow moment — make it visible in the HUD
- The **wall of 10 agents** is the closer — each tile must load signed receipts without the judge squinting
- If judges can't tell the 3-Gemini pipeline apart from a single-model chain, we lost the Gemini story — surface each stage in the HUD

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask *"is there a more elegant way?"*
- If a fix feels hacky: *"Knowing everything I know now, implement the elegant solution"*
- Skip for simple, obvious fixes — don't over-engineer
- Remember: ugly code that works beats clean code that doesn't (hackathon rule)
- **Exception**: never trade elegance for an invariant. A hacky `DEMO_MODE=replay` branch is better than no replay branch.

### 6. Autonomous Bug Fixing

- When given a bug report: fix it. Don't hand-hold.
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing tests without being told how

### 7. Self-Improvement Loop

- After ANY correction from the user: capture the pattern as a memory (via the memory system)
- Write rules for yourself that prevent the same mistake
- Review lessons at session start for relevant context

---

## Task Management

1. **Plan First** — write the plan with checkable items before starting
2. **Verify Plan** — check in with the user before implementation on non-trivial work
3. **Track Progress** — mark items complete as you go via `TaskUpdate`
4. **Explain Changes** — high-level summary at each step
5. **Document Results** — review what was built and what changed

---

## Scope Control — Hackathon Rules

### MUST SHIP (Layer 1 — The Demo)

| Feature | Why Critical |
|---|---|
| **3-Gemini synthesis pipeline** (action → intent → script) | THE product differentiator. Each model used where it's objectively best. |
| **Cosmo Dream Query → subgraph SDL** | The Wundergraph prize play. Literally the schema synthesizer. |
| **SLSA L2 signed image + live `cosign verify` on stage** | The Chainguard prize play. Judges see Rekor inclusion live. |
| **Federated agent endpoint via Cosmo Router** | "Meta-agentic" is only true if the generated agent is reachable. |
| **TinyFish CLI + Skill-pinned script as generated runtime** | TinyFish prize requires the generated agent *is* a TinyFish script. |
| **InsForge 2.0 Remote OAuth MCP backend** | InsForge prize requires Remote MCP — not stdio shim. |
| **Redis 8: AMS + LangCache + int8 Vector Sets** | Three April-2026 Redis features on the demo path. |
| **Hermetic `DEMO_MODE=replay`** | Invariant #2. Hedges a dead Wi-Fi or rate limit on stage. |
| **Upload UI + Synthesis HUD + Agent wall** | The non-chat visual hook. Judges have already seen 15 chat demos. |

### SHOULD SHIP (Layer 2 — If Time Permits)

| Feature | Impact |
|---|---|
| **Cost HUD** — per-stage Gemini token spend | Concrete ROI framing |
| **Hybrid mode** — live with `HYBRID_LIVE_BUDGET_S` fallback to replay | Best of both worlds on stage |
| **EDFS event fields** on subgraph SDL | Extra Wundergraph story |
| **In-browser recorder** on upload page (already shipped in `feat(web): in-browser screen recording on Upload`) | Frictionless demo |
| **SLSA receipt viewer** on each agent tile | Makes the supply chain tangible |
| **Agent Memory Server browser** | Makes "real memory, not chat history" tangible |

### MUST NOT DO (Scope-Creep Danger Zones)

- Multi-tenant RBAC / user management / login flows (the agent is signed — that's the trust boundary)
- Kubernetes / Helm / general-purpose deployment story beyond Fly (browser pool is TinyFish's problem, not ours)
- Generic chat UI (directly contradicts the non-chat positioning)
- Custom model fine-tuning (we use the pinned Gemini models; rationale is in architecture.md §11)
- New memory backend abstractions (Redis 8 IS the memory; plugin interfaces stay as stubs)
- Re-implementing Cosmo Router / building our own federation
- Supporting a non-SLSA image path "for dev convenience" (invariant #3)
- Mobile responsive design

### Time Sinks That Feel Productive But Aren't

- Making the UI pixel-perfect before the pipeline runs end-to-end in replay mode
- Designing the "perfect" Redis key schema instead of shipping architecture.md §9 as-is
- Writing comprehensive tests for code that won't exist in 48 hours
- Refactoring synthesis-worker stages before the pipeline is demonstrably working
- "Cleaning up" `infra/chainguard/` without a supply-chain-reviewer sign-off

---

## Core Principles

- **Invariants are invariants** — Gemini pins, hermetic replay, SLSA L2. No PR merges without all three.
- **Meta-agentic, not agentic** — the deliverable of a 60s recording is a signed federated agent, not a chatbot.
- **Demo-driven** — if it doesn't show in 3 min, cut it. The live `cosign verify` and the wall-of-agents are everything.
- **No mocks on the demo path** — real Gemini (or cached replay), real Redis, real Cosmo, real Rekor. Judges notice mocks.
- **Sponsor integrations are architectural, not checkbox** — every sponsor plays a genuine role. Make each role obvious in 3 min.
- **Simplicity first** — smallest possible change; minimal blast radius.
- **No laziness** — find root causes. No temporary fixes on the demo path.
- **Quality over speed** — correctness and polish beat rushing. A broken invariant is worse than a missed deadline.
- **Pre-warm the demo** — run `scripts/prewarm_demo.py` the night before. Do not rehearse with `DEMO_MODE=live` for the first time on stage.
- **Record a backup video by 5 PM on demo day** — always.
