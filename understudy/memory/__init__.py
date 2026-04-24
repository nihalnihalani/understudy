"""Redis 8 memory substrate for Understudy.

Implements the key-space from architecture.md §9: Agent Memory Server (short-term Stream,
long-term Hash, topics Set, entities Hash), int8 Vector Sets for recall, LangCache for
Gemini semantic cache, and the hermetic-demo replay keys.

Every generated agent imports `MemoryClient` from here — it is the single Redis boundary
for the agent runtime and the synthesis worker.
"""

from understudy.memory.ams import AgentMemoryServer
from understudy.memory.client import MemoryClient
from understudy.memory.langcache import LangCache, gemini_cached
from understudy.memory.schema import (
    CacheHit,
    EntityRecord,
    MemoryTurn,
    RecallResult,
    TopicSet,
)
from understudy.memory.vector import VectorSets, quantize_int8

__all__ = [
    "AgentMemoryServer",
    "CacheHit",
    "EntityRecord",
    "LangCache",
    "MemoryClient",
    "MemoryTurn",
    "RecallResult",
    "TopicSet",
    "VectorSets",
    "gemini_cached",
    "quantize_int8",
]
