"""Guardrails on .github/workflows/release.yml (architecture.md §6).

We don't execute the workflow; we parse it and assert:

  1. The cosign slsaprovenance attestation does NOT reuse `sbom.spdx.json` as
     its predicate. Doing so fails `cosign verify-attestation --type
     slsaprovenance` at agent boot per §13's preboot gate.
  2. There is exactly one SBOM attestation and exactly one SLSA provenance
     attestation. The types must be disjoint.
  3. The SBOM predicate file is `sbom.spdx.json` (matches the Syft step).
  4. The SLSA provenance predicate is pulled from the slsa-github-generator
     artifact (not the SBOM).
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


def test_release_yml_parses() -> None:
    wf = _load()
    assert "jobs" in wf


def test_two_attest_steps_with_distinct_types() -> None:
    steps = _attest_steps(_load())
    assert len(steps) == 2, f"expected 2 cosign attest steps, got {len(steps)}"
    types = set()
    for step in steps:
        m = re.search(r"--type\s+(\S+)", step["run"])
        assert m, f"cosign attest step missing --type: {step['name']}"
        types.add(m.group(1))
    assert types == {"spdxjson", "slsaprovenance"}, (
        f"attest types must be disjoint SBOM + SLSA; got {types}"
    )


def test_slsa_attestation_does_not_reuse_sbom_predicate() -> None:
    """The real defect caught by the verifier: slsaprovenance --predicate sbom.spdx.json."""
    for step in _attest_steps(_load()):
        if "--type slsaprovenance" in step["run"]:
            assert "sbom.spdx.json" not in step["run"], (
                "slsaprovenance attestation must not use the SBOM as its predicate — "
                "that fails `cosign verify-attestation --type slsaprovenance` at "
                "agent boot (architecture.md §13 preboot gate). The predicate must "
                "come from the slsa-github-generator job's intoto.jsonl artifact."
            )


def test_sbom_attestation_uses_spdx_file() -> None:
    for step in _attest_steps(_load()):
        if "--type spdxjson" in step["run"]:
            assert "sbom.spdx.json" in step["run"]


def test_slsa_provenance_predicate_is_downloaded_artifact() -> None:
    """The provenance predicate must be pulled from the slsa-github-generator artifact."""
    wf = _load()
    download_steps = []
    for job in wf.get("jobs", {}).values():
        for step in job.get("steps", []) or []:
            uses = (step.get("uses") or "").lower()
            name = (step.get("name") or "").lower()
            if "download-artifact" in uses and ("slsa" in name or "provenance" in name):
                download_steps.append(step)
    assert download_steps, (
        "expected a download-artifact step to pull the SLSA provenance predicate"
    )
    # The cosign attest step for slsaprovenance must reference *.intoto.jsonl.
    for step in _attest_steps(wf):
        if "--type slsaprovenance" in step["run"]:
            assert "intoto.jsonl" in step["run"], (
                "slsaprovenance --predicate must be a *.intoto.jsonl from slsa-github-generator"
            )
