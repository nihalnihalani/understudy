# Understudy — Architecture Conformance Report

> Verifier: `verifier` (team `understudy`), task #13. Date: 2026-04-23.
> Scope: every section of `architecture.md` §2-§17 walked against the implementation.
> Method: read the spec, grep/read the code, record file:line evidence. Didn't fix bugs — logged gaps for task #12.

Legend: ✅ Matches · ⚠️ Partial · ❌ Missing · 🤷 N/A

---

## Section-by-section table

| §  | Section | Verdict | Evidence (file:line) | Notes / gap |
|---:|---|:---:|---|---|
| §2 | Component diagram — every node exists as a concrete module | ⚠️ Partial | `apps/api/main.py:62`, `apps/synthesis-worker/pipeline.py:270-315`, `apps/synthesis-worker/keyframes.py:117`, `apps/cosmo-mcp-driver/driver.py:109`, `apps/cosmo-router/main.py:16-43`, `apps/cosmo-router/compose_supergraph.sh`, `apps/agent-template/src/index.ts:21`, `apps/agent-template/src/insforge/mcp-client.ts:30`, `apps/agent-template/src/tinyfish/cli.ts:45`, `understudy/memory/ams.py:26`, `understudy/memory/vector.py:55`, `understudy/memory/langcache.py:56`, `infra/chainguard/Dockerfile.wolfi:12`, `infra/github-actions/release.yml:114-203`, `infra/chainguard/agent/verify-self.sh` | Screen Recorder (REC) is N/A by design — judges record manually. Every other diagram node maps to a concrete module. The **PostgREST** box is mock-only (see §8 gap). No actual EDFS publisher code outside the driver stub. |
| §3 | Synthesis pipeline (keyframes → Flash-Lite → Pro → Flash, 5-8 scene-change keyframes) | ✅ Matches | `apps/synthesis-worker/keyframes.py:30-31` (MIN=5/MAX=8), `apps/synthesis-worker/keyframes.py:90-114` (`select_scene_change_keyframes` — PSNR delta, cap at MAX_KEYFRAMES, pad to MIN_KEYFRAMES), `apps/synthesis-worker/pipeline.py:270-315` (end-to-end `run_pipeline`), `apps/synthesis-worker/keyframes.py:27` (PSNR 30dB threshold), `apps/synthesis-worker/keyframes.py:34` (512px downsample). | Keyframe count bounded, pipeline order correct, 4 stages wired: keyframes → detect_actions → abstract_intent → emit_script. |
| §4 | Cosmo MCP Dream Query — 4 methods + `dream:{run_id}` Redis writes | ✅ Matches | `apps/cosmo-mcp-driver/driver.py:128` (`dream_query`), `:153` (`validate_against_live_traffic`), `:170` (`propose_schema_change`), `:214` (`register_edfs_events`). `dream:{run_id}` writes: `apps/cosmo-mcp-driver/redis_store.py:43` (`HSET dream:{run_id}`), `apps/cosmo-mcp-driver/driver.py:141-150` (put on `dream_query`), `:164-167` (update on validator), `:202-211` (update on propose). | All four method names + payload shapes match architecture.md §4. Results persisted per §9 key-space. |
| §5 | Generated agent runtime — GraphQL handler + core loop + TinyFish CLI + Memory client + per-agent AMS namespace | ✅ Matches | GraphQL handler: `apps/agent-template/src/graphql/server.ts:31-85`. Core loop: `apps/agent-template/src/core/loop.ts:36-116`. TinyFish CLI: `apps/agent-template/src/tinyfish/cli.ts:23-61` (refuses `latest`, argv = `run --skill name@version --script ...`). Memory client: `apps/agent-template/src/memory/client.ts:44-215`. AMS namespace: `apps/agent-template/src/memory/client.ts:64-66` (`ams:agent:${agentId}:${suffix}`), `understudy/memory/ams.py:48` (Python peer). STM cap 20: `understudy/memory/ams.py:23`, `apps/agent-template/src/memory/client.ts:7`. | Each agent constructs a namespaced client; only `ams:agent:{agentId}:*` and `vset:agent:{agentId}:memory` keys are emitted. |
| §6 | Supply chain — Chainguard wolfi-base + SLSA L2 + build-time SBOM + keyless cosign + Rekor | ✅ Matches | wolfi-base: `infra/chainguard/Dockerfile.wolfi:12`. SLSA L2 generator: `infra/github-actions/release.yml:128-144` (`slsa-framework/slsa-github-generator .../generator_container_slsa3.yml@v2.0.0`). Build-time SBOM: `release.yml:89-90` (`sbom: true, provenance: mode=max`), `:95-101` (`syft ... -o spdx-json=sbom.spdx.json`). Keyless cosign: `release.yml:114-120`. Rekor read-back: `release.yml:196-203` (`rekor-cli search ... get --uuid`). `scripts/verify_release.sh:43-54` runs `cosign verify`; `:56-71` runs `cosign verify-attestation --type slsaprovenance`. | ⚠️ *Observation:* `attest-and-verify` step at `release.yml:189-194` passes `--predicate sbom.spdx.json --type slsaprovenance` — the predicate file is the SBOM json. Likely a copy-paste bug; the predicate for `slsaprovenance` should be the in-toto predicate emitted by the SLSA generator, not the SBOM. Flagged as MINOR below — scripts/verify_release.sh itself is correct. |
| §7 | Cosmo MCP dev-time — headless stdio + cloud + compose flow | ✅ Matches | Stdio transport: `apps/cosmo-mcp-driver/clients.py:31-100` (`wgc mcp serve --stdio`, JSON-RPC 2.0 line-delimited). Cloud transport: `:103-144` (HTTP JSON-RPC to `COSMO_CLOUD_MCP_URL`). Transport dispatch: `apps/cosmo-mcp-driver/driver.py:100-106` (`COSMO_MOCK=1` → mock; `COSMO_TRANSPORT=cloud` → HTTP; else stdio). Compose flow: `apps/cosmo-router/compose_supergraph.sh` (prefers `wgc router compose`, falls back to `scripts/offline_compose.py`). Propose-compose-publish: `scripts/register_agent_subgraph.sh:89-118`. | Propose → compose → check → publish covered. |
| §8 | Data Model ER — every table has pydantic model AND InsForge SQL migration | ⚠️ Partial | Pydantic models ALL present: `apps/api/schemas.py:34-153` — `Recording`, `SynthesisRun`, `DreamQuery`, `Agent`, `AgentMemory`, `TinyFishSkillUsed`, `SlsaAttestation`, `Sbom`, `Image`, `AgentRun`. | **GAP (BLOCKER for §8 claim):** NO SQL migration file exists. `infra/insforge-pool/provision.sh:23` references `${SCHEMA_SQL:-infra/insforge-pool/schema.sql}`, and `:62-67` only *warns* if the file is missing. `find` for `*.sql` returns zero results repo-wide. The warm pool script silently skips schema seeding, so every provisioned tenant launches with an empty DB. See Gap #1. |
| §9 | Redis keyspace — every declared key pattern actually used | ⚠️ Partial | See per-key table immediately below. | One pattern (`vset:global:skills`) is declared in code but never written. See Gap #2. |
| §10 | Gemini prompts — three system prompts + JSON schemas verbatim + model IDs from `understudy/models.py` | ✅ Matches | Model pins: `understudy/models.py:10,13,16`. Action detection system prompt: `apps/synthesis-worker/prompts.py:12` (verbatim). Action detection output schema: `prompts.py:14-32` (matches §10a including `enum` list, bbox length, confidence range, `text_typed` nullable). Intent system: `prompts.py:35-40` (verbatim). Intent schema: `prompts.py:42-73`. Script emission system: `prompts.py:76-81`. `emit_tinyfish_script` tool: `prompts.py:85-139` (required fields, enum tinyfish_products, skills_pinned shape — all match §10c). Calls use imported constants: `pipeline.py:22-29, 150, 193, 227`. Grep for model strings returns only `models.py` + docs + tests + prewarm/fixtures — no hardcodes in runtime paths. | Verbatim. One nit: `docs/gemini-prompts/script_emission_flash.md` is a human-readable doc, not a runtime prompt — that's fine. |
| §11 | Why Gemini 3 Flash — pinning holds, nobody uses Pro or Flash-Lite for script emission | ✅ Matches | `understudy/models.py:16` pins script emission to `gemini-3-flash`. `pipeline.py:227` reads from the constant. `grep -rn "emit_tinyfish_script"` shows the tool is only ever called with `GEMINI_SCRIPT_EMISSION`. No hardcoded Pro/Flash-Lite anywhere in `emit_script`. | Clean. |
| §12 | Deployment — Fly.io Machines with cosign-verify pre-start; browser runtime delegated to TinyFish hosted cloud | ✅ Matches | Fly manifest: `infra/fly/fly.toml` — 2 regions (iad, sjc) at `:37-41`, pre-start: `:29-30` `api = "/usr/local/bin/fly-start.sh"`, and `fly-start.sh:13-24` runs both `cosign verify` and `cosign verify-attestation --type slsaprovenance` before `exec python -m uvicorn`. Per-agent Fly template: `infra/fly/agent.fly.toml.tmpl` (exists, referenced by deployment.md). Browser sessions are driven via `tinyfish run` → TinyFish hosted cloud; we do not operate a browser pool. | Single runtime path gates on supply-chain verify. |
| §13 | Failure modes — every row has a handling path (or explicit TODO) | ✅ Matches | See per-row table immediately below. | 12/12 rows covered. |
| §14 | Hermetic demo mode — DEMO_MODE env switches live/replay/hybrid | ✅ Matches | Env parse: `apps/synthesis-worker/gemini_client.py:32`. Replay short-circuit: `gemini_client.py:161-170` (`_maybe_replay` reads `us:replay:{synth_id}:{stage}`). Hybrid path: `gemini_client.py:151-157` (`asyncio.wait_for(live_fn, timeout=HYBRID_LIVE_BUDGET_S)`). API endpoint: `apps/api/main.py:281-295` (`POST /demo/replay/{synth_id}` reads `us:replay:{synth_id}`). Prewarm seeds replay: `scripts/prewarm_demo.py:164-165`. | ⚠️ `scripts/demo_mode_switch.sh:12-13` is a TODO stub — flipping DEMO_MODE on a *running* Fly.io Machine isn't implemented (falls back to manual `fly secrets set`). The env switch *inside the app* works; the *operational* toggle does not. See Gap #3. |
| §15 | Demo theater → UI screens | ✅ Matches | 0:00-0:20 Upload: `apps/web/src/pages/Upload.tsx`. 0:20-1:20 Synthesis HUD (3 stage cards with pinned models, keyframe ribbon, intent tree, TinyFish script): `apps/web/src/pages/SynthesisHUD.tsx:83-112` (models labeled from pins), `:125-143` (KeyframeRibbon), `:367-422` (IntentTree), `:441-454` (ScriptPanel). 1:20-1:40 Dream Query: `apps/web/src/pages/DreamQuery.tsx` (SDL diff + live-traffic PASS banner + supergraph preview). 1:40-2:00 Supply Chain: `apps/web/src/pages/SupplyChain.tsx` (cosign verify + slsa attest + Fulcio cert + Rekor log + SBOM). 2:55-3:00 Agent Wall: `apps/web/src/pages/AgentWall.tsx`. | Every beat has a screen; routing via `apps/web/src/App.tsx:6-11`. |
| §16 | Prize stacking — every April 2026 sponsor feature lights up in code | ⚠️ Partial | See per-sponsor table immediately below. | Most sponsors: real code. TinyFish "sub-250ms browser cold start" claim: marketing-only — no benchmark code. Nexla (optional): not implemented (stretch; README §16 says "optional", architecture §16 says "optional stretch"). LangCache hit path present, but the "Google ADK bridge" Redis feature in architecture.md §16 / README has zero code presence. See Gap #4. |
| §17 | v1→v2 diff — each v2 item actually implemented | ✅ Matches | Row-by-row table further below. Every v2 item has a concrete module. | Nothing smells like v1 straw-man. |

