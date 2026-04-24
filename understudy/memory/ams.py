"""Agent Memory Server client — short-term Stream, long-term Hash, topics Set, entities Hash.

Key patterns (architecture.md §9):
  ams:agent:{id}:stm       Stream — short-term turn buffer, capped at 20 turns (§5)
  ams:agent:{id}:ltm       Hash   — long-term episodic facts (rotated from STM)
  ams:agent:{id}:topics    Set    — auto-extracted topics
  ams:agent:{id}:entities  Hash   — auto-extracted entities (field = entity, value = JSON)

Namespace isolation: the only way this class touches Redis is through keys produced by
`_key(agent_id, suffix)` — a client constructed for agent A CANNOT read agent B's keys.
Enforced by tests/test_ams_namespace.py.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from understudy.memory.extract import Extraction, extract
from understudy.memory.schema import EntityRecord, LTMRecord, MemoryTurn, TopicSet

STM_CAP = 20  # architecture.md §5 — short-term buffer cap; older turns rotate to LTM.


class AgentMemoryServer:
    """Namespaced AMS client for a single agent id.

    One instance per agent. All keys this instance writes are prefixed with
    `ams:agent:{agent_id}:` — there is no method that accepts a different id.
    """

    def __init__(
        self,
        redis_client: Any,
        agent_id: str,
        *,
        gemini_client: Any | None = None,
        stm_cap: int = STM_CAP,
    ) -> None:
        if not agent_id or ":" in agent_id or "*" in agent_id:
            raise ValueError(f"invalid agent_id: {agent_id!r}")
        self.r = redis_client
        self.agent_id = agent_id
        self.gemini_client = gemini_client
        self.stm_cap = stm_cap

    def _key(self, suffix: str) -> str:
        return f"ams:agent:{self.agent_id}:{suffix}"

    # --- writes ---------------------------------------------------------------

    def append_turn(self, turn: MemoryTurn) -> str:
        if turn.agent_id != self.agent_id:
            raise ValueError(
                f"turn.agent_id={turn.agent_id!r} does not match client agent_id={self.agent_id!r}"
            )
        entry = {
            "role": turn.role,
            "content": turn.content,
            "ts": turn.ts.isoformat(),
            "meta": json.dumps(turn.meta),
        }
        stream_id = self.r.xadd(
            self._key("stm"), entry, maxlen=self.stm_cap, approximate=False
        )
        sid = stream_id.decode() if isinstance(stream_id, bytes) else str(stream_id)

        extraction = extract(turn.content, self.gemini_client)
        if extraction.topics:
            self.r.sadd(self._key("topics"), *extraction.topics)
        for ent, etype in extraction.entities:
            self._bump_entity(ent, etype)

        self._maybe_rotate_to_ltm()
        return sid

    def _bump_entity(self, entity: str, etype: str) -> None:
        key = self._key("entities")
        existing = self.r.hget(key, entity)
        if existing:
            try:
                rec = json.loads(
                    existing.decode() if isinstance(existing, bytes) else existing
                )
                rec["hits"] = int(rec.get("hits", 0)) + 1
            except (ValueError, TypeError):
                rec = {"type": etype, "hits": 1}
        else:
            rec = {"type": etype, "hits": 1}
        self.r.hset(key, entity, json.dumps(rec))

    def _maybe_rotate_to_ltm(self) -> None:
        key = self._key("stm")
        length = self.r.xlen(key)
        if length < self.stm_cap:
            return
        # Stream MAXLEN already trimmed; capture the oldest entry as an LTM summary
        # before the trim took effect on the *next* write. Here we just seed a summary
        # from the current tail when the buffer has wrapped once.
        oldest = self.r.xrange(key, count=1)
        if not oldest:
            return
        _, fields = oldest[0]
        decoded = {
            (k.decode() if isinstance(k, bytes) else k): (
                v.decode() if isinstance(v, bytes) else v
            )
            for k, v in fields.items()
        }
        fact_id = str(uuid.uuid4())
        record = LTMRecord(
            agent_id=self.agent_id,
            fact_id=fact_id,
            summary=decoded.get("content", "")[:280],
            topics=list(self.get_topics().topics),
            entities=[e.entity for e in self.list_entities()],
        )
        self.r.hset(self._key("ltm"), fact_id, record.model_dump_json())

    # --- reads ----------------------------------------------------------------

    def recent_turns(self, limit: int = 20) -> list[MemoryTurn]:
        raw = self.r.xrevrange(self._key("stm"), count=limit)
        out: list[MemoryTurn] = []
        for _sid, fields in raw:
            d = {
                (k.decode() if isinstance(k, bytes) else k): (
                    v.decode() if isinstance(v, bytes) else v
                )
                for k, v in fields.items()
            }
            try:
                meta = json.loads(d.get("meta") or "{}")
            except json.JSONDecodeError:
                meta = {}
            out.append(
                MemoryTurn(
                    agent_id=self.agent_id,
                    role=d.get("role", "user"),  # type: ignore[arg-type]
                    content=d.get("content", ""),
                    meta=meta,
                )
            )
        return out

    def get_topics(self) -> TopicSet:
        raw = self.r.smembers(self._key("topics")) or set()
        topics = sorted(
            t.decode() if isinstance(t, bytes) else str(t) for t in raw
        )
        return TopicSet(agent_id=self.agent_id, topics=topics)

    def list_entities(self) -> list[EntityRecord]:
        raw = self.r.hgetall(self._key("entities")) or {}
        out: list[EntityRecord] = []
        for k, v in raw.items():
            name = k.decode() if isinstance(k, bytes) else str(k)
            try:
                rec = json.loads(v.decode() if isinstance(v, bytes) else v)
            except (json.JSONDecodeError, AttributeError):
                continue
            out.append(
                EntityRecord(
                    agent_id=self.agent_id,
                    entity=name,
                    entity_type=rec.get("type", "MISC"),
                    hits=int(rec.get("hits", 1)),
                )
            )
        return out

    def ltm_records(self) -> list[LTMRecord]:
        raw = self.r.hgetall(self._key("ltm")) or {}
        out: list[LTMRecord] = []
        for _fid, v in raw.items():
            payload = v.decode() if isinstance(v, bytes) else v
            try:
                out.append(LTMRecord.model_validate_json(payload))
            except Exception:
                continue
        return out

    # --- housekeeping ---------------------------------------------------------

    def wipe(self) -> None:
        """Delete all keys for this agent. Used by prewarm + tests."""
        for suffix in ("stm", "ltm", "topics", "entities"):
            self.r.delete(self._key(suffix))

    def seed_extraction(self, text: str) -> Extraction:
        """Run extractor + write topics/entities without touching the STM stream."""
        e = extract(text, self.gemini_client)
        if e.topics:
            self.r.sadd(self._key("topics"), *e.topics)
        for ent, etype in e.entities:
            self._bump_entity(ent, etype)
        return e
