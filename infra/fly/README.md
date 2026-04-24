# infra/fly — Fly.io + Mac Mini deployment

Two runtime surfaces for Understudy (architecture.md §12):

| Surface | Hosts | File |
|---|---|---|
| **Fly Machines** (iad + sjc, performance-2x) | synthesis API + generated agent cores | `fly.toml`, `agent.fly.toml.tmpl` |
| **Mac Mini** (local, TinyFish browser pool) | headful Chromium via TinyFish CLI | `macmini.plist`, `macmini-start.sh` |

**Both verify SLSA L2 + cosign before starting.** Verification failure = refuse to run. This is the key supply-chain guarantee the pitch depends on at 1:40-2:00.

## Fly Machines

`fly.toml` is the top-level synthesis API. It deploys to **iad** and **sjc** per architecture.md §12. The `[processes] api` entry points at `/usr/local/bin/fly-start.sh`, which runs `cosign verify` + `cosign verify-attestation --type slsaprovenance` against `$IMAGE_REF` before exec-ing uvicorn. Non-zero exit = Fly never marks the machine healthy = deploy rejected.

`agent.fly.toml.tmpl` is rendered per-agent at synthesis time. Jinja2 vars: `agent_id`, `image_digest`, `graphql_port`, `ams_namespace`, `insforge_slot`, `primary_region`, `cosmo_endpoint`. The image is pinned by **digest**, not tag — tag drift would defeat the cosign check.

Deploy:

```bash
# Base synthesis API (iad + sjc)
flyctl deploy --config infra/fly/fly.toml

# Per-generated-agent (rendered by the synthesis worker)
flyctl deploy --config /tmp/agent-${AGENT_ID}.fly.toml --app understudy-agent-${AGENT_ID}
```

## Mac Mini

`macmini.plist` is a LaunchDaemon (`com.understudy.tinyfish`). Install:

```bash
sudo mkdir -p /var/log/understudy
sudo cp infra/fly/macmini-start.sh /usr/local/bin/macmini-start.sh
sudo chmod +x /usr/local/bin/macmini-start.sh
sudo cp infra/fly/macmini.plist /Library/LaunchDaemons/com.understudy.tinyfish.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.understudy.tinyfish.plist
```

`macmini-start.sh` runs the same two cosign commands as Fly, then `exec tinyfish serve`. `KeepAlive=true` respawns on crash; `ThrottleInterval=30` prevents hot-loops. A verify failure hot-loops on purpose — better than silently starting an unverified image.

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

Identical on Fly, Mac Mini, and `scripts/verify_release.sh` (stage demo). One identity string everywhere.

Owner task: **#9 — Build Fly + Mac Mini deployment infra**.
