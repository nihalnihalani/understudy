"""Persist signed-agent supply-chain artifacts to InsForge Postgres.

The synthesis pipeline is the primary source of truth — DB persistence is
secondary. When `INSFORGE_URL` + `INSFORGE_API_KEY` are unset (e.g. during
hermetic tests, `STORE_BACKEND=memory`, or local dev without creds), the
writer NO-OPs gracefully and returns None.

INSERT order respects the FK graph from
`migrations/20260424214016_initial-schema.sql`:

    image (PK=digest)
      ├── slsa_attestation (FK image_digest)
      ├── sbom             (FK image_digest)
      └── agent            (FK image_digest, UNIQUE ams_namespace)

The PostgREST endpoint shape (mirroring `apps/api/store.py:InsforgeStore`):
    POST {INSFORGE_URL}/api/database/records/{table}    # body: [row]
with headers `Authorization: Bearer {INSFORGE_API_KEY}` +
`Content-Type: application/json`.

`image` INSERTs are idempotent — a 409 Conflict on duplicate digest is a
no-op (multiple agents can share a base image).
"""

from __future__ import annotations

import logging
import os
from typing import Any
from uuid import UUID, uuid4, uuid5

import httpx

log = logging.getLogger(__name__)


# Stable namespace for deterministic row-ids (uuid5 over image_digest). Using
# the linked InsForge project_id so namespaces can't collide across projects.
# Worker-retries hit 409 on PK instead of duplicating slsa/sbom rows.
_IDEMPOTENCY_NAMESPACE = UUID("c9a1c154-e16a-480b-b105-1b8c9212823c")


