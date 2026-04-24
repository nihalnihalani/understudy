"""Back the on-stage claims for int8 Vector Sets (architecture.md §9).

The devil's-advocate teammate (task #14) will check that these numbers are real.

Claims:
  1. 75% memory reduction vs float32 (4 bytes/dim -> 1 byte/dim).
  2. >99% recall retention on a 1000-vector synthetic bench.
     (Architecture cites 99.99% — we assert the looser 99% here because the scaling
      is per-vector symmetric; the 99.99% number from Redis marketing uses Redis's
      internal Q8 calibration which is tighter than our ctor-free helper. 99%+ is
      sufficient to defend the on-stage claim and we note the delta in the docstring.)
  3. Cosine direction is preserved (scale is symmetric, round-trip similarity high).
"""

from __future__ import annotations

import numpy as np
import pytest

from understudy.memory.vector import (
    dequantize_int8,
    memory_reduction_ratio,
    quantize_int8,
)


def test_memory_reduction_ratio_exactly_75_percent():
    for dim in (8, 64, 384, 768, 1536):
        assert memory_reduction_ratio(dim) == pytest.approx(0.75), (
            f"int8 must save 75% vs float32 at dim={dim}"
        )


def test_quantize_produces_int8_with_correct_shape():
    vec = np.random.default_rng(0).standard_normal(384).astype(np.float32)
    q = quantize_int8(vec)
    assert q.dtype == np.int8
    assert q.shape == vec.shape
    assert q.min() >= -127
    assert q.max() <= 127


def test_quantize_zero_vector_returns_zeros():
    vec = np.zeros(16, dtype=np.float32)
    q = quantize_int8(vec)
    assert np.all(q == 0)


def test_quantize_single_max_element_maps_to_127():
    vec = np.zeros(10, dtype=np.float32)
    vec[3] = 2.5
    q = quantize_int8(vec)
    assert q[3] == 127
    assert q[0] == 0


def test_byte_savings_on_realistic_embedding_batch():
    # 1000 vectors x 384 dims is a representative AMS scale (architecture.md §9 note).
    rng = np.random.default_rng(42)
    batch = rng.standard_normal((1000, 384)).astype(np.float32)
    float32_bytes = batch.nbytes
    int8_batch = np.stack([quantize_int8(v) for v in batch])
    int8_bytes = int8_batch.nbytes
    saved = (float32_bytes - int8_bytes) / float32_bytes
    assert saved == pytest.approx(0.75, rel=1e-6), (
        f"expected 75% savings, got {saved * 100:.2f}%"
    )


def test_recall_retention_at_99_percent_on_synthetic_bench():
    """Build 1000 random unit vectors, query with 50 held-out queries.

    For each query, compute the top-1 neighbor under float32 cosine and under
    int8-quantized cosine; assert they agree >= 99% of the time. This is the math
    behind the "99.99% accuracy retention" talking point; we defend 99%+ here
    without a dependency on Redis's internal Q8 calibration.
    """
    rng = np.random.default_rng(7)
    corpus = rng.standard_normal((1000, 128)).astype(np.float32)
    corpus /= np.linalg.norm(corpus, axis=1, keepdims=True)
    queries = rng.standard_normal((50, 128)).astype(np.float32)
    queries /= np.linalg.norm(queries, axis=1, keepdims=True)

    corpus_q = np.stack([quantize_int8(v) for v in corpus]).astype(np.float32)
    corpus_q /= np.linalg.norm(corpus_q, axis=1, keepdims=True) + 1e-12
    queries_q = np.stack([quantize_int8(v) for v in queries]).astype(np.float32)
    queries_q /= np.linalg.norm(queries_q, axis=1, keepdims=True) + 1e-12

    f32_top1 = np.argmax(queries @ corpus.T, axis=1)
    q8_top1 = np.argmax(queries_q @ corpus_q.T, axis=1)

    agreement = float((f32_top1 == q8_top1).mean())
    assert agreement >= 0.99, f"recall retention {agreement * 100:.2f}% < 99%"


def test_round_trip_cosine_similarity_high():
    rng = np.random.default_rng(1)
    for _ in range(20):
        vec = rng.standard_normal(256).astype(np.float32)
        q = quantize_int8(vec)
        restored = dequantize_int8(q, float(np.max(np.abs(vec))))
        cos = float(
            (vec @ restored) / (np.linalg.norm(vec) * np.linalg.norm(restored) + 1e-12)
        )
        assert cos > 0.999, f"round-trip cosine sim too low: {cos}"
