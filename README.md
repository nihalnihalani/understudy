# Understudy

> *Show it once. Understudy takes over.*

A meta-agentic platform: record a 60-second screen capture of a web workflow, and Understudy synthesizes a production-ready, signed, deployed agent — with a typed GraphQL API and persistent memory. Built for the **Ship to Prod — Agentic Engineering Hackathon** (2026).

---

## Problem

Building a production web agent takes a team of engineers 1-2 weeks — even with Browser-Use, Stagehand, or Operator. Teams know the workflow they want automated but can't hand it to an agent without writing code, provisioning infra, hardening containers, and wiring memory. Meanwhile the "agentic browser" space is crowded at the consumer layer and thin at the enterprise layer, where governance + supply chain + memory matter more than novelty.

## Solution

Understudy watches you do a web workflow once, in 60 seconds, and ships you a signed, typed, deployed agent. Gemini is the synthesis brain. TinyFish is the runtime target. Cosmo MCP composes a typed GraphQL surface for every generated agent. Chainguard signs everything. InsForge provisions the backend. Redis remembers. An agent that builds agents.

**One-line demo:** *"Record yourself doing it once. Understudy takes over the role."* → 60s recording → 90s synthesis → autonomous agent deployed.

---

## Why It Wins

| Sponsor prize | How Understudy earns it |
|---|---|
| **TinyFish 1st** — Mac Minis + $300 credits + $2M Accelerator Golden Ticket | Generated agents use all 4 TinyFish products; TinyFish is the runtime target of a meta-platform |
| **Wundergraph 1st** — $2,000 cash | **Cosmo MCP `schema_change_proposal_workflow` used as intended** — every new agent publishes a subgraph into the federation. No other team will use Cosmo MCP this cleanly. |
| **Chainguard** — $1,000 cash | Every generated agent gets wolfi-base, cosign keyless signature, SBOM attestation. "Supply chain for agents" is a net-new narrative |
| **InsForge 1st** — $1,000 cash | Per-agent backend auto-provisioned; InsForge consumed *by another agent*, not a human |
| **Guild — Most Innovative** — $1,000 Visa | Meta-agentic = innovation bullseye. Agents that build agents. |
| **Redis — Best Agent** — AirPods Pro + hoodies | RedisVL semantic memory + Streams episodic log + per-agent namespacing + hermetic replay cache |

**Expected stack: ~$5,000 cash + 4× Mac Mini + AirPods Pro + hoodies + $2M Accelerator Golden Ticket.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| **LLM** | Google Gemini — `gemini-2.5-pro` (intent + script emission) + `gemini-2.5-flash` (per-keyframe vision) via `google-genai` SDK |
| **Target runtime** | TinyFish (Agent + Search + Fetch + Browser) |
| **API federation** | Wundergraph Cosmo + Cosmo MCP (`schema_change_proposal_workflow`) |
| **Backend (per agent)** | InsForge (auth, Postgres, pgvector, edge functions) — pool-warmed |
| **Memory** | Redis + RedisVL (semantic) + Streams (episodic) |
| **Supply chain** | Chainguard `wolfi-base` + cosign keyless (Fulcio OIDC in CI) + Syft SBOM |
| **Runtime** | Fly.io Machines with cosign-verify pre-start hook |
| **CI** | GitHub Actions (image signing happens here; stage shows verify) |

See [architecture.md](./architecture.md) for detailed diagrams, synthesis-pipeline breakdown, prompt design, supply-chain flow, and failure-mode analysis.

---

## Demo Theater (3 min)

1. **0:00-0:20** Hook + record live: open demo SaaS, filter orders, export CSV (60s)
2. **0:20-0:40** Drop mp4 → scene-change keyframes → Gemini Flash annotates
3. **0:40-1:20** Gemini 2.5 Pro intent JSON streams left; Cosmo MCP composed SDL streams right; Cosmo Studio shows new subgraph
4. **1:20-1:50** Terminal: `cosign verify` against pre-signed image — 0 CVEs, SBOM attested
5. **1:50-2:30** Deploy to Fly + TinyFish; new browser opens, agent runs autonomously; Redis + InsForge fill live
6. **2:30-2:50** GraphQL Playground: typed `orders` come back from Cosmo Router
7. **2:50-3:00** Close: "The agent that builds agents. Most Innovative."

---

## Quickstart (for teammates)

```bash
# 1. Clone + install
git clone <this-repo>
cd understudy
cp .env.example .env   # fill Gemini, TinyFish, InsForge, Redis, Chainguard registry, GH token

# 2. Local dev (requires Docker)
docker compose up    # brings up synthesis API + cosmo-router + redis + warm InsForge pool

# 3. Pre-warm the demo (run the night before)
python scripts/prewarm_demo.py

# 4. Verify the signed production image
cosign verify \
  --certificate-identity "https://github.com/<org>/understudy/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/<org>/understudy-agent-base:latest

# 5. Run a synthesis
curl -X POST http://localhost:8080/synthesize \
  -F recording=@demo-workflow.mp4
```

---

## Repo Structure

```
understudy/
├── README.md                  # this file
├── architecture.md            # full system architecture + diagrams
├── apps/
│   ├── api/                   # FastAPI ingest + synthesis orchestration
│   ├── synthesis-worker/      # Gemini pipeline (keyframe → action → intent → script)
│   ├── cosmo-mcp-driver/      # headless wrapper around Cosmo MCP CLI
│   ├── agent-template/        # base TinyFish agent scaffold generated agents extend
│   └── cosmo-router/          # federation gateway for all generated agents
├── infra/
│   ├── fly/                   # Fly.io Machine manifests with cosign pre-start
│   ├── chainguard/            # Dockerfile.wolfi + per-agent build template
│   ├── insforge-pool/         # warm-pool provisioning scripts
│   └── github-actions/        # CI: build base image, sign, SBOM, push
├── scripts/
│   ├── prewarm_demo.py
│   ├── demo_mode_switch.sh
│   └── record_sample.sh
└── docs/
    ├── demo-runbook.md        # minute-by-minute stage directions
    └── prompt-library/        # versioned Gemini prompts
        ├── action_detection.md
        ├── intent_abstraction.md
        └── script_emission.md
```

---

## Team

Per Gary's framework: no BizDev presenter = no win.

- **Systems hacker** — Chainguard + cosign CI + Fly + OCI registry
- **Full-stack** — Synthesis pipeline + Gemini prompt chain + Cosmo MCP + InsForge + Redis
- **Frontend/design** — Upload UI + synthesis HUD + agent dashboard + Cosmo Studio embed
- **BizDev/presenter** — Validation interviews (hours 1-4), demo recording, live pitch, Q&A

---

## Credits

Built for Ship to Prod — Agentic Engineering Hackathon, April 2026.

Strategy reference: [Gary-Yau Chan, *How to Win a Hackathon*](https://growthwithgary.com/).

---

## License

MIT
