# Understudy — Devil's Advocate Report

> Author: `devils-advocate` (team `understudy`), task #14. Date: 2026-04-23.
> Scope: hostile cross-examination of every public claim — the README, the architecture doc, the pitch beats, the prize-stacking table. Builds on verifier's `docs/conformance-report.md` (task #13) but assumes that report as baseline and pushes further.
> Stance: the harshest judge at the hackathon. No softening. File:line citations required; a claim without a test is presumed unverifiable.

---

## Executive summary

**Verdict: the project ships and will survive a Q&A — but only if we trim four specific claims from the pitch first.** The code is real where it matters (three-Gemini pipeline, Cosmo Dream Query driver, SLSA L2 CI, Redis AMS/LangCache/Vector Sets), and the hermetic demo mode genuinely covers every network-dependent beat. The risks concentrate in three places:

1. **Over-stated sponsor coverage.** README §"Prize-stacking" and architecture §16 promise April-2026 features we don't demo. Specifically: TinyFish sub-250ms cold start, InsForge PostgREST, InsForge Edge Function Editor, InsForge editable auth emails, Redis+Google ADK bridge. All appear in the README; zero have runtime code. If asked on stage, we will hand-wave.
2. **The "live-traffic validator PASS 0 / 4,200 ops" narrative is fixture numbers rendered as fact.** `CosmoMockMCP` returns hardcoded `client_ops_evaluated: 4_200` (`apps/cosmo-mcp-driver/clients.py:182`) and the UI renders `client_ops_sampled: 4212` from `apps/web/src/fixtures/demo.ts:112`. In replay mode (the recommended stage mode), we are showing a static fixture while claiming "Cosmo just ran it."
3. **The "agent that builds agents" framing is load-bearing marketing that the core loop does not quite deliver.** `apps/agent-template/src/core/loop.ts:36-116` records turns and consults LangCache, but it never invokes `memory.recall()` before running TinyFish. So the generated artifact is a **signed, memory-logging deployment**, not an agent that reasons over its memory at each turn. Reasonable judges will notice.

There are **no BLOCKER-tier issues** that hard-crash the demo. The walk-through will complete. But if a Chainguard engineer, a Wundergraph principal, or a Redis product manager is on the panel, each has one specific question that we currently cannot answer without backing down. Those questions are in Section 7.

Recommended surgery before stage: **drop five claims from the pitch** (Section 8), keep the rest, rehearse cleaner Q&A language for the four half-truths we are defending.

---

## Section 1: 3-minute demo budget — beat-by-beat latency

Wall-clock accounting against README §"Demo Theater" + architecture.md §15.

