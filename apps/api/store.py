"""In-memory fixture store for the API layer.

Real persistence is InsForge 2.0 PostgREST (architecture.md §8). Until the backend
wire-up lands (part of task #5), the API layer serves a small in-memory fixture set so
`GET /agents`, `GET /agents/{id}`, `GET /agents/{id}/attestation`, and
`GET /synthesis/{id}` have something to return for the frontend and tests.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from .schemas import (
    Agent,
    FullAttestation,
    Image,
    Sbom,
    SlsaAttestation,
    SynthesisRun,
    SynthesisStatus,
)


_AGENT_1_ID = UUID("11111111-1111-1111-1111-111111111111")
_AGENT_2_ID = UUID("22222222-2222-2222-2222-222222222222")

_REKOR_BASE = "https://search.sigstore.dev"
_REKOR_API_BASE = "https://rekor.sigstore.dev/api/v1/log/entries"
_BUILDER_ID = (
    "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main"
)
_CERT_OIDC_ISSUER = "https://token.actions.githubusercontent.com"
# Fulcio keyless certs are short-lived (10 min). Matches the cosign verify --certificate-oidc-issuer
# convention documented in README.md quickstart step 5.
_CERT_LIFETIME = timedelta(minutes=10)


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


def build_attestation(agent: Agent) -> FullAttestation:
    """Assemble the supply-chain bundle the frontend's CosignReceipt renders (§6).

    Rekor + Fulcio fields are what `cosign verify` / `cosign verify-attestation
    --type slsaprovenance` print out. Real values populate these at sign-time in CI;
    the fixture derives deterministic-but-plausible values from `image_digest` so
    repeated renders stay stable.
    """
    built_at = datetime(2026, 4, 22, 12, 0, 0, tzinfo=timezone.utc)
    seed = hashlib.sha256(agent.image_digest.encode()).hexdigest()
    rekor_log_index = 9_000_000 + (int(seed[:8], 16) % 1_000_000)
    rekor_uuid = seed  # Rekor entry UUIDs are sha256 hex — 64 chars.
    cert_not_before = built_at
    cert_not_after = built_at + _CERT_LIFETIME
    return FullAttestation(
        agent=agent,
        image=Image(
            digest=agent.image_digest,
            registry="ghcr.io/nihalnihalani/understudy-agent-base",
            built_at=built_at,
        ),
        slsa=SlsaAttestation(
            predicate_type="https://slsa.dev/provenance/v1",
            builder_id=_BUILDER_ID,
            materials={
                "source": {"uri": "git+https://github.com/nihalnihalani/understudy"},
                "base_image": "cgr.dev/chainguard/wolfi-base",
                "build_type": "https://slsa.dev/container-based-build/v0.1",
            },
        ),
        sbom=Sbom(
            format="spdx-json",
            generation_time=built_at,
            components=[
                {"name": "chromium", "version": "124.0.6367.60", "type": "executable"},
                {"name": "node", "version": "22.2.0", "type": "runtime"},
                {"name": "@tinyfish/cli", "version": "2.3.0", "type": "npm"},
            ],
        ),
        rekor_log_index=rekor_log_index,
        rekor_url=f"{_REKOR_BASE}?logIndex={rekor_log_index}",
        rekor_uuid=rekor_uuid,
        rekor_integrated_time=built_at,
        certificate_identity=_BUILDER_ID,
        certificate_oidc_issuer=_CERT_OIDC_ISSUER,
        subject_alt_name=f"URI:{_BUILDER_ID}",
        cert_not_before=cert_not_before,
        cert_not_after=cert_not_after,
    )


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

    def get_attestation(self, agent_id: UUID) -> FullAttestation | None:
        agent = self.agents.get(agent_id)
        if agent is None:
            return None
        return build_attestation(agent)


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store


def _now() -> datetime:
    return datetime.now(timezone.utc)
