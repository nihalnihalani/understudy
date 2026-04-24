# apps/web — Understudy frontend

Vite + React + TypeScript + Tailwind. Five screens map 1:1 to the five `README.md` Demo Theater beats — the UI is on stage, not a dashboard-after-the-fact.

## Screens → demo beats

| Route                                      | Screen          | Demo beat (see `../../README.md` §Demo Theater) |
| ------------------------------------------ | --------------- | ----------------------------------------------- |
| `/synthesize`                              | Upload          | 0:00-0:20 (record + submit)                     |
| `/synthesize/:id`                          | Synthesis HUD   | 0:20-1:20 (3-Gemini pipeline visualized live)   |
| `/synthesize/:id/dream-query`              | Dream Query     | 1:20-1:40 (SDL delta + live-traffic validator)  |
| `/agents/:id/supply-chain`                 | Supply Chain    | 1:40-2:00 (cosign verify + SLSA L2 + Rekor)     |
| `/agents`                                  | Agent Wall      | 2:55-3:00 (payoff — ten signed agents)          |

## Run it

Requires Node >= 20. The app lives inside a workspace with a not-yet-published `@tinyfish/cli` dep in `apps/agent-template`; npm gets confused if you try to install from the repo root, so install from inside `apps/web/` with `--workspaces=false`:

```bash
cd apps/web
npm install --workspaces=false   # 140 packages, no network games
npm run dev                      # Vite on http://localhost:5173
npm run build                    # production bundle -> dist/
npm run typecheck                # no-op on clean main
```

During `npm run dev`, Vite proxies `/api/*` to the FastAPI on `http://localhost:8080` (see `vite.config.ts`). Start the API separately:

```bash
# from repo root
python -m uvicorn apps.api.main:app --reload
```

Environment variables (all optional; sensible defaults in dev):

| Var                 | Purpose                                          | Default                           |
| ------------------- | ------------------------------------------------ | --------------------------------- |
| `VITE_API_BASE_URL` | absolute API base, overrides the `/api` proxy    | `/api`                            |
| `VITE_STUDIO_URL`   | "Open in Cosmo Studio" link target (Dream Query) | `https://cosmo.wundergraph.com/studio` |

## How data flows

Every page renders real shapes defined in `apps/api/schemas.py` (Python Pydantic). The TypeScript mirrors live in `src/api/types.ts` and are kept in 1:1 correspondence by hand — if you add a field to `schemas.py`, add it here too. Pydantic-to-TS codegen was rejected as overweight for ~200 lines.

- `src/api/client.ts` — typed fetch wrapper. Covers `/healthz`, `/synthesize`, `/synthesis/{id}`, `/synthesis/{id}/stream` (SSE URL), `/agents`, `/agents/{id}`, `/agents/{id}/attestation`, `/demo/replay/{synth_id}`.
- `src/hooks/useTraceStream.ts` — subscribes to synthesis trace events via `EventSource` against `GET /synthesis/{id}/stream`. The backend replays the Redis Stream history on connect then tails via `XREAD BLOCK`, so a single SSE connection gives us both backfill and live updates. `onmessage` receives JSON-encoded `TraceEvent`s; a terminal `event: done` frame (with `{status, synthesis_run_id}`) is consumed via `addEventListener("done", ...)` and triggers one immediate REST refresh so the HUD snaps to the final state. We also fetch `GET /synthesis/{id}` on mount and every 3 s while the run is not terminal to refresh the `SynthesisRun` row (status, `gemini_*_trace`, `intent_abstraction`) — those live on REST, not the stream.

Every screen also has a fixtures fallback (`src/fixtures/demo.ts`) so the UI is demo-able with zero backend: the HUD, Dream Query, Supply Chain, and Agent Wall render off fixtures if the API returns empty. The fixtures mirror:

- `SynthesisRunDetail` shape for the HUD
- `DreamQuery` with SDL delta sourced from `fixtures/cosmo/orders-query.json`
- `SlsaAttestation`, `Sbom`, `Image`, `Agent` for the supply-chain receipt
- `Agent[]` + per-agent extras for the wall

## Design system

Tokens live in `tailwind.config.ts` and mirror the Stitch project "Understudy Enterprise Governance" (see `.stitch-project-id`):

