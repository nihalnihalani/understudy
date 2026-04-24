"""Invariant #2: InsforgeStore.create_run must short-circuit when DEMO_MODE=replay.

Architecture.md §14 — every outbound call in the synthesis path must honor the
DEMO_MODE switch so a hermetic demo never depends on InsForge availability.
This pins the contract so a future edit can't reintroduce an unconditional
httpx.post() to InsForge under replay.
"""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from apps.api import store as store_module
from apps.api.schemas import SynthesisStatus


@pytest.fixture
def insforge_store(monkeypatch: pytest.MonkeyPatch) -> store_module.InsforgeStore:
    """Build an InsforgeStore with the httpx client swapped for a tracking mock.

    Any outbound call (post / get) routes through `self._client`, so replacing
    it with a MagicMock lets the assertion target the call count directly.
    """
    monkeypatch.setattr(store_module, "DEMO_MODE", "replay")
    s = store_module.InsforgeStore(
        base_url="https://fake-insforge.invalid",
        api_key="fake-api-key",
    )
    s._client = MagicMock(spec=["post", "get", "close"])  # type: ignore[assignment]
    return s


def test_create_run_replay_returns_synthetic_run(
    insforge_store: store_module.InsforgeStore,
) -> None:
    recording_id = uuid4()
    run = insforge_store.create_run(recording_id, s3_uri="s3://x", duration_s=42)
    assert run.recording_id == recording_id
    assert run.status == SynthesisStatus.QUEUED


def test_create_run_replay_makes_no_http_calls(
    insforge_store: store_module.InsforgeStore,
) -> None:
    recording_id = uuid4()
    insforge_store.create_run(recording_id)

    insforge_store._client.post.assert_not_called()  # type: ignore[attr-defined]
    insforge_store._client.get.assert_not_called()  # type: ignore[attr-defined]


def test_create_run_live_still_calls_insforge(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sanity: under DEMO_MODE=live the writer still tries to POST.

    Guards against accidentally short-circuiting the live path while wiring
    the replay branch.
    """
    monkeypatch.setattr(store_module, "DEMO_MODE", "live")
    s = store_module.InsforgeStore(
        base_url="https://fake-insforge.invalid",
        api_key="fake-api-key",
    )
    mock_client = MagicMock(spec=["post", "get", "close"])
    mock_client.post.return_value = MagicMock(status_code=201, text="")
    s._client = mock_client  # type: ignore[assignment]

    s.create_run(uuid4())
    assert mock_client.post.call_count >= 1
