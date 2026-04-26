"""Guardrails on .github/workflows/release.yml (architecture.md §6).

We don't execute the workflow; we parse it and assert:

  1. The cosign attest step uses sbom.spdx.json (Syft output) — never the
     SLSA provenance predicate as a placeholder.
  2. The SBOM attestation uses --type spdxjson.
  3. The SLSA L2 provenance attestation is provided by the
     slsa-github-generator reusable workflow (it attaches the attestation
     directly to the registry under the slsa-github-generator OIDC identity
     — verified post-build via `cosign tree`). The caller workflow does
     NOT need its own manual `cosign attest --type slsaprovenance` step,
     and previously had one that broke when v2.0.0 stopped uploading the
     `*.intoto.jsonl` artifact.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

RELEASE_YML = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "release.yml"


def _load() -> dict:
    return yaml.safe_load(RELEASE_YML.read_text())


def _attest_steps(workflow: dict) -> list[dict]:
    steps: list[dict] = []
    for job in workflow.get("jobs", {}).values():
        for step in job.get("steps", []) or []:
            run = step.get("run", "") or ""
            if "cosign attest" in run:
                steps.append(step)
    return steps


def _slsa_generator_call(workflow: dict) -> dict | None:
    """Return the job that calls slsa-framework/slsa-github-generator, if any."""
    for job in workflow.get("jobs", {}).values():
        uses = (job.get("uses") or "").lower()
        if "slsa-framework/slsa-github-generator" in uses:
            return job
    return None


def test_release_yml_parses() -> None:
    wf = _load()
    assert "jobs" in wf


def test_sbom_attestation_step_exists_with_spdxjson_type() -> None:
    """Exactly one manual `cosign attest` step, attaching the SBOM."""
    steps = _attest_steps(_load())
    assert len(steps) == 1, (
        f"expected exactly 1 cosign attest step (SBOM only — SLSA is auto-attached "
        f"by slsa-github-generator); got {len(steps)}"
    )
    types = set()
    for step in steps:
        m = re.search(r"--type\s+(\S+)", step["run"])
        assert m, f"cosign attest step missing --type: {step['name']}"
        types.add(m.group(1))
    assert types == {"spdxjson"}, (
        f"the manual attest must be SBOM only (--type spdxjson); got {types}"
    )


def test_sbom_attestation_uses_spdx_file() -> None:
    """The SBOM attestation must reference sbom.spdx.json (the Syft output)."""
    for step in _attest_steps(_load()):
        if "--type spdxjson" in step["run"]:
            assert "sbom.spdx.json" in step["run"]


def test_slsa_attestation_uses_generator_workflow() -> None:
    """SLSA L2 provenance attestation comes from slsa-github-generator's
    reusable workflow — that's the canonical Sigstore pattern (the actual
    builder signs). cosign tree shows the attestation attached to the
    registry under the generator's OIDC identity.
    """
    wf = _load()
    slsa_job = _slsa_generator_call(wf)
    assert slsa_job is not None, (
        "release.yml must call slsa-framework/slsa-github-generator/"
        "...generator_container_slsa3.yml — that's how the SLSA L2 provenance "
        "attestation gets attached to the image (architecture.md §6)."
    )
    uses = slsa_job["uses"]
    assert "v2.0.0" in uses or "v2.1" in uses, (
        f"pin slsa-github-generator to a versioned tag, got: {uses}"
    )


def test_no_manual_slsa_attest_step() -> None:
    """The previous workflow had a manual `cosign attest --type slsaprovenance`
    step that downloaded a `*.intoto.jsonl` artifact from
    slsa-github-generator. v2.0.0 of the generator no longer uploads that
    artifact, so the step always failed. The SLSA attestation is attached
    automatically by the generator job — no manual attest needed.
    """
    for step in _attest_steps(_load()):
        assert "slsaprovenance" not in step["run"], (
            f"manual `cosign attest --type slsaprovenance` is redundant — "
            f"slsa-github-generator already attaches the attestation. "
            f"Step: {step.get('name')}"
        )
