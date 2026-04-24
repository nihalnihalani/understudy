"""Verbatim prompts + JSON schemas from architecture.md §10.

Keep these strings load-bearing: they are the contract for the three-model pipeline.
Changes here must be mirrored in docs/gemini-prompts/*.md and architecture.md §10.
"""

from __future__ import annotations

from typing import Any

# --- (a) Action Detection — Gemini 3.1 Flash-Lite ----------------------------------
ACTION_DETECTION_SYSTEM = "You are a frame-level UI event detector."

ACTION_DETECTION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["action", "target_description", "bbox", "text_typed", "confidence"],
    "properties": {
        "action": {
            "type": "string",
            "enum": ["CLICK", "TYPE", "SCROLL", "NAV", "WAIT", "SUBMIT", "NOOP"],
        },
        "target_description": {"type": "string"},
        "bbox": {
            "type": "array",
            "items": {"type": "number"},
            "minItems": 4,
            "maxItems": 4,
        },
        "text_typed": {"type": "string", "nullable": True},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
}

# --- (b) Intent Abstraction — Gemini 3.1 Pro ---------------------------------------
INTENT_ABSTRACTION_SYSTEM = (
    "You infer user goals from low-level UI event streams.\n"
    "Given an ordered action trace, infer GOAL, INPUTS that vary per run, "
    "INVARIANTS that are fixed, and a structured OUTPUT.\n"
    'Favor generality: "Order #1042" -> "most recent order".'
)

INTENT_ABSTRACTION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["goal", "inputs", "invariants", "output_schema", "steps"],
    "properties": {
        "goal": {"type": "string"},
        "inputs": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "type"],
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string"},
                    "default": {"type": "string"},
                },
            },
        },
        "invariants": {"type": "object"},
        "output_schema": {"type": "object"},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["intent"],
                "properties": {
                    "intent": {"type": "string"},
                    "selector_hint": {"type": "string"},
                },
            },
        },
    },
}

# --- (c) Script Emission — Gemini 3 Flash tool declaration --------------------------
SCRIPT_EMISSION_SYSTEM = (
    "You emit production-grade TinyFish CLI TypeScript for the given intent spec.\n"
    "Call `emit_tinyfish_script` exactly once with the script, Cosmo SDL, runtime\n"
    "manifest, and pinned TinyFish Skills. Prefer Skill primitives over inline\n"
    "selectors; TinyFish resolves selector_hint → accessibility tree at runtime."
)

# Verbatim from architecture.md §10(c). Kept as a single dict so the Gemini SDK can
# consume it as-is via `types.Tool(function_declarations=[...])` constructors.
EMIT_TINYFISH_SCRIPT_TOOL: dict[str, Any] = {
    "function_declarations": [
        {
            "name": "emit_tinyfish_script",
            "description": (
                "Emit a TinyFish CLI script with pinned Agent Skills for the intent spec"
            ),
            "parameters": {
                "type": "object",
                "required": ["script", "cosmo_sdl", "runtime_manifest", "skills_pinned"],
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "TypeScript for @tinyfish/cli v2+",
                    },
                    "cosmo_sdl": {
                        "type": "string",
                        "description": "GraphQL SDL from Dream Query",
                    },
                    "runtime_manifest": {
                        "type": "object",
                        "properties": {
                            "tinyfish_products": {
                                "type": "array",
                                "items": {
                                    "enum": [
                                        "web_agent",
                                        "web_search",
                                        "web_fetch",
                                        "web_browser",
                                    ]
                                },
                            },
                            "redis_namespace": {"type": "string"},
                            "insforge_tables": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                    "skills_pinned": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "version": {"type": "string"},
                            },
                        },
                    },
                },
            },
        }
    ]
}
