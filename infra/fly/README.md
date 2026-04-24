# infra/fly — Fly.io deployment

Runtime surface for Understudy (architecture.md §12):

| Surface | Hosts | File |
|---|---|---|
| **Fly.io Machines** (iad + sjc, performance-2x) | synthesis API + generated agent cores (each with cosign preboot verify) | `fly.toml`, `agent.fly.toml.tmpl`, `fly-start.sh` |

Generated agents shell out to **TinyFish's hosted browser cloud** for actual browser sessions — Understudy does not operate its own browser pool.

**Every boot verifies SLSA L2 + cosign before the agent runs.** Verification failure = refuse to start. This is the key supply-chain guarantee the pitch depends on at 1:40-2:00.

## Fly Machines

`fly.toml` is the top-level synthesis API. It deploys to **iad** and **sjc** per architecture.md §12. The `[processes] api` entry points at `/usr/local/bin/fly-start.sh`, which runs `cosign verify` + `cosign verify-attestation --type slsaprovenance` against `$IMAGE_REF` before exec-ing uvicorn. Non-zero exit = Fly never marks the machine healthy = deploy rejected.

`agent.fly.toml.tmpl` is rendered per-agent at synthesis time. Jinja2 vars: `agent_id`, `image_digest`, `graphql_port`, `ams_namespace`, `insforge_slot`, `primary_region`, `cosmo_endpoint`, and the optional `pre_warm` flag (see below). The image is pinned by **digest**, not tag — tag drift would defeat the cosign check.

### `pre_warm` (optional, default `false`)

Default cost-efficient behavior: `auto_stop_machines = true`, `min_machines_running = 0`. The machine stops when idle and cold-starts on the next request (~10–25 s).

Render with `pre_warm=true` and the template switches to `auto_stop_machines = "off"` + `min_machines_running = 1`: one machine stays hot, so the first request is sub-second.

**When to use:**
- **Demo / stage agents** (e.g. `export-shopify-orders`) — the 15 s stage window at beat 2:00-2:15 of the pitch does not accommodate a cold start. Render the demo agent with `pre_warm=true` before the pitch.
- **Production latency-critical agents** — if the caller cannot tolerate the cold-start tail.

**Cost:** one `performance-2x` machine running 24/7 per pre-warmed agent. Normal synthesized agents keep the default (`pre_warm=false`) so the warm cost is paid only where it matters. Flip back to `false` after stage if the demo agent is no longer hot-path.

Deploy:

```bash
# Base synthesis API (iad + sjc)
flyctl deploy --config infra/fly/fly.toml

# Per-generated-agent (rendered by the synthesis worker)
flyctl deploy --config /tmp/agent-${AGENT_ID}.fly.toml --app understudy-agent-${AGENT_ID}
```

## TinyFish browser runtime

Generated agents invoke TinyFish's hosted browser via the CLI (`tinyfish run ...`) — we do not run a browser pool ourselves. The TinyFish side is an opaque managed service; our responsibility ends at "the Fly.io Machine that hosts the agent core verified cosign before booting, and that agent calls `tinyfish run` with a pinned Skill version."

The `TINYFISH_API_KEY` env var is passed via `fly secrets` and rotated per the standard Fly secrets workflow.

## The two cosign commands (same every time)

```bash
cosign verify \
  --certificate-identity   "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "$IMAGE_REF"

cosign verify-attestation --type slsaprovenance \
  --certificate-identity   "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "$IMAGE_REF"
```

Identical on Fly.io and `scripts/verify_release.sh` (stage demo). One identity string everywhere.

Owner task: **#9 — Build Fly.io deployment infra**.
