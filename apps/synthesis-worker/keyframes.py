"""Scene-change keyframe extraction — the biggest latency lever in the pipeline.

OpenCV PSNR delta cuts a 60s recording (~60 raw frames at 1fps) to 5-8 keyframes.
Gemini 3.1 Flash-Lite on 8 frames is ~6s vs ~25s on 60 raw frames (architecture.md §3).

Output frames are downsampled to max 512px on the long edge and capped at 8 per
architecture.md §13 (multimodal payload size failure mode).
"""

from __future__ import annotations

import io
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import cv2  # type: ignore[import-untyped]
import numpy as np

log = logging.getLogger(__name__)

# PSNR below this threshold between consecutive frames → scene change (empirically tuned).
# Lower PSNR = bigger visual delta. 30dB is a common "noticeable difference" cutoff.
SCENE_CHANGE_PSNR_THRESHOLD_DB: float = 30.0

# architecture.md §3 hackathon note + §13 payload cap: 5-8 keyframes, 8 hard max.
MIN_KEYFRAMES: int = 5
MAX_KEYFRAMES: int = 8

# Frame resolution cap for multimodal payloads (architecture.md §13).
MAX_FRAME_EDGE_PX: int = 512

# ffmpeg sample rate when decoding the raw recording (1 fps gives ~60 frames for a 60s clip).
DECODE_FPS: int = 1


@dataclass(frozen=True)
class Keyframe:
    """A scene-change-selected frame with PNG bytes and its sampling timestamp."""

    index: int
    timestamp_s: float
    png_bytes: bytes


def _run_ffmpeg_decode(recording_path: str, out_dir: str) -> list[Path]:
    """Decode the recording to PNG frames at DECODE_FPS using ffmpeg."""
    pattern = str(Path(out_dir) / "frame_%04d.png")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        recording_path,
        "-vf",
        f"fps={DECODE_FPS}",
        "-hide_banner",
        "-loglevel",
        "error",
        pattern,
    ]
    subprocess.run(cmd, check=True, capture_output=True)  # noqa: S603
    return sorted(Path(out_dir).glob("frame_*.png"))


def _downsample(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= MAX_FRAME_EDGE_PX:
        return img
    scale = MAX_FRAME_EDGE_PX / longest
    new_size = (int(w * scale), int(h * scale))
    return cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)


def _encode_png(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("cv2.imencode failed for keyframe")
    return bytes(buf.tobytes())


def _psnr(a: np.ndarray, b: np.ndarray) -> float:
    """Peak signal-to-noise ratio (dB). Higher = more similar."""
    return float(cv2.PSNR(a, b))


def select_scene_change_keyframes(frames: list[np.ndarray]) -> list[int]:
    """Pick indices where PSNR dropped below threshold vs the previous frame.

    Always includes frame 0. Caps output at MAX_KEYFRAMES. If fewer than
    MIN_KEYFRAMES qualify, pads by evenly-spaced sampling (demo safety net).
    """
    if not frames:
        return []
    if len(frames) == 1:
        return [0]

    selected: list[int] = [0]
    for i in range(1, len(frames)):
        psnr_db = _psnr(frames[i - 1], frames[i])
        if psnr_db < SCENE_CHANGE_PSNR_THRESHOLD_DB:
            selected.append(i)
            if len(selected) >= MAX_KEYFRAMES:
                break

    if len(selected) < MIN_KEYFRAMES:
        step = max(1, len(frames) // MIN_KEYFRAMES)
        padded = sorted(set(selected) | set(range(0, len(frames), step)))
        selected = padded[:MAX_KEYFRAMES]

    return selected[:MAX_KEYFRAMES]


def extract_keyframes(recording_path: str) -> list[Keyframe]:
    """Full pipeline: decode recording → PSNR scene-change pick → downsample → encode.

    Returns 5-8 PNG-encoded keyframes (architecture.md §3 hackathon note).
    """
    if not Path(recording_path).exists():
        raise FileNotFoundError(f"recording not found: {recording_path}")

    with tempfile.TemporaryDirectory(prefix="us_frames_") as tmp:
        frame_paths = _run_ffmpeg_decode(recording_path, tmp)
        if not frame_paths:
            raise RuntimeError("ffmpeg produced zero frames")

        images = [cv2.imread(str(p)) for p in frame_paths]
        images = [img for img in images if img is not None]
        if not images:
            raise RuntimeError("cv2.imread returned no valid images")

        picked = select_scene_change_keyframes(images)
        log.info("keyframes: selected %d of %d (%s)", len(picked), len(images), picked)

        keyframes: list[Keyframe] = []
        for k in picked:
            down = _downsample(images[k])
            keyframes.append(
                Keyframe(
                    index=k,
                    timestamp_s=float(k) / DECODE_FPS,
                    png_bytes=_encode_png(down),
                )
            )
        return keyframes


def extract_keyframes_from_bytes(recording_bytes: bytes, suffix: str = ".mp4") -> list[Keyframe]:
    """Convenience: take raw recording bytes (e.g. from S3), write to a temp file, extract."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(recording_bytes)
        path = f.name
    try:
        return extract_keyframes(path)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def decode_png(png_bytes: bytes) -> np.ndarray:
    """Inverse of `_encode_png` — for tests and fixture-driven pipelines."""
    arr = np.frombuffer(png_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("failed to decode PNG bytes")
    return img


def _io_import_check() -> None:
    # Keep `io` imported — used by downstream callers that stream keyframes.
    _ = io.BytesIO
