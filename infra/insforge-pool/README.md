# infra/insforge-pool — InsForge 2.0 warm-pool provisioning

Three pre-warmed InsForge 2.0 backends for the demo, each exposing a Remote OAuth MCP server (no stdio bridge), PostgREST auto-API, and Model Gateway fallback routes (architecture.md §5, §13, §18 risk #3).

A generated agent claims a free slot at synthesis time; the ER schema from architecture.md §8 is seeded into each slot during provisioning.

Owner task: supports **#5 — Build agent template + TinyFish runtime**.
