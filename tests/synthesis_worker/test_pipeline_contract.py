"""Pipeline stage signatures + model-ID wiring conformance (architecture.md §10).

These are the invariants the tester-debugger depends on:
  1. The three stage functions exist with the documented shape.
  2. They pull model IDs + thinking levels from understudy.models (no hardcoding).
  3. Verbatim §10 prompt strings + JSON schemas ship in-module.
"""

from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest

pytest.importorskip("cv2")

from understudy.models import (  # noqa: E402
    GEMINI_ACTION_DETECTION,
    GEMINI_INTENT_ABSTRACTION,
    GEMINI_SCRIPT_EMISSION,
    THINKING_LEVEL_ACTION_DETECTION,
    THINKING_LEVEL_INTENT_ABSTRACTION,
    THINKING_LEVEL_SCRIPT_EMISSION,
)

import gemini_client  # noqa: E402
import pipeline  # noqa: E402
import prompts  # noqa: E402

FIX = Path(__file__).resolve().parents[2] / "fixtures" / "synthesis"


class _FakeRedis:
    """Minimal async stub matching the surface `pipeline.run_pipeline` reaches for."""

    def __init__(self, seed: dict[str, str]) -> None:
        self._data = seed

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    def pipeline(self) -> "_FakeRedis":  # noqa: D401 — mirrors aioredis.pipeline()
        return self

    def delete(self, *_keys: str) -> None:  # no-op for tests
        return None

    def rpush(self, *_args: object, **_kwargs: object) -> None:  # no-op for tests
        return None

    async def execute(self) -> list[object]:
        return []


def test_three_stage_functions_exist() -> None:
    assert inspect.iscoroutinefunction(pipeline.detect_actions)
    assert inspect.iscoroutinefunction(pipeline.abstract_intent)
    assert inspect.iscoroutinefunction(pipeline.emit_script)


def test_detect_actions_signature() -> None:
    sig = inspect.signature(pipeline.detect_actions)
    assert "keyframes" in sig.parameters
    assert "client" in sig.parameters
    assert "synth_id" in sig.parameters


def test_abstract_intent_signature() -> None:
    sig = inspect.signature(pipeline.abstract_intent)
    for p in ("events", "dom_snapshots", "page_titles", "client", "synth_id"):
        assert p in sig.parameters


def test_emit_script_signature() -> None:
    sig = inspect.signature(pipeline.emit_script)
    assert "intent" in sig.parameters
    assert "client" in sig.parameters


def test_model_id_pins_match_constants() -> None:
    """§11 rationale — these model IDs are the prize-earning claim."""
    assert GEMINI_ACTION_DETECTION == "gemini-3.1-flash-lite"
    assert GEMINI_INTENT_ABSTRACTION == "gemini-3.1-pro"
    assert GEMINI_SCRIPT_EMISSION == "gemini-3-flash"
    assert THINKING_LEVEL_ACTION_DETECTION == "minimal"
    assert THINKING_LEVEL_INTENT_ABSTRACTION == "high"
    assert THINKING_LEVEL_SCRIPT_EMISSION == "medium"


def test_action_detection_schema_shape() -> None:
    s = prompts.ACTION_DETECTION_OUTPUT_SCHEMA
    assert s["type"] == "object"
    assert set(s["required"]) == {
        "action",
        "target_description",
        "bbox",
        "text_typed",
        "confidence",
    }
    actions = set(s["properties"]["action"]["enum"])
    assert actions == {"CLICK", "TYPE", "SCROLL", "NAV", "WAIT", "SUBMIT", "NOOP"}


def test_intent_schema_shape() -> None:
    s = prompts.INTENT_ABSTRACTION_OUTPUT_SCHEMA
    assert set(s["required"]) == {
        "goal",
        "inputs",
        "invariants",
        "output_schema",
        "steps",
    }


def test_emit_tinyfish_tool_schema_verbatim() -> None:
    """Exact §10c tool spec — name and required args are load-bearing."""
    decls = prompts.EMIT_TINYFISH_SCRIPT_TOOL["function_declarations"]
    assert len(decls) == 1
    fn = decls[0]
    assert fn["name"] == "emit_tinyfish_script"
    assert set(fn["parameters"]["required"]) == {
        "script",
        "cosmo_sdl",
        "runtime_manifest",
        "skills_pinned",
    }
    products = fn["parameters"]["properties"]["runtime_manifest"]["properties"][
        "tinyfish_products"
    ]["items"]["enum"]
    assert set(products) == {"web_agent", "web_search", "web_fetch", "web_browser"}


def test_synthesis_result_carries_trusted_documents() -> None:
    """SynthesisResult must surface trusted_documents so the worker can push them."""
    fields = {f.name for f in pipeline.SynthesisResult.__dataclass_fields__.values()}
    assert "trusted_documents" in fields


@pytest.mark.asyncio
async def test_pipeline_emits_trusted_documents(monkeypatch: pytest.MonkeyPatch) -> None:
    """After run_pipeline, the SynthesisResult exposes trusted_documents matching SDL fields.

    Uses the same replay fixture as test_fixture_e2e but feeds run_pipeline directly so
    we exercise the full orchestration (keyframes → actions → intent → script → trusted docs).
    """
    monkeypatch.setattr(gemini_client, "DEMO_MODE", "replay")

    # Patch keyframe extraction to read the fixture PNGs (cv2-free in CI shim).
    pngs = sorted((FIX / "frames").glob("frame_*.png"))
    fake_keyframes = [
        pipeline.Keyframe(index=i, timestamp_s=float(i), png_bytes=p.read_bytes())
        for i, p in enumerate(pngs)
    ]
    monkeypatch.setattr(
        pipeline, "extract_keyframes_from_bytes", lambda _bytes: fake_keyframes
    )

    synth_id = "fixture-e2e"
    seed = {
        f"us:replay:{synth_id}:action_0": (
            FIX / "expected" / "action_detection_0_1.json"
        ).read_text(),
        f"us:replay:{synth_id}:action_1": (
            FIX / "expected" / "action_detection_1_2.json"
        ).read_text(),
        f"us:replay:{synth_id}:intent": (
            FIX / "expected" / "intent_abstraction.json"
        ).read_text(),
        f"us:replay:{synth_id}:script": (
            FIX / "expected" / "script_emission.json"
        ).read_text(),
    }
    redis = _FakeRedis(seed)

    dom_diffs = json.loads((FIX / "dom" / "diffs.json").read_text())
    dom_snapshots = json.loads((FIX / "dom" / "snapshots.json").read_text())
    page_titles = json.loads((FIX / "dom" / "page_titles.json").read_text())

    result = await pipeline.run_pipeline(
        synth_id=synth_id,
        recording_bytes=b"unused-replay-mode",
        dom_diffs=dom_diffs,
        dom_snapshots=dom_snapshots,
        page_titles=page_titles,
        gemini=gemini_client.GeminiClient(),
        redis=redis,  # type: ignore[arg-type]
    )

    # Fixture SDL exposes a single Query field `run` → trusted doc named `Run`.
    names = sorted(d.name for d in result.trusted_documents)
    assert "Run" in names
