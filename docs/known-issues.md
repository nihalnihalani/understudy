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


## Additional fixes from verifier (conformance-report.md) — folded into #12

### Fixed

7. **MAJOR 1: `infra/insforge-pool/schema.sql` was missing** — severity: high
   - What failed: `infra/insforge-pool/provision.sh:23` references `schema.sql`
     and warns "WARN: ... not found — skipping seed" when absent. That meant
     every per-tenant provision ran without schema, so every generated agent's
     PostgREST endpoint would 404 on first call.
   - Fix: created `infra/insforge-pool/schema.sql` with DDL for all ten §8 ER
     tables (`recording`, `synthesis_run`, `dream_queries`, `image`,
     `slsa_attestation`, `sbom`, `agent`, `agent_memories`,
     `tinyfish_skills_used`, `agent_runs`). UUID PKs default to
     `gen_random_uuid()` (pgcrypto), FKs mirror the ER arrows, jsonb columns
     hold materials/components/topics/entities/result, and `embedding` uses
     pgvector(1536).
   - Guard: `tests/test_insforge_schema.py` parses the DDL and asserts table
     set + required columns per table + FK relationships + UUID-default shape.

8. **MINOR: release.yml attested SBOM as `--type slsaprovenance`** — severity: medium
   - What failed: `infra/github-actions/release.yml:189-194` ran
     `cosign attest --predicate sbom.spdx.json --type slsaprovenance`. The
     `slsaprovenance` attestation has to point at the in-toto provenance JSON
     that slsa-github-generator produces, not the SPDX SBOM. This would fail
     `cosign verify-attestation --type slsaprovenance` at agent boot, which is
     exactly the preboot gate in §13 — every agent would fail to start in prod.
   - Fix: split into two proper `cosign attest` calls. The SBOM step keeps
     `--predicate sbom.spdx.json --type spdxjson`. The provenance step now
     downloads the `*.intoto.jsonl` artifact from the slsa-github-generator job
     (enabled `upload-assets: true`) and passes that with `--type
     slsaprovenance`. Also added a `download-artifact` step ahead of it.
   - Guard: `tests/test_release_workflow.py` asserts exactly 2 attest steps
     with disjoint types, that slsaprovenance does not use `sbom.spdx.json`,
     and that the predicate path ends in `intoto.jsonl`.

### Deferred — tracked here, not blocking demo

9. **`vset:global:skills` is a dead key** — severity: low
   - Declared in architecture.md §9 but no code reads or writes it. Either
     wire a skill matcher on top of it, or drop the row from §9 to reduce
     reviewer surface-area confusion. Defer to post-demo cleanup.

10. **`scripts/demo_mode_switch.sh` is a TODO stub** — severity: low
    - Script exists and `bash -n` parses, but the body doesn't actually flip
      `DEMO_MODE` between `live` / `replay` / `hybrid`. The demo runbook sets
      the env var directly, so this is only a polish-item.

11. **`rate:gemini:{model}` key declared but unused at API layer** — severity: low
    - `understudy/memory/client.py::consume_rate_token` implements the
      token-bucket against this key, but no middleware calls it. The synthesis
      worker's GeminiClient does its own retry backoff, so the missing limiter
      only bites under a pathological Gemini-call storm. Either add an API
      dependency that calls `consume_rate_token`, or drop the row from §9.

12. **Dream Query has no auto-retry on breaking-change report** — severity: low
    - §4 describes retrying with a narrower query via 3.1 Pro when
      `validate_against_live_traffic` reports breaking changes. The current
      driver (`CosmoDreamQuery.validate_against_live_traffic`) returns the
      report but doesn't loop. For demo, fixtures return
      `has_breaking_changes=False`, so this path isn't exercised. Track for
      a follow-up; not on the demo path.
