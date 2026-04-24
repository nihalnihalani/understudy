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
