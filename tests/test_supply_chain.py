"""Supply-chain attestation tests (architecture.md §6).

The build → sign → verify path is expensive to reproduce in CI; we split it in two:

  1. Offline: validate the SLSA v1 predicate JSON that the API's
     `Store.get_attestation` / `build_attestation` emits against the
     in-toto SLSA v1 schema (`jsonschema` lib). This is fast and hermetic.
  2. Online (skipped by default): build the wolfi image, sign with a local
     ephemeral cosign key, and verify. Requires `cosign` + `docker` on PATH.

The in-toto Statement schema the predicate is embedded in is inlined here to
avoid a network fetch during tests. It matches the in-toto spec v1.0 + SLSA v1
predicate fragment we ship in `apps/api/store.py`.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")


# In-toto Statement v1 wrapping a slsa.dev/provenance/v1 predicate. Simplified
# to the shape our `build_attestation` fills in (subject + predicate payload).
SLSA_STATEMENT_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["_type", "subject", "predicateType", "predicate"],
    "properties": {
        "_type": {"const": "https://in-toto.io/Statement/v1"},
        "subject": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["name", "digest"],
                "properties": {
                    "name": {"type": "string"},
                    "digest": {
                        "type": "object",
                        "patternProperties": {"^[a-z0-9]+$": {"type": "string"}},
                    },
                },
            },
        },
        "predicateType": {"const": "https://slsa.dev/provenance/v1"},
        "predicate": {
            "type": "object",
            "required": ["buildDefinition", "runDetails"],
            "properties": {
                "buildDefinition": {
                    "type": "object",
                    "required": ["buildType", "externalParameters"],
                    "properties": {
                        "buildType": {"type": "string"},
                        "externalParameters": {"type": "object"},
                    },
                },
                "runDetails": {
                    "type": "object",
                    "required": ["builder"],
                    "properties": {
                        "builder": {
                            "type": "object",
                            "required": ["id"],
                            "properties": {"id": {"type": "string"}},
                        },
                    },
                },
            },
        },
    },
}


def _statement_from_agent_attestation() -> dict:
    """Mint a Statement v1 + SLSA predicate from the Store fixture.

    The fixture stores the predicate in a simplified shape (predicate_type,
    builder_id, materials) — this projection reconstructs the spec-compliant
    Statement wrapper around it so jsonschema can validate.
    """
    from apps.api.store import Store

    store = Store()
    agent = next(iter(store.agents.values()))
    att = store.get_attestation(agent.id)
    assert att is not None

    return {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": [
            {
                "name": att.image.registry,
                "digest": {"sha256": att.image.digest.removeprefix("sha256:")},
            }
        ],
        "predicateType": att.slsa.predicate_type,
        "predicate": {
            "buildDefinition": {
                "buildType": att.slsa.materials.get(
                    "build_type", "https://slsa.dev/container-based-build/v0.1"
                ),
                "externalParameters": {
                    k: v for k, v in att.slsa.materials.items() if k != "build_type"
                },
            },
            "runDetails": {
                "builder": {"id": att.slsa.builder_id},
                "metadata": {"invocationId": str(agent.id)},
            },
        },
    }


def test_slsa_predicate_validates_against_in_toto_schema() -> None:
    """The fixture attestation must be a well-formed SLSA v1 Statement."""
    stmt = _statement_from_agent_attestation()
    jsonschema.validate(stmt, SLSA_STATEMENT_SCHEMA)

    # Spot-check load-bearing fields the UI (CosignReceipt.tsx) reads.
    assert stmt["predicateType"] == "https://slsa.dev/provenance/v1"
    assert stmt["predicate"]["runDetails"]["builder"]["id"].startswith(
        "https://github.com/"
    )
    assert stmt["predicate"]["buildDefinition"]["externalParameters"]["base_image"].startswith(
        "cgr.dev/chainguard/"
    )


def test_attestation_bundle_has_rekor_and_fulcio_fields() -> None:
    """Governance reviewers live-read these values on stage (§6)."""
    from apps.api.store import Store

    store = Store()
    agent = next(iter(store.agents.values()))
    att = store.get_attestation(agent.id)
    assert att is not None

    assert att.rekor_log_index > 0
    assert att.rekor_url.startswith("https://search.sigstore.dev")
    assert len(att.rekor_uuid) == 64  # sha256 hex
    assert att.certificate_oidc_issuer == "https://token.actions.githubusercontent.com"
    assert att.certificate_identity.startswith("https://github.com/")
    assert att.cert_not_after > att.cert_not_before


@pytest.mark.skipif(
    not (shutil.which("cosign") and shutil.which("docker")),
    reason="cosign or docker not on PATH — supply-chain online test skipped",
)
def test_cosign_sign_and_verify_local_image(tmp_path: Path) -> None:
    """Build Dockerfile.wolfi, generate ephemeral key, sign, verify.

    Skipped unless both cosign and docker are installed. This is intentionally
    light-weight — we do NOT push to a registry; the signed-image artifact
    lives only in the local daemon and on disk.
    """
    repo = Path(__file__).resolve().parents[1]
    dockerfile = repo / "infra" / "chainguard" / "Dockerfile.wolfi"
    assert dockerfile.exists()

    tag = "understudy-test:ci"
    subprocess.run(
        ["docker", "build", "-f", str(dockerfile), "-t", tag, str(repo)],
        check=True,
    )

    key_prefix = tmp_path / "cosign"
    env = {"COSIGN_PASSWORD": ""}
    subprocess.run(
        ["cosign", "generate-key-pair", f"--output-key-prefix={key_prefix}"],
        check=True,
        env={**__import__("os").environ, **env},
    )
    subprocess.run(
        ["cosign", "sign", "--key", f"{key_prefix}.key", "--yes", tag],
        check=True,
        env={**__import__("os").environ, **env},
    )
    subprocess.run(
        ["cosign", "verify", "--key", f"{key_prefix}.pub", tag],
        check=True,
    )
