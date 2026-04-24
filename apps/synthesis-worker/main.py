"""Synthesis worker entrypoint — drives the three-Gemini pipeline end-to-end."""

from understudy.models import (
    GEMINI_ACTION_DETECTION,
    GEMINI_INTENT_ABSTRACTION,
    GEMINI_SCRIPT_EMISSION,
)


async def run_synthesis(run_id: str, recording_uri: str) -> dict[str, str]:
    # TODO(task #3): scene-change keyframe extraction (architecture.md §3 hackathon note),
    # then chain Flash-Lite → Pro → Flash with thinking_level overrides per architecture.md §10.
    _ = (GEMINI_ACTION_DETECTION, GEMINI_INTENT_ABSTRACTION, GEMINI_SCRIPT_EMISSION)
    raise NotImplementedError("see task #3")


if __name__ == "__main__":
    # TODO(task #3): consume Redis Stream `run:synth:*` via XREADGROUP.
    raise NotImplementedError("see task #3")