| Beat | Stage time | What runs | Expected wall-clock | Risk of overshoot |
|---|---|---|---|---|
| 0:00-0:20 | 20s | "Hook + record live" — README says "Record live: open demo SaaS, filter orders, export CSV (60s)" | **60s of capture in 20s of stage time is a lie.** We either (a) use a pre-recorded `fixtures/demo.mp4` (per `docs/demo-runbook.md:9`) and narrate as if live, or (b) compress. The runbook line 9 confirms we record `fixtures/demo.mp4` at T-24h, so this beat is **"we already have the mp4"** dressed as live. Not fatal; mildly dishonest. | LOW (playback is deterministic) |
| 0:20-0:40 | 20s | Gemini 3.1 Flash-Lite action detection on N-1 keyframe pairs | On 8 keyframes → 7 pair calls. Architecture §3 note says "6s" for the full stage. In replay (`us:replay:{synth_id}:action_{i}` per `gemini_client.py:162-170`), each call is a Redis GET → sub-20ms each, ~140ms total. | LOW in replay; MEDIUM in live |
| 0:40-1:00 | 20s | Gemini 3.1 Pro intent abstraction, `thinking_level: high` | Prewarm claims `latency_ms: 2180` (`scripts/prewarm_demo.py:117`). In replay: single Redis GET. In live: 3.1 Pro with `thinking_level: high` is a multi-second call — 2-5s is realistic, but Google has not published a p99 for `thinking_level: high`. | LOW in replay; HIGH in live |
| 1:00-1:20 | 20s | Gemini 3 Flash tool-call script emission | Prewarm claims `latency_ms: 2940`. Google's April-22 launch claim is "faster than 3.1 Pro on code", but no p99 number. Tool-mode calls with `thinking_level: medium` over a large intent blob are plausibly 3-6s. | LOW in replay; HIGH in live |
| 1:20-1:40 | 20s | Cosmo Dream Query + live-traffic validator | `COSMO_MOCK=1` returns fixtures instantly (`clients.py:173-206`). Live stdio through `wgc` is untested on stage wifi — the `CosmoStdioMCP` class (`clients.py:31-100`) exists but has no latency characterization in the repo. | LOW in mock; UNKNOWN in live (we have no timing evidence) |
| 1:40-2:00 | 20s | `cosign verify` + `cosign verify-attestation --type slsaprovenance` | Architecture §18 risk #1 admits the demo runs **verify only against a pre-built, pre-signed image**. Each `cosign verify` is ~1-2s (network to Fulcio root + Rekor lookup). Both commands: ~3-5s. Fits. **But the narrative "Chainguard builds + SLSA L2 attests + cosign signs via Fulcio → cosign verify runs live" (README Demo Theater line 6) is misleading** — the build + sign already happened in CI. | LOW (assumes network to Fulcio/Rekor) |
| 2:00-2:15 | 15s | "Deployed to Fly. Here is its GraphQL endpoint." | Fly Machine cold-start is 3-10s typical, up to 30s on unlucky cold paths. `infra/fly/fly.toml:47-48` has `auto_stop_machines = false, min_machines_running = 1` — so the synth API itself is hot. But the **per-agent machine** (`infra/fly/agent.fly.toml.tmpl:47-49`) has `auto_stop_machines = true, min_machines_running = 0` — which means each new synthesized agent's first request IS a cold start. The runbook does not address this. **If we actually deploy a fresh agent on stage, 15s is tight**; realistic is 10-25s for a cold Fly machine from image pull to healthy `/graphql`. | MEDIUM-HIGH |
| 2:15-2:30 | 15s | "Hit endpoint: agent runs via TinyFish CLI; Mac Mini browser visible; InsForge + Redis AMS fill live" | The core loop shells `tinyfish run --skill ... --script ...` (`apps/agent-template/src/tinyfish/cli.ts:45`). First real browser run on Mac Mini: 5-20s. Camera on Mac Mini needs to already be framed. | MEDIUM |
| 2:30-2:40 | 10s | LangCache <50ms hit, repeated query | Test at `tests/test_langcache.py:57-63` asserts exact-hash lookup is <50ms on fakeredis. Realistic on real Redis 8 over a local network: 1-5ms. Fits comfortably. Note caveat in Section 3: the "semantic" part of LangCache is only semantic if a real sentence-transformer is injected; default is a deterministic hash embedding (`understudy/memory/langcache.py:36-49`). On stage we use exact-match. | LOW |
| 2:40-2:55 | 15s | Agent Memory Server Vector Set recall | `VSIM` over int8 Vector Set: <10ms in practice. Fits. | LOW |
| 2:55-3:00 | 5s | Wall of 10 agents | Fixtures in `apps/api/store.py:40-68` (seed_agents) — 2 seeded, wall renders more from the UI fixture table. This is a UI screen, not a deploy trigger. | LOW |

**Total pipeline if entirely replay:** ~2-3s of Gemini-replay-to-Redis, ~5s of cosign verify against Fulcio, ~5-25s of Fly cold-start (if we actually deploy), ~1-5s of LangCache + Vector Set recall. Comfortably fits 3 minutes **when in replay mode**.

**Total pipeline if fully live:** 6s keyframes + 2-5s Flash-Lite + 3-7s Pro + 3-6s Flash + 1-3s Cosmo + 5-25s Fly cold-start = **20-52 seconds of model+infra wall-clock, not counting talk time between beats.** With narration overhead and the 60s mp4 playback, full-live is 3-5 minutes. Overshoot risk is REAL.

**Verdict.** The demo budget works only in `DEMO_MODE=hybrid` or `replay`. Live mode is unsafe. That is what the hermetic demo mode is for — and the runbook (`docs/demo-runbook.md:10`) is correct to pre-set `DEMO_MODE=hybrid`. **But the script says "Kill-switch: `scripts/demo_mode_switch.sh replay`"** and that script is a TODO stub (`scripts/demo_mode_switch.sh:12-13`). If stage wifi dies and we need to switch modes, the runbook's kill-switch doesn't work. Falling back requires a manual `fly secrets set DEMO_MODE=replay -a understudy-synthesis` plus a Mac Mini `launchctl setenv` — do both under stage pressure? Risky.

**The biggest single number to watch: per-agent Fly cold start in beat 2:00-2:15.** We have no timing evidence in the repo. If we want to defend "deployed live on stage", we need to either (a) pre-warm one Fly agent machine before the pitch (set `min_machines_running = 1` for the stage agent) or (b) re-frame the beat as "the image is verified and the deployment config is ready — I'll hit the endpoint in the next beat."

---

## Section 2: Sponsor claims audit

Every row in the README "Prize-stacking" table + architecture §16, graded by whether the code supports the claim on stage.