- Dark-first, indigo primary (`#6366F1`), cyan accent (`#22D3EE`), emerald for verified supply-chain states (`#34D399`).
- Inter for chrome and body, JetBrains Mono for every digest, URI, UUID, receipt row, and tool-call stream.
- Meter bars only — no circular spinners.
- 1 px borders, no drop shadows on dark canvas.
- Supply-chain receipts are first-class UI, never hidden in a debug tab.

## Accessibility

- WCAG AA contrast enforced in the token set.
- Every interactive surface is keyboard-reachable; focus ring is a 2 px indigo outline with 2 px offset.
- `aria-live="polite"` on the Gemini stage cards while streaming.
- Receipt blocks use `role="region"` with an `aria-label` so screen readers announce them as receipts, not code.

## Component inventory

| File                                      | Purpose                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `App.tsx`                                 | App shell + top nav + health chip row.                                  |
| `pages/Upload.tsx`                        | MP4 drop zone, client-side probe, progress bar, POST /synthesize.       |
| `pages/SynthesisHUD.tsx`                  | Three-column hero HUD: stage cards, keyframe ribbon, intent tree.       |
| `pages/DreamQuery.tsx`                    | SDL diff, validator PASS banner, supergraph mini, resolver stubs.       |
| `pages/SupplyChain.tsx`                   | cosign, Fulcio, Rekor, SLSA L2 predicate, SBOM — all receipt-style.     |
| `pages/AgentWall.tsx`                     | 10-agent grid with detail drawer.                                       |
| `components/GeminiStageCard.tsx`          | Per-stage card with tool-call stream, meter bar, status chip.           |
| `components/MeterBar.tsx`                 | 4 px tall progress meter (no circular spinners).                        |
| `components/StatusChip.tsx`               | Emerald/amber/crimson/gray status chip used across screens.             |
| `components/SdlDiffViewer.tsx`            | GraphQL-aware diff renderer with line numbers and red/green rails.      |
| `components/CosignReceipt.tsx`            | Receipt card + row primitive with copy button + external-link support. |
| `components/AgentCard.tsx` + `Drawer.tsx` | Grid card + slide-in detail drawer with Overview/Memory/Runs tabs.      |
| `components/TraceStreamTail.tsx`          | Terminal-style tail of recent `TraceEvent`s.                            |

## Screenshots

TODO: add `docs/screenshots/{upload,hud,dream-query,supply-chain,agent-wall}.png` after the Stitch render pass completes for the three that timed out during design (HUD, Supply Chain, Agent Wall). The React implementations already match the design specs; screenshots are for the pitch deck.

## Stitch project

The Stitch project ID is stored at `.stitch-project-id` for handoff. Four of the five screens rendered server-side on the first pass (Upload, Dream Query, Supply Chain, Agent Wall); the Synthesis HUD spec is dense enough that Stitch's generator times out on it — the React implementation at `src/pages/SynthesisHUD.tsx` was built directly from the same spec, so visual parity is maintained. Re-running `mcp__stitch__generate_screen_from_text` on the HUD prompt later (possibly split into two variants: vertical-flow + horizontal-flow) will produce the missing Stitch render without any code changes here.

## Backend integration status

Fully wired — every screen with an API renders from live bundles:

- `GET /synthesis/{id}/stream` — SSE over `run:synth:{id}` with a terminal `event: done` frame. Consumed by `src/hooks/useTraceStream.ts`.
- `GET /agents/{id}/attestation` — `FullAttestation` bundle with all 13 governance-receipt fields (agent, image, slsa, sbom, `rekor_log_index`, `rekor_url`, `rekor_uuid`, `rekor_integrated_time`, `certificate_identity`, `certificate_oidc_issuer`, `subject_alt_name`, `cert_not_before`, `cert_not_after`). Consumed by `src/pages/SupplyChain.tsx` via React Query. Every receipt field on that screen is now authoritative — no client-side derivation.

Fixtures in `src/fixtures/demo.ts` share the exact live-bundle shape, so the Supply Chain page falls through to them only when the API is unreachable or the id is the `demo` placeholder. The footer labels the source so reviewers can tell at a glance.
