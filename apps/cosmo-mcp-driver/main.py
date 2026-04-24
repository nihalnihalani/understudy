"""Cosmo MCP driver entrypoint — programmatic access to Dream Query from the synthesizer."""


async def dream_query(desired_operation: str) -> dict[str, str]:
    # TODO(task #4): invoke Cosmo MCP `dream_query` tool, validate against live traffic,
    # run schema_change_proposal_workflow, return composed SDL + endpoint (architecture.md §4).
    raise NotImplementedError("see task #4")


async def propose_subgraph(sdl_delta: str) -> dict[str, str]:
    # TODO(task #4): propose → compose → breaking-change check → publish.
    raise NotImplementedError("see task #4")
