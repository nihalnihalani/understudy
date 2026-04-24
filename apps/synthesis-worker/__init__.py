"""Three-Gemini synthesis worker: keyframe → action → intent → script (architecture.md §3).

Public surface:
  - `run_pipeline`  — full end-to-end; used by main worker loop and tests
  - `detect_actions`, `abstract_intent`, `emit_script` — individual stages for fixtures
  - `extract_keyframes`, `extract_keyframes_from_bytes` — keyframe extraction
  - `GeminiClient`, `LangCache` — policy wrappers
"""

from .gemini_client import GeminiClient  # noqa: F401
from .keyframes import (  # noqa: F401
    Keyframe,
    extract_keyframes,
    extract_keyframes_from_bytes,
    select_scene_change_keyframes,
)
from .langcache import LangCache  # noqa: F401
from .pipeline import (  # noqa: F401
    ActionEvent,
    IntentSpec,
    SynthesisResult,
    TinyFishScriptBundle,
    abstract_intent,
    detect_actions,
    emit_script,
    run_pipeline,
)
