"""Auto topic + entity extraction used on every AMS write (architecture.md §9).

Preference order:
  1. spaCy if the model is loaded (fast, offline).
  2. Gemini 3.1 Flash-Lite one-shot JSON extraction as fallback.
  3. Regex heuristic as last resort (keeps tests hermetic).

The extractor is intentionally synchronous + cheap — it runs on the AMS write hot path.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


_ENTITY_RE = re.compile(r"\b([A-Z][a-zA-Z0-9&.\-]+(?:\s+[A-Z][a-zA-Z0-9&.\-]+){0,3})\b")
_MONEY_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?")
_DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b"
)
_STOP = {
    "The", "This", "That", "These", "Those", "There", "When", "Where", "What",
    "Why", "How", "And", "Or", "But", "If", "Then", "Else", "A", "An",
}


@dataclass
class Extraction:
    topics: list[str]
    entities: list[tuple[str, str]]  # (entity, type)


def _regex_extract(text: str) -> Extraction:
    entities: list[tuple[str, str]] = []
    seen: set[str] = set()

    for m in _MONEY_RE.finditer(text):
        v = m.group(0).strip()
        if v not in seen:
            entities.append((v, "MONEY"))
            seen.add(v)

    for m in _DATE_RE.finditer(text):
        v = m.group(0).strip()
        if v not in seen:
            entities.append((v, "DATE"))
            seen.add(v)

    for m in _ENTITY_RE.finditer(text):
        v = m.group(1).strip()
        if v in _STOP or v in seen:
            continue
        etype = (
            "ORG" if any(s in v for s in ("Inc", "LLC", "Corp", "Shopify", "GraphQL"))
            else "PRODUCT" if any(s in v for s in ("API", "CLI", "SDK"))
            else "MISC"
        )
        entities.append((v, etype))
        seen.add(v)

    # Topics = noun-phrase-ish lowercase tokens longer than 3 chars, dedup, capped.
    words = [w.lower().strip(".,!?;:") for w in text.split()]
    topic_candidates = [w for w in words if len(w) > 3 and w.isalpha()]
    topics: list[str] = []
    topic_seen: set[str] = set()
    for w in topic_candidates:
        if w in topic_seen or w in {"this", "that", "with", "from", "have", "will"}:
            continue
        topic_seen.add(w)
        topics.append(w)
        if len(topics) >= 16:
            break

    return Extraction(topics=topics, entities=entities)


def _spacy_extract(text: str) -> Extraction | None:
    try:
        import spacy  # type: ignore
    except ImportError:
        return None
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        return None
    doc = nlp(text)
    entities: list[tuple[str, str]] = []
    for ent in doc.ents:
        label = ent.label_ if ent.label_ in {
            "PERSON", "ORG", "GPE", "PRODUCT", "MONEY", "DATE"
        } else "MISC"
        entities.append((ent.text, label))
    topics = list({chunk.text.lower() for chunk in doc.noun_chunks if len(chunk.text) > 3})
    return Extraction(topics=topics[:16], entities=entities)


def _gemini_extract(text: str, gemini_client: Any | None) -> Extraction | None:
    if gemini_client is None:
        return None
    prompt = (
        "Extract topics (noun phrases) and named entities from the text. "
        'Return JSON: {"topics":[...],"entities":[{"text":"...","type":"PERSON|ORG|GPE|PRODUCT|MONEY|DATE|MISC"}]}. '
        f"TEXT: {text}"
    )
    try:
        resp = gemini_client.generate(
            prompt,
            model="gemini-3.1-flash-lite",
            response_mime_type="application/json",
            thinking_level="minimal",
        )
        data = json.loads(resp)
    except Exception:
        return None
    return Extraction(
        topics=[t for t in data.get("topics", []) if isinstance(t, str)][:16],
        entities=[
            (e["text"], e.get("type", "MISC"))
            for e in data.get("entities", [])
            if isinstance(e, dict) and "text" in e
        ],
    )


def extract(text: str, gemini_client: Any | None = None) -> Extraction:
    """Run the preferred extractor, falling back in order. Always returns a result."""
    return (
        _spacy_extract(text)
        or _gemini_extract(text, gemini_client)
        or _regex_extract(text)
    )
