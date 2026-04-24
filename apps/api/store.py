"""In-memory fixture store for the API layer.

Real persistence is InsForge 2.0 PostgREST (architecture.md §8). Until the backend
wire-up lands (part of task #5), the API layer serves a small in-memory fixture set so
`GET /agents`, `GET /agents/{id}`, and `GET /synthesis/{id}` have something to return
for the frontend (task #10) and tests (task #11).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from .schemas import Agent, SynthesisRun, SynthesisStatus


_AGENT_1_ID = UUID("11111111-1111-1111-1111-111111111111")
_AGENT_2_ID = UUID("22222222-2222-2222-2222-222222222222")


def seed_agents() -> dict[UUID, Agent]:
    return {
        _AGENT_1_ID: Agent(
            id=_AGENT_1_ID,
            image_digest="sha256:deadbeefcafe0000000000000000000000000000000000000000000000000001",
            cosign_sig="MEUCIQDmockSignature1",
            graphql_endpoint="https://cosmo.understudy.dev/agents/alpha/graphql",
            ams_namespace="ams:agent:11111111",
        ),
        _AGENT_2_ID: Agent(
            id=_AGENT_2_ID,
            image_digest="sha256:deadbeefcafe0000000000000000000000000000000000000000000000000002",
            cosign_sig="MEUCIQDmockSignature2",
            graphql_endpoint="https://cosmo.understudy.dev/agents/beta/graphql",
            ams_namespace="ams:agent:22222222",
        ),
    }


class Store:
    """In-memory fixtures + run registry. Thread-safety not required — uvicorn single proc."""

    def __init__(self) -> None:
        self.agents: dict[UUID, Agent] = seed_agents()
        self.runs: dict[UUID, SynthesisRun] = {}

    def create_run(self, recording_id: UUID) -> SynthesisRun:
        run = SynthesisRun(
            id=uuid4(),
            recording_id=recording_id,
            status=SynthesisStatus.QUEUED,
            completed_at=None,
        )
        self.runs[run.id] = run
        return run

    def get_run(self, run_id: UUID) -> SynthesisRun | None:
        return self.runs.get(run_id)

    def list_agents(self) -> list[Agent]:
        return list(self.agents.values())

    def get_agent(self, agent_id: UUID) -> Agent | None:
        return self.agents.get(agent_id)


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store


def _now() -> datetime:
    return datetime.now(timezone.utc)
