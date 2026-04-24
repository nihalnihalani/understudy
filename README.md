# Understudy

> *Show it once. Understudy takes over.*

A meta-agentic platform: record a 60-second screen capture of a web workflow, and Understudy synthesizes a production-ready signed deployed web agent — with a typed GraphQL API, persistent memory, and SLSA L2 supply-chain receipts. Built for the **Ship to Prod — Agentic Engineering Hackathon** (April 2026).

---

## Built with April 2026's Latest

Understudy is built on technology that did not exist in March 2026:

| Sponsor | Shipped in April 2026 | Where it lives in Understudy |
|---|---|---|
| **Gemini** | 3 Flash (Apr 22), 3.1 Pro, 3.1 Flash-Lite, `thinking_level` API, multimodal fn responses | Three-stage synthesis brain |
| **TinyFish** | CLI + Agent Skill System (2× vs MCP), 4-product platform | Generated agent runtime on Mac Mini pool |
| **Wundergraph** | **Cosmo Dream Query**, EDFS Kafka/NATS, MCP Gateway, `schema_change_proposal_workflow`, live-traffic schema validation | Schema synthesizer — literally the core loop |
| **Chainguard** | SLSA Build Level 2 provenance, build-time SBOM, Sigstore cosign + Fulcio + Rekor | Every generated agent image |
| **InsForge 2.0** | Remote OAuth MCP, Model Gateway, Agent Skills, Edge Function Editor (Apr 1), editable auth emails (Apr 7), VS Code extension | Generated agent backends + inference fallback |
| **Redis 8** | Vector Sets int8 (75% less memory), LangCache, Agent Memory Server (short + long term with auto extraction), RedisVL, Google ADK bridge | Per-agent memory + semantic cache |

---

## Problem

Building a production web agent takes a team of engineers 1-2 weeks — even with Browser-Use, Stagehand, OpenAI Operator, or Gemini Computer-Use. Teams know the workflow they want automated but can't hand it to an agent without writing code, provisioning infra, hardening containers, and wiring memory. Meanwhile the "agentic browser" space is crowded at the consumer layer and thin at the enterprise layer, where **governance + supply chain + memory** matter more than novelty.

## Solution

Understudy watches you do a web workflow once, in 60 seconds, and ships you a signed, typed, deployed agent with persistent memory. **Three Gemini models** do the heavy lifting, each where it's objectively best: Gemini 3.1 Flash-Lite for frame-level action detection (multimodal), Gemini 3.1 Pro for intent abstraction, and **Gemini 3 Flash for script emission (78% SWE-bench — the best coder in the family)**. **Cosmo Dream Query** generates the subgraph SDL from the agent's desired query. **Chainguard** signs everything with SLSA L2 provenance. **InsForge 2.0** auto-provisions the backend over OAuth MCP. **Redis 8 Agent Memory Server** remembers. An agent that builds agents.

**One-line demo:** *"Record yourself doing it once. Understudy takes over the role."* → 60s recording → ~90s synthesis → autonomous signed agent deployed + federated GraphQL endpoint.

---

## Why It Wins

1. **Meta-agentic, not agentic.** Understudy generates agents. The deliverable of a 60s recording is a running, signed, federated web agent — not a chatbot.
2. **Cosmo Dream Query is the perfect fit.** Our synthesizer already knows what the agent wants to query; it does not know how the schema must change. Dream Query answers exactly that question. No other team will use this primitive as natively.
3. **Three-model Gemini pipeline.** We use each model for what it is objectively best at — 3 Flash's 78% SWE-bench score lands on the one task where accuracy compounds: code emission.
4. **Supply chain the judges can verify on stage.** Live `cosign verify` + `cosign verify-attestation --type slsaprovenance` on a freshly synthesized agent, anchored in Rekor.
5. **Generated agents ship with real memory.** Not chat history — Agent Memory Server namespaces with auto topic/entity extraction and int8 Vector Set recall, per agent.
6. **Hundreds of agents on one Mac Mini.** Int8 Vector Sets + Chainguard slim images + InsForge Remote MCP pooling = dense deployment on the TinyFish Mac Mini.
7. **Every sponsor's April-2026 feature lights up.** See the prize-stacking table below.

