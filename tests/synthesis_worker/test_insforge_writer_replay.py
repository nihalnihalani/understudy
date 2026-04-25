"""Invariant #2: InsforgeWriter.persist_agent_artifacts must short-circuit when DEMO_MODE=replay.

Architecture.md §14 — every outbound call in the synthesis path must honor the
DEMO_MODE switch. This pins the contract so a future edit can't reintroduce
unconditional httpx.post() calls to InsForge under replay.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

import insforge_writer  # noqa: E402  (sys.path injected by conftest)


_ARTIFACTS = dict(
    image_digest="sha256:deadbeef",
    registry="ghcr.io/example/img",
    builder_id="https://example/builder",
    materials={"source": {"uri": "git+https://example"}},
    sbom_components=[{"name": "x", "version": "1", "type": "npm"}],
    cosign_sig="MEUCIQDtest",
    graphql_endpoint="https://x/graphql",
    ams_namespace="ams:agent:replay",
)


def test_persist_agent_artifacts_replay_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(insforge_writer, "DEMO_MODE", "replay")
    w = insforge_writer.InsforgeWriter(
        base_url="https://fake-insforge.invalid",
        api_key="fake-api-key",
    )
    # Sentinel: blow up if any code path actually touches the http client.
    tracking_client = MagicMock(spec=["post", "get", "close"])
    w._client = tracking_client  # type: ignore[assignment]

    result = w.persist_agent_artifacts(**_ARTIFACTS)

    assert result is None
    tracking_client.post.assert_not_called()


def test_persist_agent_artifacts_replay_no_http_even_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Replay branch fires before the enabled-check; no http calls regardless."""
    monkeypatch.setattr(insforge_writer, "DEMO_MODE", "replay")
    monkeypatch.delenv("INSFORGE_URL", raising=False)
    monkeypatch.delenv("INSFORGE_API_KEY", raising=False)
    w = insforge_writer.InsforgeWriter()
    assert w.persist_agent_artifacts(**_ARTIFACTS) is None


def test_persist_agent_artifacts_live_still_attempts_http(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sanity: under DEMO_MODE=live the writer still tries to POST when enabled."""
    monkeypatch.setattr(insforge_writer, "DEMO_MODE", "live")
    w = insforge_writer.InsforgeWriter(
        base_url="https://fake-insforge.invalid",
        api_key="fake-api-key",
    )
    mock_client = MagicMock(spec=["post", "get", "close"])
    mock_client.post.return_value = MagicMock(status_code=201, text="")
    w._client = mock_client  # type: ignore[assignment]

    w.persist_agent_artifacts(**_ARTIFACTS)
    assert mock_client.post.call_count >= 1