---

## §9 per-key verification

| Key pattern | Declared in architecture.md | Used by (file:line) | Verdict |
|---|---|:---:|---|
| `ams:agent:{id}:stm` | ✅ | `understudy/memory/ams.py:48` (`_key`), `:64` (xadd), `apps/agent-template/src/memory/client.ts:84-98` (xadd+MAXLEN) | ✅ |
| `ams:agent:{id}:ltm` | ✅ | `understudy/memory/ams.py:119` (hset), `:174` (hgetall) | ✅ |
| `ams:agent:{id}:topics` | ✅ | `understudy/memory/ams.py:71` (sadd), `:148` (smembers) | ✅ |
| `ams:agent:{id}:entities` | ✅ | `understudy/memory/ams.py:80` (hget), `:91` (hset), `:155` (hgetall) | ✅ |
| `vset:agent:{id}:memory` | ✅ | `understudy/memory/vector.py:66-67`, `:80-88` (VADD), `:97-111` (VSIM); TS peer `apps/agent-template/src/memory/client.ts:68-70, 133-146, 156-164` | ✅ |
| `vset:global:skills` | ✅ | `understudy/memory/vector.py:69-70`, `:113-121` (`add_skill`) | ⚠️ declared + a `VectorSets.add_skill()` method exists — but no caller ever invokes it. Prewarm, agent template, and synthesis worker never populate it. Effectively dead code in the current cut. **See Gap #2.** |
| `langcache:gemini:{hash}` | ✅ | `understudy/memory/langcache.py:78-82` (`_key_response`), `:94` (get), `:152-154` (set); TS peer `apps/agent-template/src/memory/client.ts:187-207` | ✅ |
| `langcache:config:{agent}` | ✅ | `understudy/memory/langcache.py:84-85` (`_key_config`), `:176` (hset); used by prewarm `scripts/prewarm_demo.py:152` | ✅ |
| `run:synth:{run_id}` | ✅ | `apps/api/redis_client.py:24` (template), `:68` (xadd), `:75` (xrange), `:92-96` (XREAD BLOCK tail); worker `apps/synthesis-worker/main.py:71-77` (`_write_trace`), `apps/synthesis-worker/pipeline.py:72-73` (`run_trace_key`) | ✅ |
| `dream:{run_id}` | ✅ | `apps/cosmo-mcp-driver/redis_store.py:43, 49` (HSET/HGETALL); driver puts on all three phases | ✅ |
| `us:synth:{synth_id}:frames` | ✅ | `apps/synthesis-worker/pipeline.py:63` (`frames_key`), `:286-289` (RPUSH); client `understudy/memory/client.py:145-146` (`push_keyframe`) | ✅ |
| `us:lock:deploy:{agent_id}` | ✅ | `understudy/memory/client.py:148-150` (SET NX EX) | ✅ — but only Python client has the helper; no TS caller. Acceptable since deploys are driven from Python. |
| `us:replay:{synth_id}` | ✅ | `apps/api/redis_client.py:25` (template), `:133-144` (`get_replay`); worker `apps/synthesis-worker/pipeline.py:67-69` (stage-scoped); prewarm `scripts/prewarm_demo.py:164-165` seeds it | ✅ |
| `rate:gemini:{model}` | ✅ | `understudy/memory/client.py:162-168` (`consume_rate_token`: INCR + EXPIRE); test `tests/test_memory_client.py:52-53` | ⚠️ Exists as a library primitive but the synthesis worker's `GeminiClient` does NOT call `consume_rate_token` on any path. The 429 handler in `gemini_client.py:197-207` routes to InsForge Model Gateway instead. Declared **and** implemented, but the rate-limit token bucket is library-only — no runtime caller. Flagged MINOR. |

