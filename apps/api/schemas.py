"""Pydantic models mirroring the Postgres ER diagram (architecture.md §8).

Every table in §8 gets a model here. Fields match the ER column list; JSON/JSONB columns
land as dict/list values. Timestamps use timezone-aware datetimes.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class SynthesisStatus(str, Enum):
    """Lifecycle states for a SYNTHESIS_RUN — drives the UI HUD and retry logic."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DemoMode(str, Enum):
    """`DEMO_MODE` env flag values — architecture.md §14."""

    LIVE = "live"
    REPLAY = "replay"
    HYBRID = "hybrid"


class Recording(BaseModel):
    """RECORDING table — architecture.md §8."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    s3_uri: str
    duration_s: int
    created_at: datetime


class SynthesisRun(BaseModel):
    """SYNTHESIS_RUN table — the three Gemini traces + intent abstraction."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recording_id: UUID
    status: SynthesisStatus = SynthesisStatus.QUEUED
    gemini_lite_trace: str | None = None
    gemini_pro_trace: str | None = None
    gemini_flash_trace: str | None = None
    intent_abstraction: dict[str, Any] | None = None
    completed_at: datetime | None = None


class DreamQuery(BaseModel):
    """DREAM_QUERIES table — one row per Cosmo Dream Query invocation."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    synthesis_run_id: UUID
    desired_operation: str
    sdl_delta: str
    validation_report: str
    subgraph_id: str


class Agent(BaseModel):
    """AGENT table — the emitted, signed, deployed agent."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    image_digest: str
    cosign_sig: str
    graphql_endpoint: str
    ams_namespace: str


class AgentMemory(BaseModel):
    """AGENT_MEMORIES table — Redis-backed memory rows surfaced in Postgres for queryability."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    agent_id: UUID
    ams_key: str
    memory_type: str
    topics: list[str] = Field(default_factory=list)
    entities: dict[str, Any] = Field(default_factory=dict)
    embedding: list[float] | None = None


class TinyFishSkillUsed(BaseModel):
    """TINYFISH_SKILLS_USED table — pinned skill versions per agent."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    agent_id: UUID
    skill_name: str
    skill_version: str
    invocation_count: int = 0


class SlsaAttestation(BaseModel):
    """SLSA_ATTESTATION table — one row per signed image (architecture.md §6)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    predicate_type: str
    builder_id: str
    materials: dict[str, Any]


class Sbom(BaseModel):
    """SBOM table — build-time component list."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    format: str
    generation_time: datetime
    components: list[dict[str, Any]]


class Image(BaseModel):
    """IMAGE table — keyed by OCI digest (architecture.md §8)."""

    model_config = ConfigDict(from_attributes=True)

    digest: str
    registry: str
    built_at: datetime


class AgentRun(BaseModel):
    """AGENT_RUNS table — one row per agent invocation."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    agent_id: UUID
    started_at: datetime
    ended_at: datetime | None = None
    status: str
    result: dict[str, Any] | None = None


class SynthesizeAccepted(BaseModel):
    """POST /synthesize 202 response."""

    synthesis_run_id: UUID
    status: SynthesisStatus = SynthesisStatus.QUEUED


class TraceEvent(BaseModel):
    """One entry from the `run:synth:{id}` Redis stream (architecture.md §9)."""

    ts: datetime
    stage: str
    message: str
    data: dict[str, Any] | None = None


class SynthesisRunDetail(BaseModel):
    """GET /synthesis/{id} response — status + full trace."""

    run: SynthesisRun
    trace: list[TraceEvent]


class ServiceProbe(BaseModel):
    """One sponsor-service probe result surfaced on /healthz."""

    name: str
    status: str
    detail: str | None = None


class HealthResponse(BaseModel):
    """GET /healthz response."""

    status: str
    demo_mode: DemoMode
    services: list[ServiceProbe]


class ReplayResponse(BaseModel):
    """POST /demo/replay/{synth_id} response — replayed cached response."""

    synthesis_run_id: UUID
    served_from: str
    payload: dict[str, Any]


class AgentProtocols(BaseModel):
    """GET /agents/{agent_id}/protocols response — multi-protocol surface.

    Backed by `us:agent:{agent_id}:protocols` hash (field `endpoints`) written
    by apps/synthesis-worker/cosmo_writer.py after Trusted Documents are pushed
    and the ConnectRPC service proto is generated. Keys: `graphql` (router :4000),
    plus `grpc` / `rest` / `connect` — the latter three are the same ConnectRPC
    base URL on :5026, with the protocol selected by Content-Type header.
    """

    agent_id: str
    endpoints: dict[str, str]


class FullAttestation(BaseModel):
    """GET /agents/{id}/attestation — bundle the Supply Chain page renders from.

    Shape matches `FullAttestation` in apps/web/src/components/CosignReceipt.tsx. Rekor +
    Fulcio cert fields are first-class so the UI doesn't have to derive them from the
    workflow-identity convention (governance reviewers check these on stage).
    """

    agent: Agent
    image: Image
    slsa: SlsaAttestation
    sbom: Sbom
    rekor_log_index: int
    rekor_url: str
    rekor_uuid: str
    rekor_integrated_time: datetime
    certificate_identity: str
    certificate_oidc_issuer: str
    subject_alt_name: str
    cert_not_before: datetime
    cert_not_after: datetime