| Claim (README/arch) | File:line | Live / mock / marketing | Judge-accept? |
|---|---|---|---|
| Gemini 3 Flash, 3.1 Pro, 3.1 Flash-Lite (pinned models) | `understudy/models.py:10,13,16`; used at `pipeline.py:150,193,227` | **Live** | Yes |
| `thinking_level` API | `gemini_client.py:228-230` | Live (but only verifiable by running a live Gemini call — on stage this lives in replay) | Yes, if we show `config` payload in the terminal |
| Multimodal function responses | `pipeline.py:133-146` (two inline PNGs passed to Flash-Lite) | Live code path; fixture values shown on stage | Yes, if a fixture frame is visible |
| Cosmo Dream Query | `apps/cosmo-mcp-driver/driver.py:128-151` | **Code path real, demo path is fixture.** `CosmoMockMCP` returns hand-picked JSON (`clients.py:167-172`). Live stdio via `wgc` is wired but never exercised on stage. | Partially. Wundergraph engineer: "Is this a real `wgc mcp serve` call?" → honest answer is "in replay/mock mode, no" |
| Cosmo live-traffic validation | `driver.py:153-168` (real method); `clients.py:177-183` (mock returns `client_ops_evaluated: 4_200`) | **Mock on stage.** UI shows `4,212 client ops sampled` hardcoded in `apps/web/src/fixtures/demo.ts:112`. | NO if pressed. "How many live client ops did you sample?" → truthful answer is "we don't have any live clients; the 4,212 number is a fixture" |
| Cosmo `schema_change_proposal_workflow` | `driver.py:170-212`; `scripts/register_agent_subgraph.sh:89-118` | Code real; `wgc subgraph publish` is called by the shell wrapper. Live on stage requires control-plane creds (`COSMO_API_KEY` etc. per `docs/known-issues.md`). | Yes if creds set; otherwise the workflow runs through mock |
| Cosmo EDFS Kafka/NATS | `driver.py:214-222`; `apps/cosmo-router/config.yaml:44-68` | Config real; broker creds not committed (`docs/known-issues.md`). Driver's `register_edfs_events` returns mock bindings in `COSMO_MOCK=1`. No Kafka/NATS traffic is produced on stage. | NO if asked to show a topic produce |
| Chainguard wolfi-base | `infra/chainguard/Dockerfile.wolfi:12` | Live | Yes |
| SLSA Build Level 2 provenance | `infra/github-actions/release.yml:128-144` (slsa-github-generator v2) | Live in CI; stage runs verify-only | Yes (with the honest "built in CI, verified on stage" framing) |
| Build-time SBOM (in-process, not post-scan) | `release.yml:89-90` (`sbom: true` via BuildKit) + `:95-101` (syft fallback) | Live in CI | Yes |
| Keyless cosign + Fulcio + Rekor | `release.yml:114-120` (sign), `:196-203` (Rekor read-back); `scripts/verify_release.sh:43-71` | CI signs; stage verifies. | Yes (architecture §18 risk #1 already owns this honestly) |
| **Chainguard attestation predicate bug** | `release.yml:189-194` | **MINOR BUG inherited from verifier report Gap #6:** the `slsaprovenance` attestation is attached with `--predicate sbom.spdx.json` — the SBOM JSON is the predicate. A Chainguard engineer running `cosign verify-attestation ... \| jq .payload \| base64 -d` on stage will see SBOM fields instead of SLSA predicate fields. **This is the one supply-chain claim that will publicly fail if inspected.** | NO if inspected; yes if only verified |
| TinyFish CLI + Agent Skills | `apps/agent-template/src/tinyfish/cli.ts:23-61`; `loop.ts:49-64` | Live | Yes |
| TinyFish "2× vs MCP" | No code, no benchmark | **Vendor marketing quote** we repeat | Vendor may validate; we cannot |
| TinyFish "sub-250ms browser cold start" | README Demo Theater + arch §16 | **MARKETING ONLY — no benchmark harness, no prewarmer, no metric** (verifier Gap #4). | NO |
| TinyFish Mac Mini browser pool | `infra/fly/macmini-start.sh:50-53` (`tinyfish serve --pool-size`) | Code wired; physical Mac Mini availability on stage is a separate logistics question (Section 4 SPOF) | Yes if Mac Mini is on |
| InsForge Remote OAuth MCP | `apps/agent-template/src/insforge/mcp-client.ts:30-102` | Live (OAuth refresh loop + streamable HTTP transport) | Yes |
| InsForge Agent Skills (distinct from TinyFish Skills) | — | **Spec ambiguity.** README enumerates this; verifier Gap #4 flagged it as conflated with TinyFish skills. No InsForge-specific Agent Skills module in the repo. | NO |
| InsForge Model Gateway | `gemini_client.py:268-298` | Live (shim — POST to `MODEL_GATEWAY_URL`). Requires the env var, which is not in `.env.example` by default. | Partial |
| InsForge PostgREST | provisioned in `infra/insforge-pool/provision.sh`; **never called from any agent** (verifier Gap #7) | **Marketing-only from the stage-demo perspective.** The DreamQuery UI shows `insforge.postgrest://order_exports` as a resolver-stub backing string but no code reads from that URL. | NO |
| InsForge Edge Function Editor (Apr 1) | warm-pool capability flag only | **Marketing only** (verifier Gap #4) | NO |
| InsForge editable auth emails (Apr 7) | — | **Marketing only — zero code references** (verifier Gap #4) | NO |
| InsForge VS Code extension | — | Developer tooling, not runtime. Verifier marked N/A. Don't claim in the pitch. | N/A |
| Redis 8 Vector Sets int8 | `understudy/memory/vector.py:21-52`; `tests/test_int8_quantization.py` | Live (our own `VADD ... Q8` invocation); verified by unit test | Yes |
| Redis 8 LangCache | `understudy/memory/langcache.py:56-177` | Live (Redis-level; default embedder is a hash, not a sentence-transformer — see Section 3) | Partially |
| Redis 8 Agent Memory Server | `understudy/memory/ams.py:26-199` | Live (STM stream + LTM hash + topics + entities) | Yes |
| Redis 8 RedisVL | — | **Not used.** We issue raw `VADD`/`VSIM` via `execute_command` (`vector.py:88,100`), not the RedisVL helper lib. | NO if asked about RedisVL specifically |
| Redis + Google ADK bridge | — | **Marketing only — zero code references** (verifier Gap #4) | NO |
| Meta-agentic pipeline (Guild) | repo is the proof | Live | Yes, with caveat in Section 5 |

**Summary:** of ~26 sponsor features claimed, **18 have real runtime code**, **3 are provisioned-but-uncalled** (PostgREST, Edge Functions, "InsForge Agent Skills"), and **5 are pure marketing** (TinyFish sub-250ms, editable auth emails, ADK bridge, RedisVL, InsForge VS Code). Gap #6 — the SBOM-as-SLSA-predicate bug in `release.yml` — is a separate correctness issue that will fail a hostile `cosign verify-attestation ... | jq` inspection.

---

## Section 3: Benchmark claims

| Claim | Source | Our verification | Q&A language |
|---|---|---|---|
| **Gemini 3 Flash 78% SWE-bench Verified** | Google April 22, 2026 launch page | **None.** We repeat the vendor number. No local eval, no harness. | "That's Google's published April-22 number, not our measurement. We optimized for the accuracy compounding effect on our code-emission stage." |
| **Gemini 3 Flash beats 3.1 Pro on code (71% vs 78%)** | Google launch page | None. | Same as above — vendor-attributed. |
| **Int8 Vector Sets 75% memory reduction** | Our test | `tests/test_int8_quantization.py:27-31,57-67` asserts exactly 0.75 savings. Math is correct: float32 (4 bytes/dim) → int8 (1 byte/dim). | Defensible. "Here's the unit test." |
| **Int8 Vector Sets 99.99% accuracy retention** | Redis marketing + architecture.md §9 note | **GAP.** `tests/test_int8_quantization.py:70-93` asserts **>=99%**, not 99.99%. The test docstring explicitly says: *"Architecture cites 99.99% — we assert the looser 99% here because the scaling is per-vector symmetric; the 99.99% number from Redis marketing uses Redis's internal Q8 calibration which is tighter than our ctor-free helper."* So we assert 99%+, Redis says 99.99%, and we do not verify Redis's number. | "The 99.99% is Redis's published number against their internal Q8 calibration. Our symmetric quantization tests at 99%+ on a 1000-vector synthetic bench — above the 99% threshold we consider safe." Honest; leave the 99.99% in the architecture doc but don't repeat it on stage without the caveat. |
| **Int8 Vector Sets 30% recall speed-up** | Architecture.md §9 | **None.** No benchmark in the repo that measures VSIM throughput. | "Redis's published number. We haven't measured against a larger corpus." |
| **LangCache <50ms hit** | `tests/test_langcache.py:57-63` | **Passes, but on fakeredis.** Exact-hash hit on fakeredis with no serialization overhead. The real-Redis 8 latency will be different (but still well under 50ms on a LAN). Also: **exact-hash, not semantic.** Default embedder is `_default_hash_embed` (`langcache.py:36-49`) which is a deterministic SHA256 projection, so "semantic" hits require a real sentence-transformer (via the `langcache_embedder` ctor arg) that is **not wired in `MemoryClient.__init__`** by default. On stage, LangCache = exact-hash lookup. | "Under 50ms for the exact-hit path we demo. Semantic nearest-neighbor via VSIM is there but we didn't wire the sentence-transformer for the 24h build." Honest. |
| **LangCache "semantic" hit on stage** | Architecture §15 beat 2:30-2:40 "Run same query again → Redis LangCache hit <50ms" | Same query = exact hash match. This is a **tautology** — of course the same query hashes the same. The beat does not actually demonstrate semantic caching unless we word it carefully. | Reword beat: "Repeated query hits the cache — this is the exact-match path. Semantic similarity via VSIM would fire on a rephrased query, and that path is wired behind a Vector Set for production." |
| **500 agents per Mac Mini** | Architecture §9 note | **None.** No load test, no memory-footprint measurement. Just the int8 arithmetic implication. | "That's the implication of the int8 quantization arithmetic, not a measurement." |
| **~90s synthesis time** | README §Solution, UI fixture claims `87.4s avg` | **None in live mode.** In replay, it's sub-second. In live, we have no end-to-end timing. | "90 seconds is the architecture target against the three-model pipeline; we run the demo in hybrid mode so the judged timing is ~half that." |

**Top candidate for judge attack:** the **99.99% recall claim.** If the Redis product manager on the panel asks "how did you measure 99.99%", we must say "we didn't — that's your published number." The test defends 99%. If the architecture doc's §9 note is read aloud on stage and the number is challenged, we back down to 99%. Recommendation: **drop the 99.99% from pitch language; say "99%+ retention under our quantization, Redis publishes 99.99% with their internal calibration."**

**Second candidate: SWE-bench 78%.** We repeat Google's number. If a judge asks for our eval, we cannot produce one. Honest framing: "That's the published April-22 launch number — we picked 3 Flash specifically because code emission is where benchmark accuracy compounds."

---

## Section 4: Single-point-of-failure analysis

| Failure mode | Covered? | Evidence | Gap |
|---|:---:|---|---|
| Stage wifi dies | **Yes** in replay. | `gemini_client.py:161-170` short-circuits to `us:replay:*` Redis keys; `CosmoMockMCP` (`clients.py:147-209`) returns fixtures. | Replay keys must be prewarmed via `scripts/prewarm_demo.py` the night before. **If that script wasn't run, the demo dies silently with "DEMO_MODE=replay but key missing" warnings** (`gemini_client.py:167`). The synthesis pipeline will error out. No runbook assertion checks that the replay keys exist before the pitch begins. |
| Gemini 429 | **Yes** (in theory). | `gemini_client.py:197-207` falls back to InsForge Model Gateway via `MODEL_GATEWAY_URL`. | `MODEL_GATEWAY_URL` is not in `.env.example` by default (`docs/known-issues.md` lists missing vars). If unset, fallback raises `"MODEL_GATEWAY_URL not configured; cannot fall back"` (`gemini_client.py:283-284`). |
| Fulcio OIDC slowness | **Not applicable to stage.** | Stage runs `cosign verify` only, not `cosign sign` (arch §18 risk #1). Fulcio is only hit for root cert lookup on verify; Rekor for log lookup. Both are read-only, typically <2s. | None. |
| Cosmo MCP connection fail | **Yes.** | `COSMO_MOCK=1` → `CosmoMockMCP` (`driver.py:102-103`). Fixtures at `fixtures/cosmo/`. | None if env var set; silent fall-through to stdio (which will fail without `wgc`) if not set. |
| **Redis not running** | **NO — ALL agentic features die.** | AMS (`understudy/memory/ams.py`) + LangCache + Vector Sets + `us:replay:*` + `dream:{run_id}` + `run:synth:{run_id}` + deploy locks all require Redis. If Redis is down: (a) replay doesn't work, (b) prewarm is unreachable, (c) the synthesis pipeline's `redis.pipeline()` call at `pipeline.py:284-289` fails, (d) LangCache lookup fails, (e) the whole Redis §9 surface is inaccessible. | **This is the true SPOF.** No fallback beyond "don't let Redis die." The `docker-compose.yml` pins `redis:8` and the Redis 8 Cloud managed service is the production target. Mitigation: run a local Redis 8 Docker container on the demo laptop as hot backup; point `REDIS_URL` there if the cloud one is unreachable. **This isn't in the runbook.** |
| TinyFish browser pool on Mac Mini unreachable | **Partial.** | If the Mac Mini is off, `tinyfish serve` is down, `tinyfish run` from `apps/agent-template/src/tinyfish/cli.ts:45` fails. The core loop bubbles the error to the GraphQL resolver. | **No fallback path.** There is no "mock TinyFish CLI" equivalent to `CosmoMockMCP`. If beat 2:15-2:30 ("Mac Mini browser visible") fails because the Mini is powered off or networked wrong, we have no substitute. **Mitigation gap — propose adding a `TINYFISH_MOCK=1` env that returns a fixture browser-run result**, so beat 2:15-2:30 can fall back to a screen recording. |
| Per-agent Fly cold start exceeds 15s window | **Not mitigated.** | `infra/fly/agent.fly.toml.tmpl:47-49` has `auto_stop_machines = true, min_machines_running = 0`. First request is a cold start. | **Recommend pre-warming the stage agent** by deploying it 2 minutes before the pitch or temporarily setting `min_machines_running = 1` for that specific agent. |
| `scripts/prewarm_demo.py` not run the night before | **Implicit silent fail.** | `DEMO_MODE=replay` + missing keys → warning log + fall-through to live (`gemini_client.py:167-168`). On stage wifi that's broken, this cascades to a full pipeline failure. | **Add a runbook assert step:** before the pitch, run `redis-cli EXISTS us:replay:synth-demo-001 langcache:gemini:export-shopify-orders:*` and fail loudly if any are missing. Currently nothing enforces this. |
| `scripts/demo_mode_switch.sh` won't work as the runbook kill switch | **Known broken.** | `scripts/demo_mode_switch.sh:12-13` is an echo "TODO" (verifier Gap #3). The runbook (`docs/demo-runbook.md:14`) still says "Kill-switch: `scripts/demo_mode_switch.sh replay` flips to pure replay instantly." | **Document the manual `fly secrets set DEMO_MODE=replay` + `launchctl setenv DEMO_MODE replay` commands** in the runbook, OR implement the script. Without one of those, the runbook lies. |
| Cursor demo crash | **Covered** — we don't run Cursor on stage (arch §4 footnote, §18 risk #2). Terminal-only. | — | None. |

**Top SPOF the runbook does not cover: prewarm not executed.** The script is idempotent and fast, but nothing in the current runbook enforces "verify replay keys exist" before the pitch starts. Silent fall-through to live mode under broken stage wifi is the worst-case demo death. Add a pre-pitch assertion.

**Second SPOF: no TinyFish mock.** Unlike Cosmo (which has `COSMO_MOCK=1`) and Gemini (which has `DEMO_MODE=replay`), TinyFish has no fallback. If the Mac Mini is unreachable, beat 2:15-2:30 dies with no graceful degradation.

---

## Section 5: Meta-agentic framing honesty — agent vs deployment

The pitch says "the agent that builds agents." Is what we generate actually an **agent**?

**Definition test.** An agent (per 2026 industry usage):
- Autonomous — runs without human step-through
- Has persistent memory it *consults*, not merely writes
- Reasons about state before acting
- Can recover from failure without human intervention

**What `AgentCoreLoop.run()` does** (`apps/agent-template/src/core/loop.ts:66-115`):
1. Records the user turn to AMS (STM stream) — write-only.
2. Checks LangCache for an exact-hash hit of `(operation, skill, inputs)`. If hit → returns cached output.
3. On miss, shells out to `tinyfish run --skill {name}@{version} --script {path}` with `inputs` passed as JSON.
4. Writes the assistant turn to AMS.
5. Stores the result in LangCache.

**What it does NOT do:**
- **Never calls `memory.recall()`** (which exists at `apps/agent-template/src/memory/client.ts:152-181`). Before invoking TinyFish, it does not consult the Vector Set to check if a similar prior run exists and what happened.
- **Never reads LTM** (`memory/client.ts` lacks an `ltm()` getter; the Python peer has `AgentMemoryServer.ltm_records()` but it's not called from the TS core loop).
- **Never reasons about the inputs** — the script path is fixed at synthesis time; inputs are passed through unchanged.
- **No retry loop** on TinyFish failure; the error bubbles to the GraphQL resolver.

**Diagnosis.** The generated artifact is a **signed, deployed, federated, memory-logging scripted workflow**. It is not an agent in the "reasons-over-memory-then-acts" sense. It records memory; it does not use memory.

The **LangCache check** makes it behave like an agent for *repeated identical requests*. The **recall() capability exists but is not wired**. An agent that doesn't consult its long-term memory at inference time is, by most 2026 definitions, a deployment with a memory log.

**Honest framing options:**
1. **(Drop the framing)** "Understudy generates signed, typed, federated web workflow agents with persistent memory and a semantic cache." Accurate.
2. **(Defend narrowly)** "Understudy ships a deterministic deployment with per-agent memory and skill-pinning. The memory substrate is agent-grade; the runtime consults LangCache before acting, and LTM feedback shapes future synthesis runs." This is accurate — future syntheses CAN read AMS, even if the current runtime doesn't.
3. **(Fix it before stage)** Add 4-6 lines to `core/loop.ts` between step 2 and step 3 that call `memory.recall(embedInputs(inputs), k=3)` and pass the results into `runTinyFishFn` as context. This is a half-hour change. It doesn't make the generated code smarter, but it makes the framing honest: the agent now reads memory before it acts.

**Recommendation: option 3.** It's trivial to implement and it closes the biggest honesty gap in the pitch. Without it, a judge who reads `core/loop.ts:66-115` on GitHub after the talk will notice.

---

## Section 6: Team composition gap — the BizDev rule

README §Team + architecture §19 both cite Gary Chan's "no BizDev presenter = no win" rule. The architecture doc lists four roles:
- Systems hacker
- Full-stack
- Frontend / design
- **BizDev / presenter**

**Our virtual team:** per the task list (tasks #1-#16), our actual synthesized team is engineering-heavy — API builder, synthesis-worker builder, cosmo-driver engineer, memory engineer, router engineer, frontend designer, supply-chain engineer, deployment engineer, tests author, verifier, devils-advocate. Every synthesized role is engineering or review. **There is no BizDev/presenter teammate.** The README lists the role; no agent is assigned to it.

**What this means for the hackathon:**
- No one has done the "user interviews hours 1-4" (Gary's BizDev rule #1).
- No one is rehearsing the pitch with demo-theater-quality narration.
- The Q&A prep in this document is not the same thing as a practiced presenter.

**This is an organizational issue, not a code issue.** No amount of engineering fixes it. If the hackathon is won by the pitch (and Gary Chan's whole thesis is that it is), we are currently under-staffed on the one role that Gary says decides the win.

**Recommendation.** Before stage, one human on the team has to own the presenter role. That person needs to:
1. Memorize the 3-minute script (architecture §15 beat table is the source).
2. Rehearse the kill-switch procedure (manual fly secrets command since the script is a TODO).
3. Own the Q&A answers for the five open questions in Section 7.

This is not something devils-advocate can fix by editing code. Flag to team-lead as the single biggest non-engineering risk.

---

## Section 7: Top 5 questions a judge WILL ask — with suggested responses

### Q1 (Wundergraph engineer). "Show me a `wgc mcp serve --stdio` call actually returning a Dream Query result live, with a real live-traffic window. Not the fixture."

**The bluff.** On stage in `DEMO_MODE=hybrid` + `COSMO_MOCK=1`, we are showing `CosmoMockMCP` fixtures (`apps/cosmo-mcp-driver/clients.py:147-209`) and rendering `client_ops_sampled: 4,212` from `apps/web/src/fixtures/demo.ts:112`.

**Honest answer.** "On stage we run in mock mode for determinism. The stdio client at `apps/cosmo-mcp-driver/clients.py:31-100` is the real JSON-RPC transport — I can run it against a live Cosmo sandbox in Q&A. We do not have live client traffic because we don't have live clients yet; the 4,212 number is fixture data representing the validation signal Cosmo would produce in production."

### Q2 (Chainguard engineer). "Run `cosign verify-attestation --type slsaprovenance ... | jq .payload | base64 -d` right now and show me a real in-toto SLSA predicate."

**The bluff.** `release.yml:189-194` attaches the SBOM JSON as the SLSA predicate. The attestation exists, but its payload is SBOM data, not SLSA-style `{builder, invocation, materials}` in-toto format. `cosign verify-attestation` will pass; `jq .payload | base64 -d` will show the wrong structure.

**Honest answer if inspected.** "That's a known bug — fix is pending (conformance Gap #6). The SLSA generator (slsa-github-generator v2.0.0) does emit a real provenance, but our attest step references the wrong artifact. The v2.0.0 generator attaches its own attestation to the image; so yes, there *is* a real SLSA attestation on the image, from the generator job — the bug is that our `attest-and-verify` job ALSO attaches a second, malformed one." **Fix before stage if possible** — swap `--predicate sbom.spdx.json` for the generator's provenance output file. See `release.yml:189-194`. 5-minute fix.

### Q3 (Redis product manager). "How did you measure 99.99% recall retention?"

**The bluff.** Architecture §9 + README cite 99.99%. Our `tests/test_int8_quantization.py:70-93` asserts 99%+, not 99.99%. The test docstring explicitly walks back the 99.99% claim.

**Honest answer.** "99.99% is Redis's published number with your internal Q8 calibration, which is tighter than our per-vector symmetric quantization. Our unit test — `tests/test_int8_quantization.py:70-93`, 1000 vectors × 128 dims, 50 queries — asserts 99%+ top-1 agreement. Above the threshold we think is safe for the AMS recall path."

### Q4 (Gemini solutions architect). "You cite 78% SWE-bench Verified for 3 Flash. Did you run your own eval?"

**The bluff.** No. We repeat Google's April-22 launch number.

**Honest answer.** "No, we use your published April-22 number. We selected 3 Flash for the script-emission stage specifically because that's where benchmark accuracy compounds — our pipeline re-emits on validation failure, so higher first-try accuracy means fewer retries, lower tail latency, and a smaller dollar cost. We treat your SWE-bench number as an oracle, not a measurement we reproduce."

### Q5 (Anyone with a laptop). "Where does `insforge.postgrest://order_exports` come from? Show me the table, the REST call, the auth."

**The bluff.** The Dream Query UI shows "backing: insforge.postgrest://order_exports" (`apps/web/src/pages/DreamQuery.tsx:184`) as if a resolver actually reads from PostgREST. **No agent code calls any PostgREST URL** (verifier Gap #7). `apps/api/store.py:3` explicitly says the store is in-memory until backend wire-up lands.

**Honest answer.** "The PostgREST URL is the declared backing in the resolver stub — generated by Dream Query's proposal step. The runtime access path today goes through InsForge's Remote OAuth MCP (`apps/agent-template/src/insforge/mcp-client.ts:30-102`), not PostgREST directly. We chose MCP-first because the OAuth model is cleaner for per-agent tenancy; PostgREST is provisioned in the warm-pool (`infra/insforge-pool/provision.sh`) for admin access. We haven't shipped the hot-path PostgREST caller in the 24-hour build."

---

## Section 8: Bluffs to drop before stage

**Drop from the pitch (stop claiming these):**

1. **"TinyFish sub-250ms browser cold start."** No benchmark in code. Architecture.md §16 + README §Solution. If asked, we cannot show a number. Delete from README's prize-stacking row for TinyFish.
2. **"InsForge editable auth emails (Apr 7)."** Zero code references. Delete from README and architecture §16.
3. **"Redis + Google ADK bridge."** Zero code references. Delete from README and architecture §16.
4. **"InsForge Edge Function Editor (Apr 1)."** Only a capability flag in warm-pool YAML, no code. Delete unless we add a thin caller in the next 6 hours.
5. **"99.99% accuracy retention"** on stage. Replace with "99%+ under our quantization; Redis publishes 99.99% with their internal Q8 calibration."

**Re-word (don't drop, but stop overstating):**

1. **"Live `cosign verify` + `cosign verify-attestation` on stage"** → "cosign verify runs live against the pre-built image signed in CI" (architecture §18 risk #1 already has this — align the pitch language to it).
2. **"Every table auto-exposed as REST via PostgREST"** → "Every table has a typed schema and MCP accessor; PostgREST is available for admin access, not the agent hot path."
3. **"LangCache hit <50ms"** → "Exact-hash LangCache hit <50ms; semantic fallback via VSIM is wired but not tuned for this demo."
4. **"Understudy: the agent that builds agents"** → either fix the core loop (Section 5 option 3) or reword to "Understudy: the synthesizer that ships signed, typed, memory-logging deployments." **Recommendation: fix the core loop; the framing is too load-bearing to drop.**
5. **"Cosmo validated against 4,212 live client ops"** → drop the specific number in mock mode; say "Cosmo's live-traffic validator would run against real client traffic in production — here's the fixture signal."

**Defend (don't drop):**

1. **Three-model Gemini pipeline.** Real, pinned, tested. Keep.
2. **Cosmo Dream Query as the core schema synthesis primitive.** Real code, real four-method driver. Keep the framing even if the live demo is fixture-backed.
3. **SLSA L2 + cosign + Rekor.** Real in CI. Demo shows verify. The predicate bug in `release.yml:189-194` should be fixed before stage but the architecture is honest.
4. **Int8 Vector Sets 75% memory reduction.** Unit-test backed. Keep.
5. **Per-agent AMS namespace.** Real — `understudy/memory/ams.py:48` + `apps/agent-template/src/memory/client.ts:64-66`. Keep.
6. **Chainguard wolfi-base + skill pinning + pre-start cosign verify gate.** Real in Fly, Mac Mini, and the agent verify-self container. Keep.

---

## Closing

**Ship or don't ship?** Ship. The engineering is real. The gaps are in the pitch, not the code — and pitch gaps are editable in the next few hours. Specifically:

1. Drop the five claims in Section 8.
2. Fix the `release.yml:189-194` SLSA predicate bug (5 minutes).
3. Wire `memory.recall()` into `core/loop.ts` step 2.5 (30 minutes) — closes the agent-vs-deployment honesty gap.
4. Implement `scripts/demo_mode_switch.sh` or rewrite the runbook to use manual `fly secrets set` (15 minutes).
5. Add a pre-pitch assertion script that checks replay keys exist (10 minutes).
6. Pre-warm one stage agent Fly machine (set `min_machines_running = 1` for a known agent id 5 minutes before the pitch).
7. **Assign a human presenter.** Not a code fix — the biggest non-code risk.

With those seven changes, the pitch is defensible under hostile Q&A. Without them, specifically without #1 and #3 and #7, the risk concentrates on one of the Q&A questions in Section 7 producing a visible backdown on stage.

— devils-advocate, 2026-04-23
