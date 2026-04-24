# Known Issues

## .env.example is missing Cosmo router vars

router-engineer could not update `.env.example` during MILESTONE G —
the tooling enforces a rule that blocks writes to `.env*` files (correct
behavior; we don't want a committed template getting accidental real
values). The vars below need to be appended manually or by tester-debugger.

### Required

Referenced by `apps/cosmo-router/config.yaml`, `docker-compose.yml`, and
`scripts/register_agent_subgraph.sh` via `${VAR}` substitution.

InsForge OAuth MCP (bearer-token auth):
- `INSFORGE_OAUTH_JWKS_URL`
- `INSFORGE_OAUTH_ISSUER`
- `INSFORGE_OAUTH_AUDIENCE`

EDFS Kafka provider:
- `EDFS_KAFKA_BROKERS`
- `EDFS_KAFKA_SASL_USERNAME`
- `EDFS_KAFKA_SASL_PASSWORD`

EDFS NATS provider:
- `EDFS_NATS_URL`
- `EDFS_NATS_TOKEN`

Cosmo control-plane (used by `scripts/register_agent_subgraph.sh`):
- `COSMO_API_KEY`
- `COSMO_NAMESPACE`
- `COSMO_FEDERATED_GRAPH`

### Optional (have defaults)

- `STUDIO_URL` (defaults to `https://cosmo.wundergraph.com/studio`)
- `FRONTEND_ORIGIN` (defaults to `http://localhost:3000`)
- `COSMO_ROUTER_DEV_MODE` (defaults to `false`)
- `COSMO_ROUTER_LOG_LEVEL` (defaults to `info`)

### Note on naming

The MILESTONE G briefing mentioned `EDFS_KAFKA_USERNAME` / `EDFS_KAFKA_PASSWORD`
and `EDFS_NATS_USERNAME` / `EDFS_NATS_PASSWORD`. The committed code uses
`EDFS_KAFKA_SASL_USERNAME` / `EDFS_KAFKA_SASL_PASSWORD` and `EDFS_NATS_TOKEN`
(no NATS username/password pair — NATS auths via token). Match the code.


## Findings from test + debug pass (task #11 / #12)

Summary of issues found while building the cross-stack test suite and running the
demo pipeline end-to-end in `DEMO_MODE=replay`. Each fix is followed by the test
that now guards against regression.

### Fixed

1. **API/worker field-name mismatch on `jobs:synthesis`** — severity: high
   - What failed: `apps/api/redis_client.py:119` enqueues `{run_id, recording_uri, enqueued_at}` but `apps/synthesis-worker/main.py:83` read `fields["synth_id"]`, which would `KeyError` on every real job.
   - Fix: worker accepts either `synth_id` or `run_id` (same UUID) — `apps/synthesis-worker/main.py:83-86`. The API field name is kept because `run_id` matches the SYNTHESIS_RUN row id from architecture.md §8.
   - Guard: `tests/test_api_endpoints.py::test_synthesize_happy_path` asserts the job fields include `run_id`.

2. **pytest collection collision between `tests/` and `apps/cosmo-mcp-driver/tests/`** — severity: medium
   - What failed: both test dirs have `__init__.py`, which made pytest resolve both test modules to the same `tests.<name>` dotted path → `ModuleNotFoundError: No module named 'tests.test_driver'` during collection.
   - Fix: set `--import-mode=importlib` in `pyproject.toml [tool.pytest.ini_options].addopts`. This gives each test file a unique module name regardless of `__init__.py` siblings.
   - Guard: full `pytest -q` succeeds (74 passed, 1 skipped).

3. **Hyphenated-directory launch (`python -m apps.synthesis_worker.main` doesn't resolve)** — severity: medium
   - What failed: docker-compose.yml, docs/deployment.md, and the README referred to `python -m apps.synthesis_worker.main` and `python -m apps.cosmo_mcp_driver.cli`, neither of which resolve because `apps/synthesis-worker/` and `apps/cosmo-mcp-driver/` have hyphens (Python can't import hyphen-named packages).
   - Fix: added `[project.scripts]` entries in `pyproject.toml` plus `understudy/bin.py` wrappers that inject the hyphen-dir onto `sys.path`, then dispatch. Two new commands: `understudy-synthesis-worker`, `understudy-cosmo-driver`.
   - Rationale: rename would touch architecture.md + compose + 5 READMEs. Entry points are one-line fix.
   - Guard: both console scripts resolve after `pip install -e .` and the worker/driver both start up; verified by hand.

4. **FastAPI middleware bypasses `dependency_overrides`** — severity: low (test-only)
   - What failed: `apps/api/main.py:98` calls `get_redis()` directly from the `trace_middleware`, which doesn't go through FastAPI DI, so test overrides didn't take effect → tests tried to hit a real Redis, causing `Event loop is closed` under `httpx.ASGITransport`.
   - Fix: `tests/conftest.py::api_client` also swaps the module-level `_client` singleton in `apps.api.redis_client` for the fakeredis-backed client. Prod code is unchanged; this is a test-environment patch only.

### Still unresolved (not blocking demo)

5. **`apps/api/main.py::stream_synthesis` (SSE) has no coverage test** — severity: low
   - Why: the endpoint uses `XREAD BLOCK` which fakeredis' implementation handles differently from real Redis. A real-Redis-backed integration test would prove it, but was descoped (out of scope for this task).
   - Workaround: the path is exercised in the frontend via `EventSource` during demo; architecture.md §9 describes the convention. If it regresses, the UI HUD stops updating live, but `GET /synthesis/{id}` still works.

6. **`test_cosign_sign_and_verify_local_image` is skipped by default** — severity: low
   - Why: requires both `cosign` and `docker` on PATH plus the full wolfi build. CI slot should install cosign to enable this.
   - Workaround: offline test (`test_slsa_predicate_validates_against_in_toto_schema`) validates the predicate shape the API emits against the in-toto v1 schema. That covers the JSON we actually surface to the frontend; sign/verify is checked by `scripts/verify_release.sh` on release tags.

### Test suite footprint after task #11

- Python: 74 passed, 1 skipped (cosign online). New files:
  `tests/test_api_endpoints.py`, `tests/test_e2e_smoke.py`,
  `tests/test_keyframes_stress.py`, `tests/test_supply_chain.py`,
  `tests/test_cosmo_to_router.py`.
- Vitest (`apps/agent-template`): 18 passed across 6 files.
- `apps/web`: `npm run typecheck` + `npm run build` both clean.
- Coverage: 67% total on `apps/` + `understudy/`. Below the 70% target because
  `apps/synthesis-worker/main.py` (the worker loop) and `apps/api/main.py`
  SSE path are not exercised — both need a real Redis, covered manually by the
  demo script.
