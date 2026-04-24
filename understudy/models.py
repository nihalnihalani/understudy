"""Pinned Gemini model IDs — the three-model synthesis brain.

These IDs are load-bearing. Do NOT alias or swap without updating architecture.md §10.
Each model is pinned to the role it is objectively best at (see architecture.md §11).
"""

from typing import Final

# Action detection — multimodal fn-response on scene-change keyframes (architecture.md §10a).
GEMINI_ACTION_DETECTION: Final[str] = "gemini-3.1-flash-lite"

# Intent abstraction — thinking_level=high on messy event streams (architecture.md §10b).
GEMINI_INTENT_ABSTRACTION: Final[str] = "gemini-3.1-pro"

# Script emission — 78% SWE-bench, best coder in the family (architecture.md §11).
GEMINI_SCRIPT_EMISSION: Final[str] = "gemini-3-flash"

# Live API aliases for the current Google endpoint surface. The product contract above
# stays canonical; this map is only applied at the SDK boundary.
GEMINI_LIVE_MODEL_ALIASES: Final[dict[str, str]] = {
    "gemini-3.1-flash-lite": "gemini-3.1-flash-lite-preview",
    "gemini-3.1-pro": "gemini-3-flash-preview",
    "gemini-3-flash": "gemini-3-flash-preview",
}

# thinking_level values used per prompt (architecture.md §10 table).
THINKING_LEVEL_ACTION_DETECTION: Final[str] = "minimal"
THINKING_LEVEL_INTENT_ABSTRACTION: Final[str] = "high"
THINKING_LEVEL_SCRIPT_EMISSION: Final[str] = "medium"