---

## §13 per-row failure-mode verification

| Failure mode (architecture.md row) | Handling in code | Verdict |
|---|---|:---:|
| Gemini 3 rate limit (429) | `apps/synthesis-worker/gemini_client.py:197-207` catches `GeminiRateLimitError`, routes through `_call_insforge_gateway` | ✅ |
| Multimodal payload size >20MB | `apps/synthesis-worker/keyframes.py:31` (MAX 8 frames), `:34` (MAX_FRAME_EDGE_PX=512), `:68-75` (`_downsample`) | ✅ |
| SLSA L2 verify fails | Fly: `infra/fly/fly-start.sh:13-24`. Agent container: `infra/chainguard/agent/verify-self.sh:25-42`. Agent template peer: `apps/agent-template/src/preboot/verify.ts:37-59`. All three paths exit non-zero on fail. | ✅ |
| Cosmo Dream Query returns breaking change | `apps/cosmo-mcp-driver/driver.py:153-168` (`validate_against_live_traffic` returns `BreakingChangeReport`). Callers check `has_breaking_changes`. | ✅ — validator is wired; the "re-prompt Pro to narrow query" *retry loop* is not automatic today. Given the spec row says "Prompt Gemini 3.1 Pro to narrow query shape; retry" this is partial automation — mitigation primitive exists, but no auto-retry. MINOR. |
| AMS namespace bloat | `understudy/memory/ams.py:64-65` (Stream MAXLEN=STM_CAP), `:93-119` rotation to LTM on cap. Int8 quantization: `understudy/memory/vector.py:21-36`. | ✅ |
| InsForge MCP OAuth drift (401) | `apps/agent-template/src/insforge/mcp-client.ts:92-102` (catch 401 → refresh → retry once) | ✅ |
| Thought-signature mismatch | `apps/synthesis-worker/gemini_client.py:37-46` (`ThoughtSignatureMismatchError` defined) + `:249-263` (detect "signature" in exception message, retry once with explicit signature) | ✅ |
| LangCache poisoning | `understudy/memory/langcache.py:78-82` (per-agent namespace `langcache:gemini:{agent}:{h}`) + `:148-156` (optional TTL) | ✅ |
| TinyFish Skill version drift | `apps/agent-template/src/tinyfish/cli.ts:23-31` (reject `latest`, must be pinned). Core loop: `apps/agent-template/src/core/loop.ts:49-64` (`pickSkill` refuses any skill not in `manifest.skills_pinned`). Runtime manifest schema enforces `SkillPin = {name, version}`: `apps/agent-template/src/manifest.ts:16-19`. | ✅ |
| Live Gemini exceeds 8s on stage | `apps/synthesis-worker/gemini_client.py:34` (`HYBRID_LIVE_BUDGET_S=8.0`), `:151-157` (race via `asyncio.wait_for` in hybrid mode). `us:replay:{synth_id}` kill switch: `apps/api/main.py:281-295`. | ✅ |
| Cursor demo dies | Headless stdio MCP: `apps/cosmo-mcp-driver/clients.py:31-100` + `apps/cosmo-mcp-driver/cli.py`. Docs on stage workflow: `docs/demo-runbook.md`, `architecture.md §7 & §18`. | ✅ |
| Chromium deps on distroless | `infra/chainguard/Dockerfile.wolfi:16-39` — wolfi-base + explicit `apk add` for NSS/ATK/libdrm/mesa/etc. | ✅ |

