"""Three-stage Gemini pipeline: action → intent → script (architecture.md §3, §10).

Stage 1: `gemini-3.1-flash-lite`, `thinking_level=minimal`, multimodal fn-response.
Stage 2: `gemini-3.1-pro`, `thinking_level=high`, JSON-mode intent abstraction.
Stage 3: `gemini-3-flash`, `thinking_level=medium`, `emit_tinyfish_script` tool call.

Every call routes through `GeminiClient` which layers LangCache + DEMO_MODE + InsForge
Model Gateway fallback on top of `google-genai`.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import asdict, dataclass
from typing import Any

import redis.asyncio as aioredis

from understudy.models import (
    GEMINI_ACTION_DETECTION,
    GEMINI_INTENT_ABSTRACTION,
    GEMINI_SCRIPT_EMISSION,
    THINKING_LEVEL_ACTION_DETECTION,
    THINKING_LEVEL_INTENT_ABSTRACTION,
    THINKING_LEVEL_SCRIPT_EMISSION,
)

try:  # dual-form import: package mode OR flat sys.path-injected mode
    from .gemini_client import GeminiClient
    from .keyframes import Keyframe, extract_keyframes_from_bytes
    from .prompts import (
        ACTION_DETECTION_OUTPUT_SCHEMA,
        ACTION_DETECTION_SYSTEM,
        EMIT_TINYFISH_SCRIPT_TOOL,
        INTENT_ABSTRACTION_OUTPUT_SCHEMA,
        INTENT_ABSTRACTION_SYSTEM,
        SCRIPT_EMISSION_SYSTEM,
    )
except ImportError:  # pragma: no cover — exercised when loaded via sys.path injection
    from gemini_client import GeminiClient  # type: ignore[no-redef]
    from keyframes import (  # type: ignore[no-redef]
        Keyframe,
        extract_keyframes_from_bytes,
    )
    from prompts import (  # type: ignore[no-redef]
        ACTION_DETECTION_OUTPUT_SCHEMA,
        ACTION_DETECTION_SYSTEM,
        EMIT_TINYFISH_SCRIPT_TOOL,
        INTENT_ABSTRACTION_OUTPUT_SCHEMA,
        INTENT_ABSTRACTION_SYSTEM,
        SCRIPT_EMISSION_SYSTEM,
    )

log = logging.getLogger(__name__)

COSMO_MOCK = os.environ.get("COSMO_MOCK", "0") == "1"


# --- Redis key helpers (architecture.md §9) ----------------------------------------
def frames_key(synth_id: str) -> str:
    return f"us:synth:{synth_id}:frames"


def replay_key(synth_id: str, stage: str | None = None) -> str:
    """Hermetic demo replay key; stage-scoped when given."""
    return f"us:replay:{synth_id}" if stage is None else f"us:replay:{synth_id}:{stage}"


def run_trace_key(run_id: str) -> str:
    return f"run:synth:{run_id}"


# --- Stage output types -------------------------------------------------------------
@dataclass
class ActionEvent:
    """One Flash-Lite action detection output (architecture.md §10a)."""

    action: str
    target_description: str
    bbox: list[float]
    text_typed: str | None
    confidence: float
    frame_index: int


@dataclass
class IntentSpec:
    """Gemini 3.1 Pro intent abstraction output (architecture.md §10b)."""

    goal: str
    inputs: list[dict[str, Any]]
    invariants: dict[str, Any]
    output_schema: dict[str, Any]
    steps: list[dict[str, Any]]


@dataclass
class TinyFishScriptBundle:
    """Gemini 3 Flash `emit_tinyfish_script` tool-call output (architecture.md §10c)."""

    script: str
    cosmo_sdl: str
    runtime_manifest: dict[str, Any]
    skills_pinned: list[dict[str, str]]


# --- Stage 1: action detection ------------------------------------------------------
async def detect_actions(
    keyframes: list[Keyframe],
    dom_diffs: list[dict[str, Any]] | None,
    *,
    client: GeminiClient,
    synth_id: str,
    redis: aioredis.Redis | None = None,
) -> list[ActionEvent]:
    """Run Gemini 3.1 Flash-Lite over consecutive keyframe pairs.

    We feed (frame_t, frame_t+1) + corresponding DOM diff → one event per pair.
    Output list length = len(keyframes) - 1 (or 0 if <2 keyframes).
    """
    if len(keyframes) < 2:
        log.warning("detect_actions: <2 keyframes, returning empty trace")
        return []

    events: list[ActionEvent] = []
    for i in range(len(keyframes) - 1):
        f_t, f_next = keyframes[i], keyframes[i + 1]
        dom_diff = (dom_diffs[i] if dom_diffs and i < len(dom_diffs) else {})

        user_parts = [
            {
                "inline_data": {
                    "mime_type": "image/png",
                    "data": base64.b64encode(f_t.png_bytes).decode("ascii"),
                }
            },
            {
                "inline_data": {
                    "mime_type": "image/png",
                    "data": base64.b64encode(f_next.png_bytes).decode("ascii"),
                }
            },
            {"text": f"DOM-diff: {json.dumps(dom_diff)}"},
        ]

        raw = await client.call_json(
            model=GEMINI_ACTION_DETECTION,
            thinking_level=THINKING_LEVEL_ACTION_DETECTION,
            system=ACTION_DETECTION_SYSTEM,
            user_parts=user_parts,
            response_schema=ACTION_DETECTION_OUTPUT_SCHEMA,
            replay_key=replay_key(synth_id, f"action_{i}"),
            redis=redis,
        )
        events.append(
            ActionEvent(
                action=raw["action"],
                target_description=raw["target_description"],
                bbox=list(raw.get("bbox", [])),
                text_typed=raw.get("text_typed"),
                confidence=float(raw.get("confidence", 0.0)),
                frame_index=f_t.index,
            )
        )
    return events


# --- Stage 2: intent abstraction ----------------------------------------------------
async def abstract_intent(
    events: list[ActionEvent],
    dom_snapshots: list[dict[str, Any]],
    page_titles: list[str],
    *,
    client: GeminiClient,
    synth_id: str,
    redis: aioredis.Redis | None = None,
) -> IntentSpec:
    """Gemini 3.1 Pro with `thinking_level=high` over the full action trace."""
    user_parts = [
        {
            "text": (
                f"events={json.dumps([asdict(e) for e in events])}, "
                f"dom_snapshots={json.dumps(dom_snapshots)}, "
                f"page_titles={json.dumps(page_titles)}"
            )
        }
    ]

    raw = await client.call_json(
        model=GEMINI_INTENT_ABSTRACTION,
        thinking_level=THINKING_LEVEL_INTENT_ABSTRACTION,
        system=INTENT_ABSTRACTION_SYSTEM,
        user_parts=user_parts,
        response_schema=INTENT_ABSTRACTION_OUTPUT_SCHEMA,
        replay_key=replay_key(synth_id, "intent"),
        redis=redis,
    )
    return IntentSpec(
        goal=raw["goal"],
        inputs=list(raw.get("inputs", [])),
        invariants=dict(raw.get("invariants", {})),
        output_schema=dict(raw.get("output_schema", {})),
        steps=list(raw.get("steps", [])),
    )


# --- Stage 3: script emission -------------------------------------------------------
async def emit_script(
    intent: IntentSpec,
    *,
    client: GeminiClient,
    synth_id: str,
    redis: aioredis.Redis | None = None,
    cosmo_sdl_override: str | None = None,
) -> TinyFishScriptBundle:
    """Gemini 3 Flash tool-call emitting TinyFish script + SDL + manifest + skills.

    If `COSMO_MOCK=1` or no SDL is supplied upstream, we accept whatever Gemini returns
    and let cosmo-engineer patch `cosmo_sdl` later (see architecture.md §14 fallback).
    """
    user_parts = [{"text": f"intent_spec={json.dumps(asdict(intent))}"}]

    raw = await client.call_tool(
        model=GEMINI_SCRIPT_EMISSION,
        thinking_level=THINKING_LEVEL_SCRIPT_EMISSION,
        system=SCRIPT_EMISSION_SYSTEM,
        user_parts=user_parts,
        tool_declaration=EMIT_TINYFISH_SCRIPT_TOOL,
        replay_key=replay_key(synth_id, "script"),
        redis=redis,
    )

    cosmo_sdl = raw.get("cosmo_sdl", "")
    if cosmo_sdl_override is not None:
        cosmo_sdl = cosmo_sdl_override
    elif COSMO_MOCK and not cosmo_sdl:
        cosmo_sdl = _inline_sdl_stub(intent)

    return TinyFishScriptBundle(
        script=raw["script"],
        cosmo_sdl=cosmo_sdl,
        runtime_manifest=dict(raw.get("runtime_manifest", {})),
        skills_pinned=list(raw.get("skills_pinned", [])),
    )


def _inline_sdl_stub(intent: IntentSpec) -> str:
    """Minimal SDL placeholder so the pipeline does not block on Cosmo availability."""
    return (
        "# cosmo_mock stub — replace with Dream Query output\n"
        f"type Query {{\n  run(input: RunInput!): RunResult! # {intent.goal}\n}}\n"
        "input RunInput { _raw: String }\n"
        "type RunResult { ok: Boolean! }\n"
    )


# --- Full pipeline ------------------------------------------------------------------
@dataclass
class SynthesisResult:
    synth_id: str
    keyframes: list[Keyframe]
    actions: list[ActionEvent]
    intent: IntentSpec
    bundle: TinyFishScriptBundle


async def run_pipeline(
    *,
    synth_id: str,
    recording_bytes: bytes,
    dom_diffs: list[dict[str, Any]] | None = None,
    dom_snapshots: list[dict[str, Any]] | None = None,
    page_titles: list[str] | None = None,
    gemini: GeminiClient,
    redis: aioredis.Redis | None = None,
    cosmo_sdl_override: str | None = None,
) -> SynthesisResult:
    """End-to-end: keyframes → actions → intent → TinyFish bundle."""
    keyframes = extract_keyframes_from_bytes(recording_bytes)

    if redis is not None:
        pipe = redis.pipeline()
        pipe.delete(frames_key(synth_id))
        for kf in keyframes:
            pipe.rpush(frames_key(synth_id), kf.png_bytes)
        await pipe.execute()

    actions = await detect_actions(
        keyframes, dom_diffs, client=gemini, synth_id=synth_id, redis=redis
    )
    intent = await abstract_intent(
        actions,
        dom_snapshots or [],
        page_titles or [],
        client=gemini,
        synth_id=synth_id,
        redis=redis,
    )
    bundle = await emit_script(
        intent,
        client=gemini,
        synth_id=synth_id,
        redis=redis,
        cosmo_sdl_override=cosmo_sdl_override,
    )
    return SynthesisResult(
        synth_id=synth_id,
        keyframes=keyframes,
        actions=actions,
        intent=intent,
        bundle=bundle,
    )