class InsforgeWriter:
    """httpx-backed writer for signed-agent supply-chain rows.

    Mirrors the env-var gating + httpx pattern in
    `apps/api/store.py:InsforgeStore` so the worker degrades gracefully when
    creds aren't present.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout_s: float = 5.0,
    ) -> None:
        self._base = (base_url or os.getenv("INSFORGE_URL") or "").rstrip("/")
        self._api_key = api_key or os.getenv("INSFORGE_API_KEY") or ""
        self._timeout_s = timeout_s
        self._client: httpx.Client | None = None
        if self.enabled:
            self._client = httpx.Client(
                base_url=self._base,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                timeout=timeout_s,
            )

    # ---- lifecycle ---------------------------------------------------------

    @property
    def enabled(self) -> bool:
        """True when both INSFORGE_URL and INSFORGE_API_KEY are set."""
        return bool(self._base) and bool(self._api_key)

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    # ---- public API --------------------------------------------------------

    def persist_agent_artifacts(
        self,
        *,
        image_digest: str,
        registry: str,
        builder_id: str,
        materials: dict[str, Any],
        sbom_components: list[dict[str, Any]],
        cosign_sig: str,
        graphql_endpoint: str,
        ams_namespace: str,
        predicate_type: str = "https://slsa.dev/provenance/v1",
        sbom_format: str = "spdx-json",
    ) -> UUID | None:
        """INSERT image → slsa_attestation + sbom → agent. Return new agent UUID.

        On any unexpected INSERT failure, log and return None. The synthesis
        pipeline is authoritative — secondary persistence must not break the
        primary path. NO-OPs (returns None) when creds are unset.
        """
        if not self.enabled or self._client is None:
            log.info(
                "insforge_writer disabled (INSFORGE_URL=%r, INSFORGE_API_KEY=%r); skipping",
                bool(self._base),
                bool(self._api_key),
            )
            return None

        # 1. image (idempotent on PK=digest; 409 = already exists, fine)
        if not self._insert_image(image_digest=image_digest, registry=registry):
            return None

        # 2. slsa_attestation + sbom (both FK on image.digest)
        if not self._insert_slsa(
            image_digest=image_digest,
            predicate_type=predicate_type,
            builder_id=builder_id,
            materials=materials,
        ):
            return None

        if not self._insert_sbom(
            image_digest=image_digest,
            sbom_format=sbom_format,
            components=sbom_components,
        ):
            return None

        # 3. agent (FK on image.digest, UNIQUE on ams_namespace)
        agent_id = uuid4()
        if not self._insert_agent(
            agent_id=agent_id,
            image_digest=image_digest,
            cosign_sig=cosign_sig,
            graphql_endpoint=graphql_endpoint,
            ams_namespace=ams_namespace,
        ):
            return None

        log.info(
            "persisted agent artifacts: agent_id=%s image_digest=%s ams_namespace=%s",
            agent_id,
            image_digest,
            ams_namespace,
        )
        return agent_id

    # ---- internals ---------------------------------------------------------

    def _post(self, table: str, row: dict[str, Any]) -> httpx.Response | None:
        assert self._client is not None  # gated by .enabled
        path = f"/api/database/records/{table}"
        try:
            return self._client.post(path, json=[row])
        except httpx.HTTPError as exc:
            log.warning("insforge POST %s failed: %s", table, exc)
            return None

    def _insert_image(self, *, image_digest: str, registry: str) -> bool:
        """Idempotent insert; 409 on duplicate PK is treated as success."""
        resp = self._post("image", {"digest": image_digest, "registry": registry})
        if resp is None:
            return False
        if resp.status_code in (200, 201):
            return True
        if resp.status_code == 409:
            log.info("image %s already exists (409); continuing", image_digest)
            return True
        log.warning(
            "image insert failed %s: %s", resp.status_code, resp.text[:200]
        )
        return False

    def _insert_slsa(
        self,
        *,
        image_digest: str,
        predicate_type: str,
        builder_id: str,
        materials: dict[str, Any],
    ) -> bool:
        # Deterministic ID per (image_digest, "slsa") so Redis Streams redelivery
        # (XADD → retry on crash, before xack at main.py:191) doesn't create a
        # duplicate slsa row per image. Second attempt hits 409 on PK, fine.
        row_id = uuid5(_IDEMPOTENCY_NAMESPACE, f"slsa:{image_digest}")
        resp = self._post(
            "slsa_attestation",
            {
                "id": str(row_id),
                "image_digest": image_digest,
                "predicate_type": predicate_type,
                "builder_id": builder_id,
                "materials": materials,
            },
        )
        if resp is None:
            return False
        if resp.status_code in (200, 201):
            return True
        if resp.status_code == 409:
            log.info("slsa_attestation %s already exists (409); continuing", row_id)
            return True
        log.warning(
            "slsa_attestation insert failed %s: %s",
            resp.status_code,
            resp.text[:200],
        )
        return False

    def _insert_sbom(
        self,
        *,
        image_digest: str,
        sbom_format: str,
        components: list[dict[str, Any]],
    ) -> bool:
        row_id = uuid5(_IDEMPOTENCY_NAMESPACE, f"sbom:{image_digest}")
        resp = self._post(
            "sbom",
            {
                "id": str(row_id),
                "image_digest": image_digest,
                "format": sbom_format,
                "components": components,
            },
        )
        if resp is None:
            return False
        if resp.status_code in (200, 201):
            return True
        if resp.status_code == 409:
            log.info("sbom %s already exists (409); continuing", row_id)
            return True
        log.warning(
            "sbom insert failed %s: %s", resp.status_code, resp.text[:200]
        )
        return False

    def _insert_agent(
        self,
        *,
        agent_id: UUID,
        image_digest: str,
        cosign_sig: str,
        graphql_endpoint: str,
        ams_namespace: str,
    ) -> bool:
        resp = self._post(
            "agent",
            {
                "id": str(agent_id),
                "image_digest": image_digest,
                "cosign_sig": cosign_sig,
                "graphql_endpoint": graphql_endpoint,
                "ams_namespace": ams_namespace,
            },
        )
        if resp is None:
            return False
        if resp.status_code in (200, 201):
            return True
        log.warning(
            "agent insert failed %s: %s", resp.status_code, resp.text[:200]
        )
        return False