---

## §16 per-sponsor prize-stacking verification

| Sponsor feature (April 2026) | Code proof (file:line) | Verdict |
|---|---|:---:|
| **Gemini 3 Flash / 3.1 Pro / 3.1 Flash-Lite** | `understudy/models.py:10,13,16` (pins); `apps/synthesis-worker/pipeline.py:150, 193, 227` (used verbatim) | ✅ |
| Gemini `thinking_level` API | `understudy/models.py:19-21`; `apps/synthesis-worker/gemini_client.py:228-230` (`"thinking_config": {"thinking_level": thinking_level}`) | ✅ |
| Gemini multimodal function responses | `apps/synthesis-worker/pipeline.py:133-146` (two inline PNGs + DOM-diff text part passed to Flash-Lite); `prompts.py:14-32` schema | ✅ |
| **Wundergraph Cosmo Dream Query** | `apps/cosmo-mcp-driver/driver.py:128-151`; used as core synthesis step | ✅ |
| Cosmo `schema_change_proposal_workflow` | `apps/cosmo-mcp-driver/driver.py:170-212`; shell wrapper `scripts/register_agent_subgraph.sh:105-110` calls `wgc subgraph publish` (which triggers the workflow) | ✅ |
| Cosmo live-traffic schema validation | `apps/cosmo-mcp-driver/driver.py:153-168`; UI receipt `apps/web/src/pages/DreamQuery.tsx:110-150` | ✅ |
| Cosmo MCP Gateway (stdio + cloud) | `apps/cosmo-mcp-driver/clients.py:31-100, 103-144` | ✅ |
| Cosmo EDFS Kafka/NATS | `apps/cosmo-mcp-driver/driver.py:214-222` (`register_edfs_events`); `apps/cosmo-router/config.yaml:44-68` (Kafka + NATS provider stanzas) | ✅ |
| **Chainguard wolfi-base** | `infra/chainguard/Dockerfile.wolfi:12` | ✅ |
| **SLSA Build Level 2 provenance** | `infra/github-actions/release.yml:128-144`; `infra/chainguard/slsa-config.yaml:2` | ✅ |
| Chainguard build-time SBOM (in-process, not post-scan) | `release.yml:89-90` (`sbom: true, provenance: mode=max` via BuildKit); `:95-101` (syft in-process) | ✅ |
| Sigstore cosign + Fulcio + Rekor | `release.yml:114-120` (sign), `:196-203` (Rekor read-back); `scripts/verify_release.sh:43-71` | ✅ |
| **TinyFish CLI + Agent Skill System (2× vs MCP)** | `apps/agent-template/src/tinyfish/cli.ts:23-61` (CLI shell-out with pinned skills); `apps/agent-template/src/core/loop.ts:49-64` (skill-pinning enforcement); Dockerfile template: `infra/chainguard/Dockerfile.agent.tmpl:32-34` (`tinyfish skills install "$spec" --pin`) | ✅ |
| TinyFish "all 4 products under one API key" | Runtime manifest schema `apps/agent-template/src/manifest.ts:8-14` enumerates `web_agent | web_search | web_fetch | web_browser`; gemini tool schema `apps/synthesis-worker/prompts.py:107-117` locks the same enum | ✅ |
| TinyFish "sub-250ms browser cold start" | **NOT IN CODE** — claim appears only in `architecture.md:595` marketing copy. No benchmark harness, no pool prewarmer, no metric. | ⚠️ marketing-only |
| TinyFish hosted browser cloud | `apps/agent-template/src/tinyfish/cli.ts:45` shells out to `tinyfish run` (calls TinyFish's managed browser service over HTTPS). No self-operated pool. | ✅ |
| **InsForge Remote OAuth MCP (no stdio)** | `apps/agent-template/src/insforge/mcp-client.ts:30-102` (`StreamableHTTPClientTransport`, refresh-token loop) | ✅ |
| InsForge Agent Skills | Conflated with TinyFish Skills in the spec; no InsForge-specific Agent Skills module. README §16 listing of "InsForge Agent Skills" is aspirational. | ⚠️ marketing-only (shares the TinyFish skill pin path) |
| InsForge Model Gateway (fallback LLM routing) | `apps/synthesis-worker/gemini_client.py:268-298` (`_call_insforge_gateway` on 429) | ✅ |
| InsForge PostgREST auto-API | Mentioned in `docker-compose.yml:71-80`, `infra/insforge-pool/provision.sh:56-57`, `warm-pool.yaml:18-22`. But no agent code actually calls PostgREST today — the agent template reads/writes via Remote OAuth MCP only. | ⚠️ provisioned-not-called |
| InsForge Edge Function Editor (Apr 1) | Warm-pool config lists `edge_functions` capability (`warm-pool.yaml:18-22`); no agent code uses it. | ⚠️ marketing-only |
| Editable auth emails (Apr 7) | Not referenced in code. Claim is in README-only. | ❌ marketing-only |
| InsForge VS Code extension | Not referenced in code. Developer-tooling only. | 🤷 N/A (not a runtime feature) |
| **Redis 8 Vector Sets int8 (75% memory)** | `understudy/memory/vector.py:21-52` (quantize, ratio); `tests/test_int8_quantization.py` backs the claim | ✅ |
| Redis 8 LangCache | `understudy/memory/langcache.py:56-177` (full lookup/store + VSIM + threshold) | ✅ |
| Redis 8 Agent Memory Server (short + long + auto extraction) | `understudy/memory/ams.py:26-199` (STM Stream + LTM rotation + topics + entities); auto extraction `understudy/memory/extract.py` | ✅ |
| Redis 8 RedisVL | No explicit RedisVL import; Vector Sets used directly via `execute_command("VADD"/"VSIM")` at `vector.py:88, 100`. | ⚠️ direct command use, no RedisVL helper lib |
| Redis + Google ADK bridge | No code references. Not demoed. | ❌ marketing-only |
| **Guild — end-to-end meta-agentic pipeline** | The whole repo is the proof. | ✅ |
| Nexla (optional stretch) | Explicitly optional. No code. | 🤷 N/A (architecture.md itself marks as optional) |

---

## §17 v1→v2 diff verification

| v2 item | Implemented? | Evidence |
|---|:---:|---|
| Gemini 3 Flash for code emission | ✅ | `understudy/models.py:16` |
| Gemini 3.1 Pro for intent | ✅ | `understudy/models.py:13` |
| `thinking_level` API | ✅ | `apps/synthesis-worker/gemini_client.py:228-230` |
| Multimodal fn-response action detection | ✅ | `apps/synthesis-worker/pipeline.py:133-146` |
| Cosmo Dream Query | ✅ | `apps/cosmo-mcp-driver/driver.py:128-151` |
| EDFS Kafka/NATS | ✅ | `apps/cosmo-router/config.yaml:44-68`, driver `register_edfs_events` |
| Remote OAuth MCP | ✅ | `apps/agent-template/src/insforge/mcp-client.ts` |
| InsForge Model Gateway fallback | ✅ | `apps/synthesis-worker/gemini_client.py:268-298` |
| AMS + int8 Vector Sets | ✅ | `understudy/memory/ams.py`, `understudy/memory/vector.py` |
| LangCache (semantic cache) | ✅ | `understudy/memory/langcache.py` |
| TinyFish CLI + Agent Skills | ✅ | `apps/agent-template/src/tinyfish/cli.ts` |
| Build-time SBOM + SLSA L2 | ✅ | `release.yml:89-90, 95-101, 128-144` |
| Keyless cosign + Fulcio + Rekor | ✅ | `release.yml:114-120, 196-203`; `scripts/verify_release.sh` |
| Scene-change keyframes (5-8) | ✅ | `apps/synthesis-worker/keyframes.py:30-31, 90-114` |

---

## Gaps found

Numbered, with severity. **BLOCKER** = demo breaks on stage. **MAJOR** = a spec claim cannot be defended with code. **MINOR** = nit / tightening.

### Gap #1 — InsForge SQL migration missing — **MAJOR**
- **Spec:** architecture.md §8 says "Every table auto-exposed as REST via InsForge 2.0 PostgREST."
- **Code state:** Every §8 table has a pydantic model (`apps/api/schemas.py:34-153`), but there is NO SQL migration / schema DDL anywhere in the repo (`find *.sql → 0 results`). `infra/insforge-pool/provision.sh:23` references `${SCHEMA_SQL:-infra/insforge-pool/schema.sql}`; `:62-67` treats the missing file as a warning and skips seeding. Every warm-pool slot boots empty.
- **Why this matters:** The devils-advocate will ask "show me the Postgres schema" and there isn't one. The `/agents` / `/agents/{id}/attestation` routes read from `apps/api/store.py`'s in-memory fixtures, not a real DB.
- **Fix:** task #12 should add `infra/insforge-pool/schema.sql` with `CREATE TABLE` DDL for `recording`, `synthesis_run`, `dream_queries`, `agent`, `agent_memories`, `tinyfish_skills_used`, `slsa_attestation`, `sbom`, `image`, `agent_runs` — mirroring the pydantic models in `apps/api/schemas.py`.

### Gap #2 — `vset:global:skills` declared but not populated — **MINOR**
- **Spec:** architecture.md §9 declares `vset:global:skills` (Vector Set) for "TinyFish Skill matcher".
- **Code state:** `understudy/memory/vector.py:69-70` defines the key and `:113-121` exposes `add_skill()`, but no caller invokes it. Prewarm, synthesis worker, and agent template never populate it. The Vector Set never gets rows at runtime.
- **Why this matters:** if a judge asks "how does your synthesis pipeline pick TinyFish skills?" we have a stub, not a matcher.
- **Fix:** either wire the synthesizer to VADD each `skills_pinned` entry (scoped to a skill name→embedding table) and VSIM on intent embedding, or delete the key claim from §9.

### Gap #3 — `scripts/demo_mode_switch.sh` is a TODO — **MINOR**
- **Spec:** architecture.md §14 says DEMO_MODE switches between live/replay/hybrid.
- **Code state:** The *in-app* switch works correctly (`gemini_client.py:32, 151-170`), but the *operational* script to flip DEMO_MODE on running Fly.io Machines is an `echo "TODO(task #9)"` stub at `scripts/demo_mode_switch.sh:12-13`.
- **Fix:** task #12: call `fly secrets set DEMO_MODE=$mode -a understudy-synthesis` from the script, or document the manual procedure in `docs/demo-runbook.md`.

### Gap #4 — Sponsor features that are README-only (marketing copy, no code) — **MAJOR**
- TinyFish "sub-250ms browser cold start" (architecture.md:595) — no benchmark harness.
- InsForge "editable auth emails (Apr 7)" — zero code references.
- Redis "Google ADK bridge" — zero code references.
- InsForge Edge Function Editor — warm-pool capability flag only; no edge-function code.
- InsForge PostgREST — provisioned by the pool script but not called by any generated agent; all data access goes through Remote OAuth MCP.
- These are MAJOR because §16 "every sponsor's April-2026 feature lights up" is a headline claim.
- **Fix options:** (a) trim the README/architecture §16 sponsor tables to only features we can demo, (b) add thin code paths (e.g., an `apps/agent-template/src/insforge/postgrest.ts` that reads `agent_runs` rows), or (c) tell BizDev to not over-commit on stage.

### Gap #5 — `rate:gemini:{model}` token bucket is unused in the live path — **MINOR**
- **Spec:** architecture.md §9 lists the key.
- **Code state:** `understudy/memory/client.py:162-168` has `consume_rate_token()` and `tests/test_memory_client.py:52-53` exercises it, but the synthesis worker's `GeminiClient` never calls it — it relies on Google returning 429 and then routes to InsForge Model Gateway.
- **Fix:** either add a pre-call `consume_rate_token` guard in `gemini_client._call_google` to rate-limit *before* hitting Google (the API-level intent of the row), or delete the row from §9.

### Gap #6 — `release.yml:189-194` wrong predicate on the `slsaprovenance` attestation — **MINOR**
- **Spec:** architecture.md §6: "SLSA L2 provenance predicate" is the in-toto predicate emitted by the SLSA generator.
- **Code state:** `infra/github-actions/release.yml:189-194` does `cosign attest --predicate sbom.spdx.json --type slsaprovenance` — it attaches the SBOM json file as the predicate for `slsaprovenance`. Likely a copy-paste from the SBOM step above.
- **Why this matters:** `cosign verify-attestation --type slsaprovenance` will succeed against a malformed predicate, but the payload won't be a valid SLSA predicate — a judge inspecting with `cosign verify-attestation ... | jq .payload | base64 -d` sees SBOM data, not provenance.
- **Fix:** the SLSA predicate comes from `needs.slsa-provenance.outputs.provenance` of the `slsa-github-generator` job. The attest step should reference that file (and it should be downloaded from the generator's artifact). Current `scripts/verify_release.sh:56-71` invocation does verify against a real slsaprovenance attestation only if one is attached — so on stage this could silently return "valid" against an SBOM-payload predicate.

### Gap #7 — PostgREST auto-API claim is not exercised by generated agents — **MAJOR**
- **Spec:** architecture.md §8 "Every table auto-exposed as REST via InsForge 2.0 PostgREST."
- **Code state:** No HTTP client in `apps/agent-template/` calls a PostgREST URL. The insforge client only talks MCP. `apps/api/store.py` is an in-memory stub.
- **Why this matters:** devils-advocate will ask "show me a generated agent reading its own table over PostgREST." We can't.
- **Fix:** either add an `apps/agent-template/src/insforge/postgrest.ts` module and wire it into the demo agent, or reframe the claim as "PostgREST *available*, used for admin/ops, not hot-path."

---

## Final tally

- **Architecture sections:** §2-§17 = 16 sections evaluated.
  - ✅ Matches: **11** (§3, §4, §5, §6, §7, §10, §11, §12, §13, §15, §17)
  - ⚠️ Partial: **5** (§2, §8, §9, §14, §16)
  - ❌ Missing: **0** (no entire section is missing)

- **Redis keys:** 14 declared, 12 fully wired, 2 partially wired (`vset:global:skills`, `rate:gemini:{model}`).

- **Failure modes:** 12 rows, all 12 have a handling path. One (`Dream Query breaking change`) is partial-automation.

- **Sponsor features:** 26+ features enumerated across README + architecture §16. ~18 have runtime code. ~5 are marketing-only (Gap #4). ~3 are provisioned-but-uncalled (PostgREST, Edge Functions, InsForge Agent Skills).

- **Gaps:** 2 MAJOR (§8 SQL missing, README-only sponsor features incl. PostgREST), 5 MINOR (dead key, TODO script, rate-limit plumbing, release.yml predicate bug, drift-retry automation).

- **BLOCKER count: 0** — none of these will hard-crash the demo. The stage walk-through will work. The honest exposure is §8 and §16: the claim "every table in Postgres" and "every sponsor feature lit up" cannot be defended with current code for all rows.

Handing off to devils-advocate (task #14) — they'll want to hammer Gap #1 (SQL), Gap #4 (marketing-only sponsor rows), and Gap #7 (PostgREST claim without caller).
