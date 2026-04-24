"""Adapter protocols for the sponsor services the synthesis pipeline depends on.

The API never calls Gemini / Cosmo / Chainguard directly — the synthesis-worker does. The
API owns the *surface* (request/response shape) and the *abstraction* (protocol) so the
worker can plug in a real implementation without touching the web layer.

See architecture.md §3 (pipeline), §4 (Cosmo Dream Query), §6 (supply chain).
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class SynthesisClient(Protocol):
    """Gemini-family synthesis client — fronts the three-model pipeline.

    Concrete impls land in `apps/synthesis-worker/` (task #3). The API only needs the
    protocol so `/demo/replay` + tests can swap in a `_mock.py` without importing worker code.
    """

    async def detect_actions(self, frames: list[bytes]) -> list[dict[str, Any]]:
        """Gemini 3.1 Flash-Lite — per-keyframe UI event detection (architecture.md §10a)."""
        ...

    async def abstract_intent(
        self, events: list[dict[str, Any]], dom_snapshots: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Gemini 3.1 Pro, `thinking_level: high` — goal + inputs + invariants (§10b)."""
        ...

    async def emit_script(self, intent: dict[str, Any]) -> dict[str, Any]:
        """Gemini 3 Flash, `thinking_level: medium` — TinyFish CLI script (§10c)."""
        ...


@runtime_checkable
class CosmoDreamClient(Protocol):
    """Cosmo MCP Dream Query client (architecture.md §4).

    The synthesizer already knows what the agent wants to query; Dream Query answers what
    schema has to exist. Live-traffic validation is part of the MCP call, not the caller.
    """

    async def dream_query(self, desired_operation: str) -> dict[str, Any]:
        """Return `{sdl_delta, validation_report, subgraph_id}` per §4 sequence diagram."""
        ...


@runtime_checkable
class SignerClient(Protocol):
    """Chainguard + cosign + Fulcio + Rekor (architecture.md §6).

    API only needs the predicate shape — the actual signing runs in CI via the
    `infra/github-actions/` workflow, not in the request path.
    """

    async def sign(self, image_digest: str) -> dict[str, Any]:
        """Return `{cosign_sig, slsa_predicate, sbom, rekor_log_index}`."""
        ...

    async def verify(self, image_digest: str) -> bool:
        """`cosign verify` + `cosign verify-attestation --type slsaprovenance`."""
        ...
