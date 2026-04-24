"""Pipeline stage signatures + model-ID wiring conformance (architecture.md §10).

These are the invariants the tester-debugger depends on:
  1. The three stage functions exist with the documented shape.
  2. They pull model IDs + thinking levels from understudy.models (no hardcoding).
  3. Verbatim §10 prompt strings + JSON schemas ship in-module.
"""

from __future__ import annotations

import inspect

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

import pipeline  # noqa: E402
import prompts  # noqa: E402


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
