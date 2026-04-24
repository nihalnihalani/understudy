# apps/agent-template — Generated agent scaffold

The base TinyFish CLI scaffold that every synthesized agent extends. Architecture.md §5.

At synthesis time, `gemini-3-flash` emits a TypeScript script via the `emit_tinyfish_script` tool call (architecture.md §10c). The Chainguard builder copies that script into this scaffold, wires the runtime manifest (TinyFish products, Redis namespace, InsForge tables, pinned skill versions), and produces an OCI image with SLSA L2 provenance (architecture.md §6).

Each agent gets:
- Its own Agent Memory Server namespace `ams:agent:{id}:*` (architecture.md §9).
- An int8 Vector Set for episodic recall: `vset:agent:{id}:memory`.
- LangCache in front of Gemini calls: `langcache:gemini:{hash}`.
- A federated GraphQL endpoint composed by Cosmo.

Owner task: **#5 — Build agent template + TinyFish runtime**.
