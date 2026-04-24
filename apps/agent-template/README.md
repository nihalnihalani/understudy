# apps/agent-template — Generated agent scaffold

The base TypeScript scaffold that every synthesized agent extends. Architecture.md §5 (runtime), §6 (signed image self-verify), §10c (runtime_manifest shape), §13 (cosign fails row).

## How synthesis produces an agent

1. **`gemini-3-flash`** emits an `emit_tinyfish_script` tool call (architecture.md §10c) with:
   - `script` — TinyFish CLI TypeScript (this is the agent's business logic).
   - `cosmo_sdl` — the GraphQL SDL delta from Cosmo Dream Query (architecture.md §4).
   - `runtime_manifest` — tinyfish products, Redis namespace, InsForge tables, pinned skill versions.
   - `skills_pinned` — `[{ name, version }]` — **never `latest`** (architecture.md §13 "TinyFish Skill version drift").
2. `apps/synthesis-worker` writes those artifacts into a per-agent directory.
3. The Chainguard builder (`infra/chainguard/Dockerfile.agent.tmpl`) layers them on top of `understudy-agent-base` and produces a signed OCI image (SLSA L2 + cosign Fulcio + Rekor).
4. At boot, this scaffold loads the manifest, runs `cosign verify`, and starts a GraphQL server whose resolvers delegate to the agent core loop.

## What this scaffold provides

| File | Responsibility |
|---|---|
| `src/index.ts` | Entry. Reads `$RUNTIME_MANIFEST_PATH`, runs the preboot cosign gate, boots Apollo. |
| `src/graphql/server.ts` | Loads SDL from `manifest.cosmo_sdl_path`, synthesizes a resolver per field → core loop. |
| `src/core/loop.ts` | `user turn → LangCache lookup → TinyFish CLI (pinned skill) → assistant turn → LangCache store`. |
| `src/tinyfish/cli.ts` | execa wrapper around `tinyfish run --skill name@version --script …`. Refuses `latest`. |
| `src/insforge/mcp-client.ts` | InsForge Remote OAuth MCP client. 401 → refresh → retry (architecture.md §13). |
| `src/memory/client.ts` | Per-agent AMS namespace: STM Stream + LTM Hash + int8 Vector Set recall + LangCache. |
| `src/preboot/verify.ts` | Runs `scripts/verify_release.sh` (or direct cosign); `process.exit(1)` on fail. |
| `src/manifest.ts` | zod schema for `runtime_manifest.json`. |
| `examples/export-shopify-orders/` | Sample generated agent (demo wall artifact, architecture.md §15, 2:55 beat). |

## Preboot gate (non-negotiable)

Architecture.md §6 and §13 "cosign verify fails" row: the agent **refuses to boot** if the image signature or SLSA L2 provenance attestation does not validate. This is the governance story on stage at 1:40–2:00. See `src/preboot/verify.ts`.

Environment:
- `IMAGE_REF` — image digest to verify (falls back to `manifest.image_digest`).
- `VERIFY_RELEASE_SCRIPT` — path to `scripts/verify_release.sh` (preferred when available).
- `SKIP_COSIGN_VERIFY=1` — escape hatch for local dev only. Never in prod.

## Run locally against the sample agent

```bash
cd apps/agent-template
npm install
SKIP_COSIGN_VERIFY=1 REDIS_URL=redis://localhost:6379/0 \
  npm run dev -- --manifest examples/export-shopify-orders/runtime_manifest.json
```

Then point any GraphQL client at the printed URL and issue:

```graphql
query { exportOrders(dateRange: "yesterday", format: CSV) { id rowCount downloadUrl } }
```

## Build the agent image

Use `infra/chainguard/Dockerfile.agent.tmpl` with the SBOM + SLSA predicate from `infra/chainguard/slsa-config.yaml`. Every rendered Dockerfile's `ENTRYPOINT` runs `/usr/local/bin/verify-self.sh` before the agent process — tampering produces a non-zero exit and Fly / launchd marks the deploy unhealthy.

## Prod swap: `@tinyfish/cli`

Dev uses a local stub at `stubs/tinyfish-cli/` so `npm install` works without access to the vendor's private registry (this is what unblocked the root `apps/web` workspace install). At image build time the Chainguard Dockerfile runs `npm install -g @tinyfish/cli@^2` from the TinyFish npm scope, replacing the stub. See `infra/chainguard/Dockerfile.agent.tmpl` lines 29-34.

## Tests

```bash
npm run typecheck
npm test
```

Covered:
- `manifest.test.ts` — zod schema validation (rejects unknown products, empty skills, missing fields).
- `tinyfish.test.ts` — argv shape, `latest` rejection, empty skill rejection.
- `preboot.test.ts` — cosign gate refuses to start on verify fail; direct vs script modes.
- `core-loop.test.ts` — `user-turn-before-assistant-turn` ordering, LangCache hit avoids re-run, ad-hoc skill rejection, default pinned-skill selection.
- `graphql-resolvers.test.ts` — SDL → delegating resolver map.
- `insforge.test.ts` — token refresh reuse + 401-retry loop.

## Apollo Server version note

We're on `@apollo/server@^4.11.2`. Apollo v4 EOL'd Jan 26 2026; v5 upgrade is a ~30-minute task tracked outside this repo and not load-bearing for the demo.
