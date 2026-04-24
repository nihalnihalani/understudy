"""Python-side glue for the generated agent: memory client + GraphQL handler wiring.

The TinyFish CLI script is TypeScript (see package.json in this directory). This module
provides the Python helpers the agent loop imports when running inside the Chainguard pod.
"""


async def agent_core_loop(agent_id: str) -> None:
    # TODO(task #5): wire TinyFish skills, Agent Memory Server client, Cosmo-federated
    # GraphQL handler, and InsForge Remote OAuth MCP (architecture.md §5).
    raise NotImplementedError("see task #5")
