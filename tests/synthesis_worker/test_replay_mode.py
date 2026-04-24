"""DEMO_MODE=replay must short-circuit Gemini without touching the SDK (architecture.md §14)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

pytest.importorskip("cv2")

import gemini_client  # noqa: E402


class _FakeRedis:
    def __init__(self, items: dict[str, str]) -> None:
        self.items = items
        self.calls: list[str] = []

    async def get(self, key: str) -> str | None:
        self.calls.append(key)
        return self.items.get(key)


@pytest.mark.asyncio
async def test_replay_bypasses_live_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini_client, "DEMO_MODE", "replay")
    payload: dict[str, Any] = {"action": "CLICK", "confidence": 0.9}
    fake = _FakeRedis({"us:replay:sx:action_0": json.dumps(payload)})

    client = gemini_client.GeminiClient()
    # Sentinel: if live path runs, this raises.
    async def _no_live(**_kw: Any) -> dict[str, Any]:
        raise AssertionError("live call attempted in replay mode")

    client._execute_with_fallback = _no_live  # type: ignore[assignment]

    result = await client.call_json(
        model="gemini-3.1-flash-lite",
        thinking_level="minimal",
        system="test",
        user_parts=[{"text": "x"}],
        replay_key="us:replay:sx:action_0",
        redis=fake,
    )
    assert result == payload
    assert "us:replay:sx:action_0" in fake.calls


@pytest.mark.asyncio
async def test_replay_miss_falls_through(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini_client, "DEMO_MODE", "replay")
    fake = _FakeRedis({})

    client = gemini_client.GeminiClient()
    sentinel = {"action": "NOOP", "confidence": 0.1}

    async def _live(**_kw: Any) -> dict[str, Any]:
        return sentinel

    client._execute_with_fallback = _live  # type: ignore[assignment]

    result = await client.call_json(
        model="gemini-3.1-flash-lite",
        thinking_level="minimal",
        system="test",
        user_parts=[{"text": "x"}],
        replay_key="us:replay:missing",
        redis=fake,
    )
    assert result is sentinel


def test_asyncio_wiring_smoke() -> None:
    # Ensures the test file imports and async functions resolve under asyncio.run too.
    asyncio.run(asyncio.sleep(0))
