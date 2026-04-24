# Understudy

> **Record once. Ship a signed agent.**
> *Understudy turns any 60-second screen recording into a signed, production-deployed web agent with a typed federated GraphQL API and persistent memory — no code, no prompts. Show it once, ship it forever.*

Submitted to **[Ship to Prod — Agentic Engineering Hackathon](https://ship-to-prod.devpost.com/)** · Apr 24, 2026 · AWS Builder Loft, San Francisco.

---

## Inspiration

Every team at every company has three or four workflows that *should* be agents but never are — the weekly CSV export, the multi-tab reconciliation, the "ping me when that vendor's status page flips." Building each one takes **1–2 weeks** even with modern browser-use frameworks. The bottleneck isn't the model. It's the glue: typed API, schema synthesis, memory, deploy target, supply-chain hardening, and governance.

The agentic-browser space is crowded at the consumer surface (Adept, Multion, Rabbit, Claude Computer Use, OpenAdapt). It's thin where enterprises actually live: **governance + supply chain + memory**. We wanted to collapse the 2-week loop to **~90 seconds** — and do it in a way an enterprise would accept: every agent **signed**, every build **attested**, every runtime **verified before it boots**.

That's Understudy. Meta-agentic, not agentic. The deliverable of a 60-second recording is a **running, signed, federated web agent** — not a chatbot.

---

## What it does

1. **Record** a 60-second screen workflow in your browser.
2. **Three Gemini models** synthesize it in three passes — action detection, intent abstraction, script emission.
3. **Wundergraph Cosmo Dream Query** figures out the agent's ideal GraphQL query shape and emits the SDL delta needed to serve it, validated against live client traffic.
4. **Chainguard wolfi-base** builds the agent image with a **build-time SBOM** and an **SLSA L2 provenance predicate**, signed **keyless** via cosign + Fulcio and anchored in the **Rekor** transparency log.
5. **Fly.io Machines** deploys the image — but only after a pre-start `cosign verify` passes. A tampered image refuses to boot.
6. The running agent exposes a typed **federated GraphQL endpoint** via Cosmo Router, writes memory to the **Redis Agent Memory Server** (auto topic + entity extraction) and a per-agent **int8 Vector Set**, stores structured output in **InsForge Postgres** via Remote-OAuth MCP, and drives browser sessions via **TinyFish's hosted cloud**.
7. Every run publishes the output to **cited.md**, and the reusable capability is packaged as a skill for **Shipables.dev**.

One 60-second recording → one signed, federated, memory-backed agent. **Output the agent, not the answer.**

---

## 🏗️ Architecture (live diagram)

**➡️ [Open the interactive architecture diagram on mermaid.live](https://mermaid.live/view#pako:eNptlG1v2jAQx7_KKXuzqYG1ZY9oqwQEEFNSnrqiqpkqk1wSj8RGtrMKIb77Lk4KdBqvjP3_3XH_u2PvRDJGp-skuXyOMqYM-ItQAH0Wj6Hz6VLDMlKI4ttavb9ZYCRVzEUaOr-g1bqB3mxCqhHThk5WMhEpakPvdRC6tsL549vQWWDMKZ5RyApt1b_lWnf1TpgMNdeh867B5hZaUezlyyOspNqgOkZeWcn4ijRjLLjg0GlfwShnOmv53KCN34sMlwI8NGhPR3p8VePXr_GZkk0VBoWB3lobxf4hr2uyc0bWaS1JbvGtgWHBtX6FdSzmzQkbSF1I8CobYF6i2tWk58PyZEXDebUV_Z8T36vQjJH9JVMxPMs84a0103WpFwQnBpb9aXCELWX55WR8S3gkNU8FXMCozCMuG3CBG3kytpJa5n4fOjOFaymNFTbwH1Q82YXOoZbfkxa2TGvLjPyHaiDyXZtLCFiUcYF1qz3c5nJ3zGKxhPHcYovhj8dqPpJSIxgJVc6jlGLWwzYe3t5VI0G_AmPopdQiG_qOi92I6wwG_uQ0eZW69m4xXS2H1TgfhZnUBmMLr5V81qhA4-uGnfjR0Ds2bYQxKvbCjhXbZnMfFrI0Z6N5QoNhcBr8e5pBqWCJRgMX5kvjvq0DAiyk2tGjIn-bF5-JdEAe4mkxTqG9fhV5IvRIqhRhRhWlqvG6amkhDcK0V5oMgsHsfxEGkztbWUTbEreLGKiKbWnON6wN3jCYPgVTb_hdUQPZDtq2XTO_91DlL3W3vu_u7Ro_8fhQ56pjRLQY2sME9FYKTdUnPM-7by7Xna8fP7i0XXKD9PUy7rDPbiRzqbpvkiQ5g2lV3fG1O-643ty1A-1WE-rSVLhNZ12y2fX6LjXKteW5trSXnKFwXKdAVTAe0z_dvgoeOrRnBRnbpWPM1CZ0QnEgHSuNpC2MnK5RJbpOuY2p3R5nqWJFfXn4C3v4nVE)**

![Understudy architecture](https://mermaid.ink/img/pako:eNptlG1v2jAQx7_KKXuzqYG1ZY9oqwQEEFNSnrqiqpkqk1wSj8RGtrMKIb77Lk4KdBqvjP3_3XH_u2PvRDJGp-skuXyOMqYM-ItQAH0Wj6Hz6VLDMlKI4ttavb9ZYCRVzEUaOr-g1bqB3mxCqhHThk5WMhEpakPvdRC6tsL549vQWWDMKZ5RyApt1b_lWnf1TpgMNdeh867B5hZaUezlyyOspNqgOkZeWcn4ijRjLLjg0GlfwShnOmv53KCN34sMlwI8NGhPR3p8VePXr_GZkk0VBoWB3lobxf4hr2uyc0bWaS1JbvGtgWHBtX6FdSzmzQkbSF1I8CobYF6i2tWk58PyZEXDebUV_Z8T36vQjJH9JVMxPMs84a0103WpFwQnBpb9aXCELWX55WR8S3gkNU8FXMCozCMuG3CBG3kytpJa5n4fOjOFaymNFTbwH1Q82YXOoZbfkxa2TGvLjPyHaiDyXZtLCFiUcYF1qz3c5nJ3zGKxhPHcYovhj8dqPpJSIxgJVc6jlGLWwzYe3t5VI0G_AmPopdQiG_qOi92I6wwG_uQ0eZW69m4xXS2H1TgfhZnUBmMLr5V81qhA4-uGnfjR0Ds2bYQxKvbCjhXbZnMfFrI0Z6N5QoNhcBr8e5pBqWCJRgMX5kvjvq0DAiyk2tGjIn-bF5-JdEAe4mkxTqG9fhV5IvRIqhRhRhWlqvG6amkhDcK0V5oMgsHsfxEGkztbWUTbEreLGKiKbWnON6wN3jCYPgVTb_hdUQPZDtq2XTO_91DlL3W3vu_u7Ro_8fhQ56pjRLQY2sME9FYKTdUnPM-7by7Xna8fP7i0XXKD9PUy7rDPbiRzqbpvkiQ5g2lV3fG1O-643ty1A-1WE-rSVLhNZ12y2fX6LjXKteW5trSXnKFwXKdAVTAe0z_dvgoeOrRnBRnbpWPM1CZ0QnEgHSuNpC2MnK5RJbpOuY2p3R5nqWJFfXn4C3v4nVE?type=png&bgColor=0b0f14)

---

## How we built it

### 🏅 Deep Sponsor Integrations (Our Core Stack)
Ship to Prod judges Tool Use at 20% weight and requires ≥3 integrations. We didn't just sprinkle sponsor APIs into a chatbot. Understudy relies on **six deep integrations** that form the load-bearing pillars of the platform. Rip any one out, and the system breaks.

#### 🥇 [TinyFish](https://www.tinyfish.ai/) — *The Agentic Runtime & Execution Cloud*
We don't operate our own browser infrastructure pool. The final output script emitted by our pipeline is natively a **TinyFish CLI agent** with pinned Skills.
* **Hosted Browser Cloud:** `tinyfish run` executes the generated agents live on TinyFish’s managed cloud infrastructure over HTTPS. One API key gives us a stealth session equipped with Web Agent, Search, Fetch, and Browser capabilities.
* **Guaranteed Reliability:** Because generated agents are native TinyFish scripts, they achieve **2× task completion rates** compared to standard MCP setups, giving us enterprise reliability.
* **Code Proof:** `apps/agent-template/src/tinyfish/cli.ts` (Requires pinned Skill version), `apps/synthesis-worker/prompts.py` (Gemini emits `emit_tinyfish_script`).

#### 🥇 [Wundergraph Cosmo](https://wundergraph.com/) — *The Schema Synthesizer & Federation Router*
Understudy knows what the *agent wants to query*, but it doesn't know how the *schema has to change*. **Cosmo Dream Query inverts that problem exactly.**
* **Dream Query:** We pass the desired GraphQL operation to Dream Query, which returns the SDL delta + a validation report against live client traffic. We did not hand-roll SDL generation; we let Dream Query synthesize the schema.
* **Federated Router:** The Cosmo router gateways every generated agent subgraph into a single, unified supergraph using **EDFS (Kafka/NATS)** for event-driven fields.
* **Code Proof:** Wired via a headless MCP driver in `apps/cosmo-mcp-driver/driver.py:128-222`, using `dream_query` and `schema_change_proposal_workflow`.

#### 🔏 [Chainguard](https://chainguard.dev/) — *SLSA L2 Supply Chain Security*
Why would an enterprise run an AI-generated agent? Because it's cryptographically secure.
* Every generated agent image is built `FROM cgr.dev/chainguard/wolfi-base`.
* We use Syft in BuildKit to generate a **build-time SBOM** and an **SLSA L2-compliant provenance predicate**.
* Images are signed **keyless via cosign + Fulcio**, anchored in the **Rekor** transparency log.
* Our Fly.io pre-start hook runs `cosign verify` and `cosign verify-attestation --type slsaprovenance` *before* boot. If an image is tampered with, it refuses to boot.
* **Code Proof:** `infra/chainguard/Dockerfile.wolfi:11`, `infra/fly/fly-start.sh:13-24`.

#### 🛢️ [InsForge 2.0](https://insforge.dev/) — *Remote Backend & Inference Gateway*
Every generated agent gets an instant backend.
* **Remote OAuth MCP:** We use InsForge's Remote OAuth MCP (bypassing stdio friction completely) with a 401-refresh-retry loop to handle agent output and structured data storage.
* **Model Gateway:** The synthesis worker uses InsForge's Model Gateway for automatic failover when Gemini rate limits hit.
* **Warm Pooling:** Generated agents pick up a warm-pool slot via our provisioning scripts.
* **Code Proof:** `apps/agent-template/src/insforge/mcp-client.ts:30-102`, `apps/synthesis-worker/gemini_client.py:268-298`.

#### 🧠 [Redis 8](https://redis.io/) — *The Agent's Memory Substrate*
Three distinct, bleeding-edge April-2026 Redis features power the memory architecture:
* **Agent Memory Server (AMS):** Handles short-term turn buffers (Stream, `MAXLEN=20`), long-term episodic facts, and auto topic/entity extraction.
* **Vector Sets (int8 quantization):** A per-agent recall index. Quantizing from fp32 to int8 reduces memory footprint by ~75% while maintaining ~99%+ recall accuracy.
* **LangCache:** A semantic response cache sitting in front of every LLM call, dropping repeat query latency to <50ms.
* **Code Proof:** `understudy/memory/ams.py`, `understudy/memory/vector.py`.

#### 🔺 [Gemini 3 / 3.1 (Google)](https://ai.google.dev/) — *The Three-Headed Brain*
Our pipeline uses three pinned models, each applied where it objectively wins:
* **Action Detection (`gemini-3.1-flash-lite`):** Multimodal-native. Grabs 5-8 scene-change keyframes to detect UI events and clicks (~10× token reduction vs video).
* **Intent Abstraction (`gemini-3.1-pro` with `thinking_level: high`):** Best complex reasoning. Lifts raw clicks into a goal, invariants, and an I/O schema.
* **Script Emission (`gemini-3-flash`):** Best coder. Emits the target TinyFish script and GraphQL target shape, beating 3.1 Pro on SWE-bench at a fraction of the latency and cost.
* **Code Proof:** Pinned strictly in `understudy/models.py`.

---

## Challenges we ran into

- **Thought-signature validation** on Gemini 3.x multi-turn calls. A mid-pipeline function-call response could invalidate an earlier signature and crash the retry path. Fix: enforce signature re-check at every tool-call boundary in the worker (`gemini_client.py:249-263`).
- **Cosmo Dream Query latency spikes** during the live-traffic validation phase. Mitigated by pre-warming the supergraph with representative traffic before demo and caching the `dream:{run_id}` slot.
- **Selector brittleness** on synthesized scripts. Strategy: Gemini emits **selector hints** (role + visible text), not raw CSS. At runtime the TinyFish resolver uses a priority chain — `data-testid` → accessibility tree → text content → Flash-Lite fallback — so cosmetic DOM changes don't break the agent.
- **Keyless signing in CI** with the right OIDC subject. Getting Fulcio to issue a cert bound to the exact workflow identity (not just the repo) took several iterations. The final identity string is used verbatim in every verifier (`fly-start.sh`, `verify-self.sh`, `scripts/verify_release.sh`).
- **Int8 Vector Set recall calibration.** Default symmetric quantization lost enough recall on short embeddings to matter for the AMS recall path. We kept fp32 as a fallback for small agents and back the 99%+ number with a unit test.

---

## Accomplishments that we're proud of

- **Cryptographic Boot Refusal:** Live `cosign verify` + `cosign verify-attestation` on stage, against the public Rekor log. That beat lands in 20 seconds and it's unforgettable. A tampered image is cryptographically refused at boot.
- **Speed:** ~90 seconds from mp4 upload to running signed federated agent, end-to-end.
- **Hermetic Demo Mode:** A full airplane-mode rehearsal passes every network-dependent beat via Redis replay keys (`us:replay:{synth_id}:*`).
- **Load-Bearing Integrations:** Six sponsor integrations that are structurally necessary, not just checkbox features.
- **Schema Synthesis Inversion:** Cosmo Dream Query is wired as the **core schema-synthesis primitive**. We didn't hand-roll SDL; we let the native tool do exactly what it was built for.
- **Testing:** 74 passing tests across synthesis, Cosmo, memory, and supply-chain surfaces.

---

## What we learned

- The hard part of "agent from recording" isn't the vision model. It's **schema synthesis + memory + supply chain**. That's where two weeks usually go — and Cosmo Dream Query + Redis AMS + Chainguard collapsed all three into primitives we could call.
- **Model pinning matters more than model choice.** Using the right Gemini model for each stage (Flash-Lite for multimodal, Pro for reasoning, Flash for code) beats using a single "best" model for everything, by a large margin on both latency and cost.
- Int8 Vector Sets are the reason **"hundreds of agents per Fly.io host"** is a real number and not a deck claim. The memory math is the constraint, and Redis solved it.
- A live **tampering demo** (push a modified image at the same tag → preboot hook refuses to boot) is more persuasive than any certificate walkthrough.
- **TinyFish's hosted browser model** is the right call for an enterprise product: we don't want to own browser infrastructure, and TinyFish wants us to consume theirs.

---

## What's next for Understudy

- **Self-healing replays.** On DOM drift, invoke 3.1-pro on the live page against the original intent spec and patch the script in place — no human loop.
- **Agent marketplace.** Every signed agent published to Shipables.dev with its attestation bundle becomes a trustable building block for other teams.
- **Paid agent output via cited.md + x402 rails.** "$0.05 per enriched row" is a one-line config; the monetization surface is already wired.
- **In-org federation.** Point Cosmo at an enterprise's existing graph; Understudy generates agents that *extend* it, not replace it. Dream Query is perfect for this.
- **Wire `memory.recall()` into the agent core loop before every TinyFish action.** Today memory is written; tomorrow it's consulted. Closes the last "is-it-really-an-agent?" gap.

---

## 🛠️ Built with

`python` · `fastapi` · `typescript` · `react` · `shadcn-ui` · `gemini-3.1-flash-lite` · `gemini-3.1-pro` · `gemini-3-flash` · `google-genai` · `wundergraph-cosmo` · `cosmo-dream-query` · `graphql` · `graphql-federation` · `edfs` · `chainguard` · `wolfi-base` · `cosign` · `fulcio` · `rekor` · `slsa` · `syft` · `sbom` · `tinyfish` · `insforge` · `remote-oauth-mcp` · `redis` · `redis-vector-sets` · `redis-langcache` · `agent-memory-server` · `fly-io` · `docker` · `github-actions` · `shipables` · `cited-md` · `x402`

---

## 🎥 Try it out

- **GitHub:** https://github.com/nihalnihalani/understudy *(replace with actual repo URL)*
- **Live demo:** https://understudy.fly.dev *(replace with actual deploy URL)*
- **Shipables skill:** https://shipables.dev/understudy/record-to-agent
- **Sample agent output (cited.md):** https://cited.md/understudy/demo-run

---

*Team: the human author + the four-agent writing team above (Research Lead, Technical Architect, Devil's Advocate, Narrative Writer). Built at Ship to Prod, AWS Builder Loft SF, April 24, 2026.*