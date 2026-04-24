---
name: demo-prewarm
description: Seed Redis (LangCache + AMS + Vector Sets + Dream Query cache) and flip DEMO_MODE across every running surface. Use the night before the demo, after a Redis wipe, or after new synthesis fixtures land that change the replay payload.
disable-model-invocation: true
---

# demo-prewarm

Run the pre-demo ritual from architecture.md §14. Seeds the `us:replay:*` keyspace consumed by `DEMO_MODE=replay`, then flips every running surface (Fly synthesis + router, Mac Mini launchd, local Docker Compose) to the requested mode. Mirrors the stage kill-switch documented in `docs/demo-runbook.md`.

## Required tools

- `python` (repo venv with `redis`, `redisvl`, `numpy` — see `pyproject.toml`)
- `redis-cli` (sanity check — `brew install redis`)
- `flyctl`, `ssh` access to Mac Mini, and `docker compose` if the corresponding surfaces are up. Missing surfaces log a yellow WARN and the switch continues.

## Inputs

- `REDIS_URL` — defaults to `redis://localhost:6379/0`. For prewarming the stage demo, point at the production Redis.
- Target mode — one of `live` | `replay` | `hybrid`. Stage default is `hybrid`.
- `DRY_RUN=1` — print commands without executing (useful to preview).
- `--agent` flag on `prewarm_demo.py` — override the default demo agent namespace.
- Surface skips: `SKIP_FLY=1`, `SKIP_MACMINI=1`, `SKIP_COMPOSE=1`.

## Steps

```bash
MODE="${MODE:-hybrid}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"

cd "$(git rev-parse --show-toplevel)"

# 1. Seed the replay keyspace.
python scripts/prewarm_demo.py --redis-url "$REDIS_URL"

# 2. Verify the prewarm keys actually landed (no writes, exits 1 if any missing).
python scripts/prewarm_demo.py --redis-url "$REDIS_URL" --check

# 3. Flip every running surface to the target mode.
bash scripts/demo_mode_switch.sh "$MODE"

# 4. Spot-check that at least one replay key exists.
redis-cli -u "$REDIS_URL" --scan --pattern 'us:replay:*' | head -5
redis-cli -u "$REDIS_URL" --scan --pattern 'dream:*'     | head -5
redis-cli -u "$REDIS_URL" --scan --pattern 'langcache:*' | head -5
```

## Acceptance

- `prewarm_demo.py` exits 0 on both seed and `--check` runs.
- `demo_mode_switch.sh` reports OK (or documented WARN) for every surface that is actually up.
- `redis-cli --scan` returns at least one key for each of `us:replay:*`, `dream:*`, and `langcache:*`.
- If any of the above fails, do not trust the demo — rerun prewarm against the correct `REDIS_URL` before going on stage.

## Notes

- `DEMO_MODE=replay` is hermetic — no Gemini, no Cosmo, no InsForge calls leave the host. Use it if stage Wi-Fi is suspect.
- `DEMO_MODE=hybrid` is the stage default: live for the first 8s of synthesis (for visual authenticity on screen), replay after.
- Mode semantics and surface wiring are authoritative in `architecture.md` §14 — this skill is a wrapper, not a spec.