| Sponsor prize | How Understudy earns it |
|---|---|
| **TinyFish 1st** — 4× Mac Mini + $300 credits + **$2M Accelerator Golden Ticket** | Generated agents are TinyFish CLI + Skill-pinned scripts; Mac Mini pool runs browsers; 2× task completion vs MCP |
| **Wundergraph 1st** — $2,000 cash | **Cosmo Dream Query** used exactly as intended — every new agent's subgraph SDL comes from Dream Query; EDFS optional for event fields |
| **Chainguard** — $1,000 cash | Every agent image has SLSA L2 provenance predicate + build-time SBOM + keyless cosign via Fulcio + Rekor transparency log |
| **InsForge 1st** — $1,000 cash | **Remote OAuth MCP** (no stdio), Agent Skills, Model Gateway fallback, PostgREST auto-API, Edge Function Editor |
| **Redis — Best Agent** — AirPods Pro + 10k credits + hoodies | **Vector Sets int8** (75% memory) + **LangCache** + **Agent Memory Server** (auto topic/entity) — three brand-new agentic features |
| **Guild — Most Innovative** — $1,000 Visa | Meta-agentic = innovation bullseye. Agents that build agents with signed receipts |

**Expected stack: ~$5,000 cash + 4× Mac Mini + AirPods Pro + hoodies + $2M Accelerator Golden Ticket.**

---

## Tech Stack

| Layer | Technology | April 2026 feature |
|---|---|---|
| **Action detection (vision)** | Gemini 3.1 Flash-Lite | Multimodal function responses, frame-level events |
| **Intent abstraction** | Gemini 3.1 Pro | `thinking_level: high` for deep reasoning |
| **Script emission** | **Gemini 3 Flash** | 78% SWE-bench Verified, $0.50/$3 per 1M, multimodal |
| **Schema synthesis** | Wundergraph Cosmo MCP | **Dream Query**, EDFS, `schema_change_proposal_workflow`, live-traffic validation |
| **Target runtime** | TinyFish | **CLI + Agent Skill System** (2× vs MCP), all 4 products under one API key |
| **Backend (per agent)** | InsForge 2.0 | **Remote OAuth MCP**, Model Gateway, PostgREST, Edge Functions, Agent Skills |
| **Memory** | Redis 8 | **Vector Sets int8** + **LangCache** + **Agent Memory Server** (auto extraction) |
| **Supply chain** | Chainguard | `wolfi-base`, **SLSA L2 provenance**, build-time SBOM, Sigstore cosign + Fulcio + Rekor |
| **Runtime** | Fly.io Machines + Mac Mini | cosign-verify pre-start hook; Mac Mini for browser pool |
| **CI** | GitHub Actions | Keyless Fulcio OIDC signing; SLSA L2 attestation |

See [architecture.md](./architecture.md) for full diagrams (component, synthesis pipeline, Dream Query interaction, generated agent runtime, supply chain, ER data model, deployment), Redis keyspace design, Gemini 3 prompt chains + tool schemas, the "Why Gemini 3 Flash writes the scripts" rationale, and failure-mode analysis.

---

## Demo Theater (3 min)

