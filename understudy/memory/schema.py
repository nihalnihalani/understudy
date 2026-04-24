"""Pydantic models for the memory substrate.

Mirrors the key patterns in architecture.md §9 as typed records.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MemoryTurn(BaseModel):
    """One short-term turn appended to `ams:agent:{id}:stm` Stream."""

    agent_id: str
    role: Literal["user", "agent", "tool"]
    content: str
    ts: datetime = Field(default_factory=_utcnow)
    meta: dict[str, Any] = Field(default_factory=dict)


class TopicSet(BaseModel):
    """Auto-extracted topics written to `ams:agent:{id}:topics` Set."""

    agent_id: str
    topics: list[str]


class EntityRecord(BaseModel):
    """Auto-extracted entities written to `ams:agent:{id}:entities` Hash.

    Hash field = canonical entity string, value = JSON with type + last-seen ts + hit count.
    """

    agent_id: str
    entity: str
    entity_type: Literal["PERSON", "ORG", "GPE", "PRODUCT", "MONEY", "DATE", "MISC"]
    last_seen: datetime = Field(default_factory=_utcnow)
    hits: int = 1


class LTMRecord(BaseModel):
    """Long-term episodic fact in `ams:agent:{id}:ltm` Hash."""

    agent_id: str
    fact_id: str
    summary: str
    rotated_from_stm_at: datetime = Field(default_factory=_utcnow)
    topics: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)


class CacheHit(BaseModel):
    """LangCache hit record returned from `langcache:gemini:{hash}`."""

    prompt_hash: str
    model: str
    response: str
    similarity: float
    latency_ms: float


class RecallResult(BaseModel):
    """Vector-Set recall record from `vset:agent:{id}:memory`."""

    agent_id: str
    memory_id: str
    score: float
    summary: str
