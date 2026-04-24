---
name: gemini-prompt-test
description: Run the 3-Gemini synthesis pipeline against a fixture mp4 in DEMO_MODE=replay so prompt iterations don't burn API quota. Use when modifying anything under docs/gemini-prompts/ or apps/synthesis-worker/prompts.py.
disable-model-invocation: true
---

# gemini-prompt-test

Iterate on the action-detection / intent-abstraction / script-emission prompts (`docs/gemini-prompts/`) without hitting live Gemini.

## Prerequisites

- Redis on `localhost:6379` (`make redis`)
- A small mp4 fixture at `fixtures/sample.mp4` (or pass your own path as `args`)

## Steps

1. Seed the replay cache so every Gemini call resolves locally:
   ```bash
   DEMO_MODE=replay python scripts/prewarm_demo.py
   ```

2. Run the worker against the fixture:
   ```bash
   DEMO_MODE=replay REDIS_URL=redis://localhost:6379/0 \
     python apps/synthesis-worker/main.py &
   WORKER_PID=$!

   curl -sS -X POST -F "recording=@${1:-fixtures/sample.mp4};type=video/mp4" \
     http://127.0.0.1:8080/synthesize
   ```

3. Read traces from `run:synth:{id}` to inspect each stage's prompt + response:
   ```bash
   redis-cli XRANGE "run:synth:$RUN_ID" - +
   ```

4. Edit the prompt under `docs/gemini-prompts/`, re-run, diff the trace.

5. Stop the worker: `kill $WORKER_PID`

## Acceptance

- All three stages emit traces (`stage_started`, `pipeline_completed`)
- `us:synth:{id}:result` contains a TinyFishScriptBundle with non-empty `script` and `cosmo_sdl`