1. **0:00-0:20** Hook + record live: open demo SaaS, filter orders, export CSV (60s)
2. **0:20-0:40** Gemini 3.1 Flash-Lite detects UI events per keyframe (multimodal fn response)
3. **0:40-1:00** Gemini 3.1 Pro abstracts intent (`thinking_level: high`)
4. **1:00-1:20** Gemini 3 Flash emits the script (SWE-bench 78%)
5. **1:20-1:40** Cosmo **Dream Query** generates the subgraph SDL live + live-traffic validator passes
6. **1:40-2:00** Chainguard builds + SLSA L2 attests + cosign signs via Fulcio → `cosign verify` runs live
7. **2:00-2:15** Deploy: federated endpoint blinks live
8. **2:15-2:30** Hit endpoint: agent runs via TinyFish CLI; Mac Mini browser visible; InsForge + Redis AMS fill live
9. **2:30-2:40** Repeat query → Redis **LangCache** hit <50ms
10. **2:40-2:55** Related query → Agent Memory Server Vector Set recall
11. **2:55-3:00** Wall of 10 synthesized agents — *"The agent that builds agents."*

---

## Quickstart (for teammates)

```bash
# 1. Clone + install
git clone https://github.com/nihalnihalani/understudy
cd understudy
cp .env.example .env   # fill Gemini, TinyFish, InsForge, Redis, Chainguard registry, GH token

# 2. Install TinyFish CLI + Agent Skills
npm install -g @tinyfish/cli
tinyfish skills install web-workflow-pack

# 3. Local dev (requires Docker + Chainguard wolfi-base)
docker compose up    # synthesis API + cosmo-router + redis 8 + warm InsForge pool

# 4. Pre-warm the demo (run the night before)
python scripts/prewarm_demo.py   # seeds LangCache, AMS, Vector Sets, Dream Query cache

# 5. Verify the signed production image with SLSA L2 provenance
cosign verify \
  --certificate-identity "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/nihalnihalani/understudy-agent-base:latest

cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity "..." --certificate-oidc-issuer "..." \
  ghcr.io/nihalnihalani/understudy-agent-base:latest

# 6. Run a synthesis
curl -X POST http://localhost:8080/synthesize \
  -F recording=@demo-workflow.mp4
```

---

## Repo Structure

```
understudy/
├── README.md                         # this file
├── architecture.md                   # full system architecture + diagrams (v2)
├── apps/
│   ├── api/                          # FastAPI ingest + synthesis orchestration
│   ├── synthesis-worker/             # 3-Gemini pipeline (keyframe → action → intent → script)
│   ├── cosmo-mcp-driver/             # headless wrapper around Cosmo MCP CLI (Dream Query + proposal)
│   ├── agent-template/               # base TinyFish CLI scaffold generated agents extend
│   └── cosmo-router/                 # federation gateway for all generated agents
├── infra/
│   ├── fly/                          # Fly.io Machine manifests with cosign pre-start hook
│   ├── chainguard/                   # Dockerfile.wolfi + per-agent build template + SLSA L2 config
│   ├── insforge-pool/                # warm-pool provisioning scripts
│   └── github-actions/               # CI: build base image, SLSA L2 attest, Fulcio sign, Rekor log, push
├── scripts/
│   ├── prewarm_demo.py
│   ├── demo_mode_switch.sh
│   └── record_sample.sh
└── docs/
    ├── demo-runbook.md
    └── gemini-prompts/
        ├── action_detection_flash_lite.md
        ├── intent_abstraction_pro.md
        └── script_emission_flash.md
```

---

## Team

Per Gary Chan's *How to Win a Hackathon* framework: no BizDev presenter = no win.

- **Systems hacker** — Chainguard wolfi-base + SLSA L2 + cosign Fulcio + Fly + Mac Mini + OCI registry
- **Full-stack** — Synthesis pipeline + 3-Gemini chain + Cosmo Dream Query driver + InsForge 2.0 Remote MCP + Redis 8 (AMS + Vector Sets + LangCache)
- **Frontend/design** — Upload UI + synthesis HUD + agent dashboard + Cosmo Studio embed + SLSA attestation viewer
- **BizDev/presenter** — Validation interviews (hours 1-4), demo recording, live pitch, Q&A on model choice + supply chain

---

## Credits

Built for **Ship to Prod — Agentic Engineering Hackathon**, April 2026.

Strategy reference: [Gary-Yau Chan, *How to Win a Hackathon*](https://growthwithgary.com/).

---

## License

MIT
