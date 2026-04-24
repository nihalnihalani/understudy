# apps/synthesis-worker — Three-Gemini pipeline

Runs the synthesis pipeline (architecture.md §3):

1. **Frame extraction** — OpenCV PSNR scene-change cuts raw 60 frames to 5-8 keyframes (≈10× token reduction).
2. **Action detection** — `gemini-3.1-flash-lite`, `thinking_level=minimal`, multimodal fn-response per keyframe (architecture.md §10a).
3. **Intent abstraction** — `gemini-3.1-pro`, `thinking_level=high` over the event trace (architecture.md §10b).
4. **Script emission** — `gemini-3-flash`, `thinking_level=medium`, emits TinyFish CLI TypeScript + Cosmo SDL + runtime manifest (architecture.md §10c, §11).

Model IDs come from `understudy/models.py`. Must honor `DEMO_MODE=replay` by reading `us:replay:{synth_id}` from Redis.

Owner task: **#3 — Build 3-Gemini synthesis worker**.
