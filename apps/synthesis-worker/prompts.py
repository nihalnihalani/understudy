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
    "You emit production-grade TypeScript for the given intent spec, targeting the\n"
    "real TinyFish SDK at `@tiny-fish/sdk` (verified shape, 2026-04-25):\n"
    "\n"
    "  import { TinyFish } from '@tiny-fish/sdk';\n"
    "  const client = new TinyFish({ apiKey: process.env.TINYFISH_API_KEY! });\n"
    "  const response = await client.agent.run({ goal, url });\n"
    "  // .stream(...) for SSE events; .queue(...) for fire-and-forget.\n"
    "\n"
    "There are NO sub-module imports like `@tiny-fish/sdk/web_browser` or\n"
    "`@tiny-fish/sdk/web_agent` — those don't exist on the real package. There is\n"
    "NO Skill registry to import primitives from; TinyFish reads a free-form `goal`\n"
    "string + a `url` and figures the rest out itself. Encode the workflow IN the\n"
    "goal string — be specific about every action and selector hint.\n"
    "\n"
    "Call `emit_tinyfish_script` exactly once with the script, Cosmo SDL, runtime\n"
    "manifest, and `skills_pinned` (project-internal metadata for LangCache keying;\n"
    "pick stable name@version pairs that describe the workflow category).\n"
    "Always set `runtime_manifest.starting_url` to the URL the agent should open\n"
    "first — the runtime calls `client.agent.run({goal, url: starting_url})`."
)

# Verbatim from architecture.md §10(c). Kept as a single dict so the Gemini SDK can
# consume it as-is via `types.Tool(function_declarations=[...])` constructors.
EMIT_TINYFISH_SCRIPT_TOOL: dict[str, Any] = {
    "function_declarations": [
        {
            "name": "emit_tinyfish_script",
            "description": (
                "Emit a TinyFish SDK script (using @tiny-fish/sdk's TinyFish.agent.run) "
                "plus a Cosmo SDL and runtime manifest for the intent spec."
            ),
            "parameters": {
                "type": "object",
                "required": ["script", "cosmo_sdl", "runtime_manifest", "skills_pinned"],
                "properties": {
                    "script": {
                        "type": "string",
                        "description": (
                            "TypeScript for @tiny-fish/sdk@^0.0.8. MUST import "
                            "`{ TinyFish } from '@tiny-fish/sdk'` (no sub-paths) "
                            "and call `client.agent.run({goal, url})`."
                        ),
                    },
                    "cosmo_sdl": {
                        "type": "string",
                        "description": "GraphQL SDL from Dream Query",
                    },
                    "runtime_manifest": {
                        "type": "object",
                        "required": ["tinyfish_products", "starting_url", "redis_namespace"],
                        "properties": {
                            "tinyfish_products": {
                                "type": "array",
                                "items": {
                                    "type": "string",
                                    "enum": [
                                        "web_agent",
                                        "web_search",
                                        "web_fetch",
                                        "web_browser",
                                    ]
                                },
                            },
                            "starting_url": {
                                "type": "string",
                                "description": (
                                    "URL the agent opens before reasoning over the "
                                    "goal (e.g. https://drive.google.com). Required."
                                ),
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
                        "description": (
                            "Project-internal metadata only — TinyFish has no Skill "
                            "registry. Pick descriptive name@version pairs (e.g. "
                            "'drive.openFile@1.0.0') that categorize the workflow."
                        ),
                        "items": {
                            "type": "object",
                            "required": ["name", "version"],
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
