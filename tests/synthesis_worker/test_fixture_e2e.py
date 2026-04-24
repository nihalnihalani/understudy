"""End-to-end smoke: fixtures + DEMO_MODE=replay → full pipeline without Gemini.

This is the integration guardrail the tester-debugger leans on. Confirms:
  - keyframes load from the fixture PNGs
  - each stage reads its us:replay:{synth_id}:{stage} key and returns verbatim
  - final SynthesisResult composes cleanly (architecture.md §14 hermetic demo)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pytest.importorskip("cv2")

import gemini_client  # noqa: E402
from keyframes import Keyframe  # noqa: E402
from pipeline import abstract_intent, detect_actions, emit_script  # noqa: E402


FIX = Path(__file__).resolve().parents[2] / "fixtures" / "synthesis"


class _FakeRedis:
    def __init__(self, seed: dict[str, str]) -> None:
        self._data = seed

    async def get(self, key: str) -> str | None:
        return self._data.get(key)


def _load_frames() -> list[Keyframe]:
    pngs = sorted((FIX / "frames").glob("frame_*.png"))
    return [
        Keyframe(index=i, timestamp_s=float(i), png_bytes=p.read_bytes())
        for i, p in enumerate(pngs)
    ]


@pytest.mark.asyncio
async def test_full_pipeline_replay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini_client, "DEMO_MODE", "replay")
    synth_id = "fixture-e2e"

    seed = {
        f"us:replay:{synth_id}:action_0": (FIX / "expected" / "action_detection_0_1.json").read_text(),
        f"us:replay:{synth_id}:action_1": (FIX / "expected" / "action_detection_1_2.json").read_text(),
        f"us:replay:{synth_id}:intent":   (FIX / "expected" / "intent_abstraction.json").read_text(),
        f"us:replay:{synth_id}:script":   (FIX / "expected" / "script_emission.json").read_text(),
    }
    redis = _FakeRedis(seed)
    client = gemini_client.GeminiClient()

    frames = _load_frames()
    assert len(frames) == 3

    dom_diffs = json.loads((FIX / "dom" / "diffs.json").read_text())
    dom_snapshots = json.loads((FIX / "dom" / "snapshots.json").read_text())
    page_titles = json.loads((FIX / "dom" / "page_titles.json").read_text())

    actions = await detect_actions(
        frames, dom_diffs, client=client, synth_id=synth_id, redis=redis
    )
    assert [a.action for a in actions] == ["CLICK", "SUBMIT"]

    intent = await abstract_intent(
        actions, dom_snapshots, page_titles, client=client, synth_id=synth_id, redis=redis
    )
    assert intent.goal.startswith("Export Shopify orders CSV")
    assert any(i["name"] == "date_range" for i in intent.inputs)

    bundle = await emit_script(intent, client=client, synth_id=synth_id, redis=redis)
    assert "@tinyfish/cli" in bundle.script
    assert "RunInput" in bundle.cosmo_sdl
    skill_names = {s["name"] for s in bundle.skills_pinned}
    assert "export-csv" in skill_names
    assert "web_agent" in bundle.runtime_manifest["tinyfish_products"]
