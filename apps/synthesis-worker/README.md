# apps/synthesis-worker — Three-Gemini pipeline

Runs the synthesis pipeline (architecture.md §3):

1. **Frame extraction** — `keyframes.py`. OpenCV PSNR scene-change cuts a 60s recording to 5-8 keyframes (~10× token reduction).
2. **Action detection** — `gemini-3.1-flash-lite`, `thinking_level=minimal`, multimodal fn-response per keyframe (architecture.md §10a).
3. **Intent abstraction** — `gemini-3.1-pro`, `thinking_level=high` over the event trace (architecture.md §10b).
4. **Script emission** — `gemini-3-flash`, `thinking_level=medium`, `emit_tinyfish_script` tool-call (architecture.md §10c, §11).

Model IDs come from `understudy/models.py`. Must honor `DEMO_MODE=replay` by reading `us:replay:{synth_id}:{stage}` from Redis.

## Modules

| File | Role |
|---|---|
| `keyframes.py` | ffmpeg decode + OpenCV PSNR scene-change selection, capped at 5-8 frames, downsampled to 512px |
| `prompts.py` | Verbatim §10(a)(b)(c) system prompts + JSON schemas + `emit_tinyfish_script` tool decl |
| `gemini_client.py` | `google-genai` wrapper: LangCache + DEMO_MODE + hybrid 8s timeout + InsForge Model Gateway 429 fallback + thought-signature retry |
| `langcache.py` | `langcache:gemini:{sha256(canonical_json)}` exact-match cache with optional `vset:global:langcache` semantic fallback (≥0.95 cosine = hit) |
| `pipeline.py` | `detect_actions` / `abstract_intent` / `emit_script` / `run_pipeline` — the three stages |
| `main.py` | Redis Streams consumer (`jobs:synthesis` → `us:synth:{id}:result`) |

## Running the worker

```bash
# Standalone (hyphenated dir — direct script):
python apps/synthesis-worker/main.py

# As a module (if you rename the dir to synthesis_worker):
python -m apps.synthesis_worker.main
```

Env:

| Var | Values | Default |
|---|---|---|
| `DEMO_MODE` | `live` / `replay` / `hybrid` | `live` |
| `REDIS_URL` | Redis DSN | `redis://localhost:6379` |
| `GOOGLE_API_KEY` | Gemini key | (required for live) |
| `MODEL_GATEWAY_URL` | InsForge fallback URL | (unset) |
| `HYBRID_LIVE_BUDGET_S` | Seconds before hybrid mode times out to replay | `8` |
| `COSMO_MOCK` | `1` = inline SDL stub | `0` |
| `WORKER_ID` | Consumer name in the stream group | `worker-1` |

## Tests & fixtures

- `tests/synthesis_worker/` — 18 tests covering: keyframe 5-8 bound, stage signatures, schema shape, replay short-circuit, full fixture E2E
- `fixtures/synthesis/` — 3-frame demo input + expected outputs at each stage (shareable with tester-debugger)

Owner task: **#3 — Build 3-Gemini synthesis worker**.
