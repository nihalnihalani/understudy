"""Keyframe 5-8 bound is load-bearing — it is the biggest latency lever (architecture.md §3)."""

from __future__ import annotations

import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")

from keyframes import (  # noqa: E402  (sys.path injected by conftest)
    MAX_KEYFRAMES,
    MIN_KEYFRAMES,
    select_scene_change_keyframes,
)


def _solid(rgb: tuple[int, int, int]) -> np.ndarray:
    return np.full((64, 64, 3), rgb, dtype=np.uint8)


def test_single_frame_returns_only_index_zero() -> None:
    assert select_scene_change_keyframes([_solid((10, 10, 10))]) == [0]


def test_uniform_frames_still_pad_to_min() -> None:
    """Zero scene changes — we still pad up to MIN_KEYFRAMES for downstream safety."""
    frames = [_solid((10, 10, 10)) for _ in range(20)]
    picked = select_scene_change_keyframes(frames)
    assert len(picked) >= MIN_KEYFRAMES
    assert len(picked) <= MAX_KEYFRAMES


def test_every_frame_different_caps_at_max() -> None:
    """20 highly distinct frames must not exceed MAX_KEYFRAMES."""
    frames = [_solid((i * 12 % 255, i * 7 % 255, i * 5 % 255)) for i in range(20)]
    picked = select_scene_change_keyframes(frames)
    assert len(picked) <= MAX_KEYFRAMES
    assert picked[0] == 0


def test_middle_scene_change_detected() -> None:
    """Two stretches of identical frames with a distinct pivot → at least one change pick."""
    frames = [_solid((20, 20, 20))] * 5 + [_solid((240, 20, 20))] * 5
    picked = select_scene_change_keyframes(frames)
    assert 0 in picked
    assert len(picked) <= MAX_KEYFRAMES


def test_empty_returns_empty() -> None:
    assert select_scene_change_keyframes([]) == []


def test_bounds_constants_match_architecture_md() -> None:
    """Guardrails — don't let a refactor silently drop the 5-8 bound."""
    assert MIN_KEYFRAMES == 5
    assert MAX_KEYFRAMES == 8
