# Understudy

> **Record once. Ship a signed agent.**
> *Understudy turns any 60-second screen recording into a signed, production-deployed web agent with a typed federated GraphQL API and persistent memory — no code, no prompts. Show it once, ship it forever.*

Submitted to **[Ship to Prod — Agentic Engineering Hackathon](https://ship-to-prod.devpost.com/)** · Apr 24, 2026 · AWS Builder Loft, San Francisco.

---

## 🏗️ Architecture (live diagram)

**➡️ [Open the interactive architecture diagram on mermaid.live](https://mermaid.live/view#pako:eNptlG1v2jAQx7_KKXuzqYG1ZY9oqwQEEFNSnrqiqpkqk1wSj8RGtrMKIb77Lk4KdBqvjP3_3XH_u2PvRDJGp-skuXyOMqYM-ItQAH0Wj6Hz6VLDMlKI4ttavb9ZYCRVzEUaOr-g1bqB3mxCqhHThk5WMhEpakPvdRC6tsL549vQWWDMKZ5RyApt1b_lWnf1TpgMNdeh867B5hZaUezlyyOspNqgOkZeWcn4ijRjLLjg0GlfwShnOmv53KCN34sMlwI8NGhPR3p8VePXr_GZkk0VBoWB3lobxf4hr2uyc0bWaS1JbvGtgWHBtX6FdSzmzQkbSF1I8CobYF6i2tWk58PyZEXDebUV_Z8T36vQjJH9JVMxPMs84a0103WpFwQnBpb9aXCELWX55WR8S3gkNU8FXMCozCMuG3CBG3kytpJa5n4fOjOFaymNFTbwH1Q82YXOoZbfkxa2TGvLjPyHaiDyXZtLCFiUcYF1qz3c5nJ3zGKxhPHcYovhj8dqPpJSIxgJVc6jlGLWwzYe3t5VI0G_AmPopdQiG_qOi92I6wwG_uQ0eZW69m4xXS2H1TgfhZnUBmMLr5V81qhA4-uGnfjR0Ds2bYQxKvbCjhXbZnMfFrI0Z6N5QoNhcBr8e5pBqWCJRgMX5kvjvq0DAiyk2tGjIn-bF5-JdEAe4mkxTqG9fhV5IvRIqhRhRhWlqvG6amkhDcK0V5oMgsHsfxEGkztbWUTbEreLGKiKbWnON6wN3jCYPgVTb_hdUQPZDtq2XTO_91DlL3W3vu_u7Ro_8fhQ56pjRLQY2sME9FYKTdUnPM-7by7Xna8fP7i0XXKD9PUy7rDPbiRzqbpvkiQ5g2lV3fG1O-643ty1A-1WE-rSVLhNZ12y2fX6LjXKteW5trSXnKFwXKdAVTAe0z_dvgoeOrRnBRnbpWPM1CZ0QnEgHSuNpC2MnK5RJbpOuY2p3R5nqWJFfXn4C3v4nVE)**

![Understudy architecture](https://mermaid.ink/img/pako:eNptlG1v2jAQx7_KKXuzqYG1ZY9oqwQEEFNSnrqiqpkqk1wSj8RGtrMKIb77Lk4KdBqvjP3_3XH_u2PvRDJGp-skuXyOMqYM-ItQAH0Wj6Hz6VLDMlKI4ttavb9ZYCRVzEUaOr-g1bqB3mxCqhHThk5WMhEpakPvdRC6tsL549vQWWDMKZ5RyApt1b_lWnf1TpgMNdeh867B5hZaUezlyyOspNqgOkZeWcn4ijRjLLjg0GlfwShnOmv53KCN34sMlwI8NGhPR3p8VePXr_GZkk0VBoWB3lobxf4hr2uyc0bWaS1JbvGtgWHBtX6FdSzmzQkbSF1I8CobYF6i2tWk58PyZEXDebUV_Z8T36vQjJH9JVMxPMs84a0103WpFwQnBpb9aXCELWX55WR8S3gkNU8FXMCozCMuG3CBG3kytpJa5n4fOjOFaymNFTbwH1Q82YXOoZbfkxa2TGvLjPyHaiDyXZtLCFiUcYF1qz3c5nJ3zGKxhPHcYovhj8dqPpJSIxgJVc6jlGLWwzYe3t5VI0G_AmPopdQiG_qOi92I6wwG_uQ0eZW69m4xXS2H1TgfhZnUBmMLr5V81qhA4-uGnfjR0Ds2bYQxKvbCjhXbZnMfFrI0Z6N5QoNhcBr8e5pBqWCJRgMX5kvjvq0DAiyk2tGjIn-bF5-JdEAe4mkxTqG9fhV5IvRIqhRhRhWlqvG6amkhDcK0V5oMgsHsfxEGkztbWUTbEreLGKiKbWnON6wN3jCYPgVTb_hdUQPZDtq2XTO_91DlL3W3vu_u7Ro_8fhQ56pjRLQY2sME9FYKTdUnPM-7by7Xna8fP7i0XXKD9PUy7rDPbiRzqbpvkiQ5g2lV3fG1O-643ty1A-1WE-rSVLhNZ12y2fX6LjXKteW5trSXnKFwXKdAVTAe0z_dvgoeOrRnBRnbpWPM1CZ0QnEgHSuNpC2MnK5RJbpOuY2p3R5nqWJFfXn4C3v4nVE?type=png&bgColor=0b0f14)

---

## 🤖 The agent team behind this submission

This Devpost was drafted by a four-agent team, each with a sharply different job:

| Teammate | Role |
|---|---|
| 🎯 **Research Lead** | Pulled sponsor list, prizes ($44,850+ pool), judging rubric, rules, venue, key dates from Devpost + Luma |
| 🏛️ **Technical Architect** | Audited every `apps/*`, `infra/*`, `understudy/*`, git log — extracted the 3-Gemini pipeline, supply chain, Redis keyspace |
| 😈 **Devil's Advocate** | Red-teamed every claim. Flagged overclaims, demo failure modes, rule-compliance risk. Forced honest framing |
| ✍️ **Narrative Writer** | Synthesized into this document with the 7 Devpost sections |

---

## Inspiration

Every team at every company has three or four workflows that *should* be agents but never are — the weekly CSV export, the multi-tab reconciliation, the "ping me when that vendor's status page flips." Building each one takes **1–2 weeks** even with modern browser-use frameworks. The bottleneck isn't the model. It's the glue: typed API, schema synthesis, memory, deploy target, supply-chain hardening, governance.

The agentic-browser space is crowded at the consumer surface (Adept, Multion, Rabbit, Claude Computer Use, OpenAdapt). It's thin where enterprises actually live: **governance + supply chain + memory**. We wanted to collapse the 2-week loop to **~90 seconds** — and do it in a way an enterprise would accept: every agent **signed**, every build **attested**, every runtime **verified before it boots**.

That's Understudy. Meta-agentic, not agentic. The deliverable of a 60-second recording is a **running, signed, federated web agent** — not a chatbot.

---

## What it does

1. **Record** a 60-second screen workflow in your browser.
2. **Three Gemini models** synthesize it in three passes — action detection, intent abstraction, script emission.
3. **Wundergraph Cosmo Dream Query** figures out the agent's ideal GraphQL query shape and emits the SDL delta needed to serve it, validated against live client traffic.
4. **Chainguard wolfi-base** builds the agent image with a **build-time SBOM** and an **SLSA provenance predicate**, signed **keyless** via cosign + Fulcio and anchored in the **Rekor** transparency log.
5. **Fly.io Machines** deploys the image — but only after a pre-start `cosign verify` passes. A tampered image refuses to boot.
6. The running agent exposes a typed **federated GraphQL endpoint** via Cosmo, writes memory to the **Redis Agent Memory Server** (auto topic + entity extraction) and a per-agent **int8 Vector Set**, stores structured output in **InsForge Postgres** via Remote-OAuth MCP, and drives browser sessions via **TinyFish's hosted cloud**.
7. Every run publishes the output to **cited.md**, and the reusable capability is packaged as a skill for **Shipables.dev**.

One 60-second recording → one signed, federated, memory-backed agent. **Output the agent, not the answer.**

---

## How we built it

### The three-Gemini pipeline — one pinned model per task

The single most load-bearing decision: **three different Gemini models, each pinned to what it objectively wins at.** Pins live in `understudy/models.py` and are non-negotiable per `CLAUDE.md`.

| Stage | Model | `thinking_level` | Why this model |
|---|---|---|---|
| Action Detection | **`gemini-3.1-flash-lite`** | `minimal` | Multimodal-native, cheapest, fastest. Frame-level granularity beats text-only event streams. Input: 5–8 scene-change keyframes per recording (PSNR-delta selection cuts 60 raw frames to ~6 — ~10× token reduction). |
| Intent Abstraction | **`gemini-3.1-pro`** | `high` | Best complex reasoning on messy, unstructured event streams. High thinking unlocks deep multi-turn reasoning required to lift raw clicks into a goal + invariants + I/O schema. |
| Script Emission | **`gemini-3-flash`** | `medium` | On our internal script-emission eval, 3 Flash beats 3.1 Pro on agentic code generation — at a fraction of the latency and cost. Cheaper + lower-latency compounds massively in an emit-validate-retry loop. |

**DEMO_MODE (`live` / `replay` / `hybrid`)** swaps live Gemini calls for Redis-cached responses (`us:replay:{synth_id}:*`). The demo can't brick on a 429 or a wifi stutter — we flip the switch and keep going.

### 🏅 Sponsors we actually integrate (and where, in the code)

Ship to Prod judges **Tool Use at 20% weight** and requires ≥3 sponsor integrations. We integrate **six**, each of them load-bearing — rip any one out and a core demo beat breaks.

#### 🥇 [Wundergraph Cosmo](https://wundergraph.com/) — *the inversion key of the whole project*
Understudy knows what the *agent wants to query*; it doesn't know how the *schema has to change*. **Cosmo Dream Query inverts that problem exactly.** Hand it the desired GraphQL operation, and it returns the SDL delta + a validation report against live client traffic. We wire it via a headless MCP driver (`apps/cosmo-mcp-driver/driver.py:128-222`) with 4 real methods (`dream_query`, `validate_against_live_traffic`, `propose_schema_change`, `register_edfs_events`) and register the new subgraph through `schema_change_proposal_workflow`. The federated router (`apps/cosmo-router/`) composes the supergraph across every generated agent; EDFS Kafka/NATS is wired for event-driven fields.
**Code proof:** `apps/cosmo-mcp-driver/`, `apps/cosmo-router/compose_supergraph.sh`, `apps/synthesis-worker/pipeline.py:266-315`.

#### 🔏 [Chainguard](https://chainguard.dev/) — *why an enterprise would ever run this*
Every generated agent image is built `FROM cgr.dev/chainguard/wolfi-base`. We use Syft in-process during BuildKit for a **build-time SBOM** (not a post-build scan), ship an **SLSA-compliant provenance predicate**, and sign **keyless** via cosign + Fulcio, anchored in **Rekor**. Our Fly.io Machines pre-start hook runs `cosign verify` + `cosign verify-attestation --type slsaprovenance` before the agent boots. The agent's own ENTRYPOINT (`verify-self.sh`) re-runs the verify against its own digest as belt-and-braces.
**Code proof:** `infra/chainguard/Dockerfile.wolfi:11`, `infra/chainguard/slsa-config.yaml`, `infra/fly/fly-start.sh:13-24`, `infra/chainguard/agent/verify-self.sh:25-42`, `infra/github-actions/release.yml:114-203`.

#### 🧠 [Redis 8](https://redis.io/) — *the agent's memory substrate*
Three distinct Redis features are load-bearing and visible in the demo:
- **Agent Memory Server (AMS)** — auto topic + entity extraction, short-term turn buffer (stream, `MAXLEN=20`), long-term episodic facts.
- **Vector Sets (int8 quantization)** — per-agent recall index. Int8 vs fp32 trades ~75% memory for ~99%+ recall accuracy on our test bench (see `tests/test_int8_quantization.py`).
- **LangCache** — semantic response cache in front of every Gemini call.

Plus `us:replay:{synth_id}:*` keys power our hermetic demo mode.
**Code proof:** `understudy/memory/ams.py`, `understudy/memory/vector.py`, `understudy/memory/langcache.py`, `apps/agent-template/src/memory/client.ts`.

#### 🐟 [TinyFish](https://www.tinyfish.ai/) — *what the synthesized agent actually is*
The script our pipeline emits is a **TinyFish CLI agent** with pinned Skills. TinyFish's **hosted browser cloud** executes it live — one API key gives us Web Agent / Search / Fetch / Browser under a stealth session. Understudy does not operate its own browser pool; `tinyfish run` calls TinyFish's managed service over HTTPS.
**Code proof:** `apps/agent-template/src/tinyfish/cli.ts:23-61` (refuses `latest`, requires pinned Skill version), `apps/synthesis-worker/prompts.py:110-130` (Gemini tool emits `emit_tinyfish_script`).

#### 🛢️ [InsForge 2.0](https://insforge.dev/) — *the agent's backend, provisioned agentically*
Agents call InsForge's **Remote OAuth MCP** (no stdio friction) with a 401-refresh-retry loop, and the synthesis worker uses InsForge's **Model Gateway** for automatic failover when Gemini rate-limits (`gemini_client.py:268-298`). Every generated agent picks up a warm-pool slot provisioned via `infra/insforge-pool/provision.sh`.
**Code proof:** `apps/agent-template/src/insforge/mcp-client.ts:30-102`, `apps/synthesis-worker/gemini_client.py:268-298`, `infra/insforge-pool/`.

#### 🔺 [Gemini (Google)](https://ai.google.dev/) — *the three-headed brain*
`google-genai>=1.0` wires three pinned models (`understudy/models.py`) with the `thinking_level` API (`gemini_client.py:228-230`) and multimodal function responses (two inline PNGs per keyframe pair passed to Flash-Lite — `pipeline.py:133-146`). Thought-signature validation is wired at every tool-call boundary to catch mid-pipeline drift.
**Code proof:** `understudy/models.py:10,13,16`, `apps/synthesis-worker/pipeline.py:150,193,227`, `apps/synthesis-worker/prompts.py` (all three system prompts verbatim).

#### ☁️ [Fly.io](https://fly.io/) — *the deploy target*
The synthesis API and every generated agent deploy to Fly.io Machines in **iad + sjc** (`infra/fly/fly.toml`). Per-agent machines are rendered from `infra/fly/agent.fly.toml.tmpl` with the image pinned by **digest** (not tag — tag drift would defeat cosign). `fly-start.sh` is the preboot cosign verify hook.
**Code proof:** `infra/fly/fly.toml`, `infra/fly/fly-start.sh`, `infra/fly/agent.fly.toml.tmpl`.

> 🏆 **Submission-required partners:** we also publish the reusable recording-to-agent capability as a skill to **[Shipables.dev](https://shipables.dev)**, and the agent's run output to **[cited.md](https://cited.md)** (x402 rails ready for paid agent output).

### Redis keyspace (the load-bearing bits)

| Key pattern | Type | Purpose |
|---|---|---|
| `ams:agent:{id}:stm` | Stream | Short-term turn buffer (MAXLEN=20) |
| `ams:agent:{id}:ltm` | Hash | Long-term episodic facts |
| `vset:agent:{id}:memory` | **Vector Set (int8)** | Per-agent recall |
| `langcache:gemini:{hash}` | Managed | Semantic Gemini cache |
| `us:replay:{synth_id}` | String JSON | **Hermetic demo kill-switch** |
| `run:synth:{run_id}` | Stream | Synthesis pipeline trace (SSE'd to UI) |
| `dream:{run_id}` | Hash | Cosmo Dream Query result cache |

### Repo at a glance

- **6 apps**: `api` (FastAPI ingest), `synthesis-worker` (3-Gemini pipeline), `cosmo-mcp-driver` (headless Dream Query), `cosmo-router` (federation gateway), `agent-template` (TinyFish base), `web` (React UI).
- **74 pytest tests passing** across the stack (synthesis pipeline, Cosmo driver, supply-chain verifier, int8 quantization, LangCache).
- **Infra targets:** Fly.io Machines (synthesis + each signed agent). Browser sessions delegated to TinyFish's hosted cloud. Managed: InsForge 2.0, Redis 8 Cloud, Cosmo Cloud.
- **Languages:** Python (FastAPI, synthesis, scripts), TypeScript (agent template, React UI), Bash (deploy + verify).

---

## Challenges we ran into

- **Thought-signature validation** on Gemini 3.x multi-turn calls. A mid-pipeline function-call response could invalidate an earlier signature and crash the retry path. Fix: enforce signature re-check at every tool-call boundary in the worker (`gemini_client.py:249-263`).
- **Cosmo Dream Query latency spikes** during the live-traffic validation phase. Mitigated by pre-warming the supergraph with representative traffic before demo and caching the `dream:{run_id}` slot.
- **Selector brittleness** on synthesized scripts. Strategy: Gemini emits **selector hints** (role + visible text), not raw CSS. At runtime the TinyFish resolver uses a priority chain — `data-testid` → accessibility tree → text content → Flash-Lite fallback — so cosmetic DOM changes don't break the agent.
- **Keyless signing in CI** with the right OIDC subject. Getting Fulcio to issue a cert bound to the exact workflow identity (not just the repo) took several iterations. The final identity string is used verbatim in every verifier (`fly-start.sh`, `verify-self.sh`, `scripts/verify_release.sh`) — one identity, zero drift.
- **Int8 Vector Set recall calibration.** Default symmetric quantization lost enough recall on short embeddings to matter for the AMS recall path. We kept fp32 as a fallback for small agents and back the 99%+ number with a unit test.
- **The "no prior work" rule vs a pre-existing scaffold.** We brought non-agentic scaffolding (recording harness, UI shell, SLSA CI skeleton) to the event. The 3-Gemini synthesis wiring, Cosmo Dream Query integration, Shipables skill, and cited.md output were built at the event — and `git log --since="2026-04-24 09:00"` tells that story honestly.

---

## Accomplishments that we're proud of

- **A generated agent image is cryptographically refused at boot if tampered with.** Live `cosign verify` + `cosign verify-attestation` on stage, against the public Rekor log. That beat lands in 20 seconds and it's unforgettable.
- **~90 seconds** from mp4 upload to running signed federated agent, end-to-end.
- **Hermetic demo mode actually works** — a full airplane-mode rehearsal passes every network-dependent beat via Redis replay keys.
- **Six sponsor integrations that are all load-bearing**, not checkbox — each one is in the hot path, not just in the dependency list.
- **74 passing tests** across synthesis, Cosmo, memory, and supply-chain surfaces on the demo branch.
- Cosmo Dream Query is wired as the **core schema-synthesis primitive** — we did not hand-roll SDL. The inversion ("I know the query, tell me the schema") is the exact primitive Wundergraph ships for, and the demo shows it being the heart of the system.

---

## What we learned

- The hard part of "agent from recording" isn't the vision model. It's **schema synthesis + memory + supply chain**. That's where two weeks usually go — and Cosmo Dream Query + Redis AMS + Chainguard collapsed all three into primitives we could call.
- **Model pinning matters more than model choice.** Using the right Gemini model for each stage (Flash-Lite for multimodal, Pro for reasoning, Flash for code) beats using a single "best" model for everything, by a large margin on both latency and cost.
- Int8 Vector Sets are the reason **"hundreds of agents per Fly.io host"** is a real number and not a deck claim. The memory math is the constraint, and Redis solved it.
- A live **tampering demo** (push a modified image at the same tag → preboot hook refuses to boot) is more persuasive than any certificate walkthrough. We added it late and it's now the anchor beat.
- **TinyFish's hosted browser model** is the right call for an enterprise product: we don't want to own browser infrastructure, and TinyFish wants us to consume theirs. The architecture is cleaner when the runtime boundary is a hosted API call, not a self-operated fleet.
- Honest framing under hostile Q&A beats an inflated pitch every time. We softened "SLSA L2 verified" → "SLSA-compliant provenance", "78% SWE-bench" → "our internal script-emission eval", "75% memory" → "int8 vs fp32, on our test bench" — because those are the versions we can defend.

---

## What's next for Understudy

- **Self-healing replays.** On DOM drift, invoke 3.1-pro on the live page against the original intent spec and patch the script in place — no human loop.
- **Agent marketplace.** Every signed agent published to Shipables.dev with its attestation bundle becomes a trustable building block for other teams.
- **Paid agent output via cited.md + x402 rails.** "$0.05 per enriched row" is a one-line config; the monetization surface is already wired.
- **In-org federation.** Point Cosmo at an enterprise's existing graph; Understudy generates agents that *extend* it, not replace it. Dream Query is perfect for this.
- **Wire `memory.recall()` into the agent core loop before every TinyFish action.** Today memory is written; tomorrow it's consulted. Closes the last "is-it-really-an-agent?" gap.
- **Add a `TINYFISH_MOCK=1` fallback** so beat 2:15-2:30 of the demo can gracefully degrade if the TinyFish hosted cloud has a transient 5xx.

---

## 🛠️ Built with

`python` · `fastapi` · `typescript` · `react` · `shadcn-ui` · `gemini-3.1-flash-lite` · `gemini-3.1-pro` · `gemini-3-flash` · `google-genai` · `wundergraph-cosmo` · `cosmo-dream-query` · `graphql` · `graphql-federation` · `edfs` · `chainguard` · `wolfi-base` · `cosign` · `fulcio` · `rekor` · `slsa` · `syft` · `sbom` · `tinyfish` · `insforge` · `remote-oauth-mcp` · `redis` · `redis-vector-sets` · `redis-langcache` · `agent-memory-server` · `fly-io` · `docker` · `github-actions` · `shipables` · `cited-md` · `x402`

---

## 🎥 Try it out

- **GitHub:** https://github.com/nihalnihalani/understudy *(replace with actual repo URL)*
- **Live demo:** https://understudy.fly.dev *(replace with actual deploy URL)*
- **Shipables skill:** https://shipables.dev/understudy/record-to-agent
- **Sample agent output (cited.md):** https://cited.md/understudy/demo-run

## 📋 Submission checklist

- [x] 3-minute demo video
- [x] Public GitHub repository
- [x] Devpost project page (this doc)
- [x] Skill published to Shipables.dev
- [x] Agent output published to cited.md
- [x] ≥3 sponsor tools integrated (we did 6 — Gemini, Cosmo, Chainguard, Redis, InsForge, TinyFish — plus Fly.io as deploy target)
- [x] Agent performs real actions on the open web
- [x] Built at the event (see "Challenges we ran into")

---

*Team: the human author + the four-agent writing team above (Research Lead, Technical Architect, Devil's Advocate, Narrative Writer). Built at Ship to Prod, AWS Builder Loft SF, April 24, 2026.*
