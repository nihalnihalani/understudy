"""Store implementations for the API layer.

Two backends with the same five-method interface (create_run, get_run, list_agents,
get_agent, get_attestation):

  - Store: the original in-memory fixture store. Tests use this directly so
    they don't need network access. Behavior is unchanged for backward compat.
  - InsforgeStore: httpx-backed, talks to InsForge PostgREST at
    `{INSFORGE_URL}/api/database/records/{table}`. Used in production when
    INSFORGE_URL + INSFORGE_API_KEY are set (architecture.md §8).

`get_store()` picks InsforgeStore when both env vars are set AND the caller
hasn't forced `STORE_BACKEND=memory`; otherwise falls back to in-memory Store.

The InsforgeStore falls back to fixture data when tables are empty — lets the
frontend / demo run even before CI has populated `image` / `slsa_attestation` /
`sbom` rows. That fallback is hackathon ergonomics, not production behavior.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import httpx

from .schemas import (
    Agent,
    FullAttestation,
    Image,
    Sbom,
    SlsaAttestation,
    SynthesisRun,
    SynthesisStatus,
)

log = logging.getLogger(__name__)

# Mirrors apps/synthesis-worker/gemini_client.py — invariant #2 hermetic demo mode
# (architecture.md §14). When DEMO_MODE=replay, InsForge writes are short-circuited
# so the demo path never makes outbound httpx calls.
DEMO_MODE = os.environ.get("DEMO_MODE", "live").lower()


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


# ───── Backend 1: in-memory (unchanged) ──────────────────────────────────────

class Store:
    """In-memory fixtures + run registry. Thread-safety not required — uvicorn single proc."""

    def __init__(self) -> None:
        self.agents: dict[UUID, Agent] = seed_agents()
        self.runs: dict[UUID, SynthesisRun] = {}

    def create_run(
        self,
        recording_id: UUID,
        *,
        s3_uri: str | None = None,
        duration_s: int | None = None,
    ) -> SynthesisRun:
        # s3_uri and duration_s are ignored by the in-memory backend; they
        # exist in the signature so main.py can pass them uniformly to either
        # backend (InsforgeStore needs them for the FK-referenced recording row).
        _ = (s3_uri, duration_s)
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


# ───── Backend 2: InsForge PostgREST ─────────────────────────────────────────

class InsforgeStore:
    """httpx-backed store that talks to InsForge PostgREST.

    Endpoint shape (verified by probe against the live linked project):
      GET  {base}/api/database/records/{table}?<filter>=eq.<val>    → list of rows
      POST {base}/api/database/records/{table}                      → 201, inserts rows
    Filter syntax is PostgREST (`id=eq.<uuid>`).

    On empty-table reads, falls back to seed_agents() so the frontend / demo
    path still renders. Read errors also degrade to fixtures; write errors
    raise (a broken INSERT must be surfaced, not silently swallowed).
    """

    def __init__(self, *, base_url: str, api_key: str, timeout_s: float = 5.0) -> None:
        self._base = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout_s,
        )
        # Fallback fixtures when tables are empty (hackathon ergonomics).
        self._fixture_agents = seed_agents()

    def __del__(self) -> None:
        client = getattr(self, "_client", None)
        if client is not None:
            client.close()

    # ---- write path ----

    def create_run(
        self,
        recording_id: UUID,
        *,
        s3_uri: str | None = None,
        duration_s: int | None = None,
    ) -> SynthesisRun:
        # Hermetic demo mode (invariant #2): never hit InsForge in replay. Return
        # a synthetic SynthesisRun keyed by the caller's recording_id so the
        # SSE/UI flow continues to work without outbound IO.
        if DEMO_MODE == "replay":
            log.info("DEMO_MODE=replay: skipping InsForge create_run write")
            return SynthesisRun(
                id=uuid4(),
                recording_id=recording_id,
                status=SynthesisStatus.QUEUED,
            )

        # recording FK must exist before synthesis_run points at it.
        rec_payload = {
            "id": str(recording_id),
            "s3_uri": s3_uri or f"pending://{recording_id}",
            "duration_s": duration_s or 60,
        }
        rec_resp = self._client.post("/api/database/records/recording", json=[rec_payload])
        if rec_resp.status_code not in (200, 201, 409):  # 409 = already exists, idempotent
            log.warning("recording insert failed %s: %s", rec_resp.status_code, rec_resp.text[:200])

        run_id = uuid4()
        run_payload = {
            "id": str(run_id),
            "recording_id": str(recording_id),
            "status": SynthesisStatus.QUEUED.value,
        }
        run_resp = self._client.post("/api/database/records/synthesis_run", json=[run_payload])
        if run_resp.status_code not in (200, 201):
            raise RuntimeError(
                f"synthesis_run insert failed {run_resp.status_code}: {run_resp.text[:200]}"
            )

        return SynthesisRun(
            id=run_id,
            recording_id=recording_id,
            status=SynthesisStatus.QUEUED,
        )

    # ---- read path ----

    def get_run(self, run_id: UUID) -> SynthesisRun | None:
        rows = self._select("synthesis_run", f"id=eq.{run_id}")
        if not rows:
            return None
        row = rows[0]
        return SynthesisRun(
            id=UUID(row["id"]),
            recording_id=UUID(row["recording_id"]),
            status=SynthesisStatus(row.get("status") or "queued"),
            gemini_lite_trace=row.get("gemini_lite_trace"),
            gemini_pro_trace=row.get("gemini_pro_trace"),
            gemini_flash_trace=row.get("gemini_flash_trace"),
            intent_abstraction=row.get("intent_abstraction"),
            completed_at=_parse_ts(row.get("completed_at")),
        )

    def list_agents(self) -> list[Agent]:
        rows = self._select("agent")
        if not rows:
            return list(self._fixture_agents.values())
        return [_row_to_agent(row) for row in rows]

    def get_agent(self, agent_id: UUID) -> Agent | None:
        rows = self._select("agent", f"id=eq.{agent_id}")
        if rows:
            return _row_to_agent(rows[0])
        return self._fixture_agents.get(agent_id)

    def get_attestation(self, agent_id: UUID) -> FullAttestation | None:
        agent = self.get_agent(agent_id)
        if agent is None:
            return None
        # The `image` / `slsa_attestation` / `sbom` rows are populated by the
        # release CI pipeline. Until that lands, derive a deterministic fixture
        # bundle from the agent's image_digest so the Supply Chain page renders.
        # If those rows DO exist, merge them over the fixture.
        bundle = build_attestation(agent)
        try:
            img = self._select("image", f"digest=eq.{agent.image_digest}")
            slsa = self._select("slsa_attestation", f"image_digest=eq.{agent.image_digest}")
            sbom = self._select("sbom", f"image_digest=eq.{agent.image_digest}")
        except Exception as exc:
            log.warning("attestation enrichment query failed: %s", exc)
            return bundle

        if img:
            bundle.image = Image(
                digest=img[0]["digest"],
                registry=img[0].get("registry", bundle.image.registry),
                built_at=_parse_ts(img[0].get("built_at")) or bundle.image.built_at,
            )
        if slsa:
            bundle.slsa = SlsaAttestation(
                predicate_type=slsa[0].get("predicate_type", bundle.slsa.predicate_type),
                builder_id=slsa[0].get("builder_id", bundle.slsa.builder_id),
                materials=slsa[0].get("materials") or bundle.slsa.materials,
            )
        if sbom:
            bundle.sbom = Sbom(
                format=sbom[0].get("format", bundle.sbom.format),
                generation_time=_parse_ts(sbom[0].get("generation_time"))
                or bundle.sbom.generation_time,
                components=sbom[0].get("components") or bundle.sbom.components,
            )
        return bundle

    # ---- internals ----

    def _select(self, table: str, filter_expr: str | None = None) -> list[dict[str, Any]]:
        """GET /api/database/records/<table>[?<filter>]; returns [] on any HTTP error."""
        path = f"/api/database/records/{table}"
        if filter_expr:
            path = f"{path}?{filter_expr}"
        try:
            r = self._client.get(path)
        except httpx.HTTPError as exc:
            log.warning("select %s %s failed: %s", table, filter_expr, exc)
            return []
        if r.status_code != 200:
            log.warning("select %s returned %d: %s", table, r.status_code, r.text[:200])
            return []
        body = r.json()
        return body if isinstance(body, list) else []


def _parse_ts(raw: Any) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _row_to_agent(row: dict[str, Any]) -> Agent:
    return Agent(
        id=UUID(row["id"]),
        image_digest=row["image_digest"],
        cosign_sig=row["cosign_sig"],
        graphql_endpoint=row["graphql_endpoint"],
        ams_namespace=row["ams_namespace"],
    )


# ───── Singleton factory ─────────────────────────────────────────────────────

_store: Store | InsforgeStore | None = None


def get_store() -> Store | InsforgeStore:
    """Return the singleton store.

    Picks InsforgeStore when INSFORGE_URL + INSFORGE_API_KEY are both set and
    STORE_BACKEND != "memory"; otherwise returns the in-memory Store.
    """
    global _store
    if _store is not None:
        return _store

    url = os.getenv("INSFORGE_URL")
    api_key = os.getenv("INSFORGE_API_KEY")
    forced_memory = os.getenv("STORE_BACKEND", "").lower() == "memory"
    if url and api_key and not forced_memory:
        log.info("store: InsforgeStore (base=%s)", url)
        _store = InsforgeStore(base_url=url, api_key=api_key)
    else:
        log.info("store: in-memory Store (url=%r api_key=%r forced_memory=%s)",
                 bool(url), bool(api_key), forced_memory)
        _store = Store()
    return _store


def _now() -> datetime:
    return datetime.now(timezone.utc)
