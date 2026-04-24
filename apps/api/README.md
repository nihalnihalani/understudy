# apps/api — Synthesis API

FastAPI ingest. Accepts a 60s screen recording, validates it, writes it to object storage, and enqueues a synthesis run on Redis Stream `run:synth:{run_id}` (see architecture.md §9).

Downstream: `apps/synthesis-worker/` consumes the stream and runs the three-Gemini pipeline.

Owner task: **#2 — Build synthesis API (FastAPI ingest)**.
