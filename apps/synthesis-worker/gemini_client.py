"""Gemini client wrapper with LangCache, DEMO_MODE, and InsForge Model Gateway fallback.

All three pipeline stages route through `call_gemini_json()` / `call_gemini_tool()`.
This keeps policy (cache, replay, fallback, signature-retry) in one place.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import httpx

try:  # Lazy import so tests / fixture-driven runs don't require google-genai at import time.
    from google import genai  # type: ignore[import-untyped]
    from google.genai import types as genai_types  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - SDK is in pyproject.toml but may be absent in CI shim
    genai = None
    genai_types = None

try:
    from .langcache import LangCache
except ImportError:  # pragma: no cover — sys.path-injected flat import
    from langcache import LangCache  # type: ignore[no-redef]

log = logging.getLogger(__name__)

# --- Env-driven config ---------------------------------------------------------------
DEMO_MODE = os.environ.get("DEMO_MODE", "live").lower()  # live | replay | hybrid
MODEL_GATEWAY_URL = os.environ.get("MODEL_GATEWAY_URL", "")  # InsForge fallback (architecture.md §13)
HYBRID_LIVE_BUDGET_S = float(os.environ.get("HYBRID_LIVE_BUDGET_S", "8.0"))


class GeminiRateLimitError(RuntimeError):
    """Raised when Google returns 429. Caller should route via InsForge Model Gateway."""


class ThoughtSignatureMismatchError(RuntimeError):
    """Gemini 3.x stricter signature validation rejected the tool call.

    Mitigation per architecture.md §13: re-issue with explicit signature.
    """


class GeminiClient:
    """Thin wrapper around `google-genai` with our policy layered on top."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        langcache: LangCache | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY", "")
        self.langcache = langcache
        self._client = None
        if genai is not None and self.api_key:
            self._client = genai.Client(api_key=self.api_key)

    # --- public API --------------------------------------------------------------
    async def call_json(
        self,
        *,
        model: str,
        thinking_level: str,
        system: str,
        user_parts: list[dict[str, Any]],
        response_schema: dict[str, Any] | None = None,
        replay_key: str | None = None,
        redis: Any = None,
    ) -> dict[str, Any]:
        """JSON-mode call (Flash-Lite action detection, Pro intent abstraction)."""
        messages = {
            "model": model,
            "thinking_level": thinking_level,
            "system": system,
            "user_parts": user_parts,
            "response_schema": response_schema,
        }

        replayed = await self._maybe_replay(replay_key, redis)
        if replayed is not None:
            return replayed

        async def live() -> dict[str, Any]:
            return await self._execute_with_fallback(
                kind="json",
                model=model,
                thinking_level=thinking_level,
                system=system,
                user_parts=user_parts,
                response_schema=response_schema,
            )

        return await self._hybrid_or_live(messages, live)

    async def call_tool(
        self,
        *,
        model: str,
        thinking_level: str,
        system: str,
        user_parts: list[dict[str, Any]],
        tool_declaration: dict[str, Any],
        replay_key: str | None = None,
        redis: Any = None,
    ) -> dict[str, Any]:
        """Tool-call mode (Flash script emission — `emit_tinyfish_script`)."""
        messages = {
            "model": model,
            "thinking_level": thinking_level,
            "system": system,
            "user_parts": user_parts,
            "tool_declaration": tool_declaration,
        }

        replayed = await self._maybe_replay(replay_key, redis)
        if replayed is not None:
            return replayed

        async def live() -> dict[str, Any]:
            return await self._execute_with_fallback(
                kind="tool",
                model=model,
                thinking_level=thinking_level,
                system=system,
                user_parts=user_parts,
                tool_declaration=tool_declaration,
            )

        return await self._hybrid_or_live(messages, live)

    # --- policy layers -----------------------------------------------------------
    async def _hybrid_or_live(
        self, messages: dict[str, Any], live_fn: Any
    ) -> dict[str, Any]:
        """Apply LangCache + DEMO_MODE=hybrid timeout + live call.

        `hybrid`: race live call against HYBRID_LIVE_BUDGET_S; if it overruns, we rely on
        LangCache having been prewarmed (architecture.md §14 "live for 8s then replay").
        """
        if self.langcache is not None:
            value, hit = await self.langcache.cached_call(messages, live_fn)
            if hit:
                log.info("gemini cache hit model=%s", messages.get("model"))
            return value

        if DEMO_MODE == "hybrid":
            try:
                return await asyncio.wait_for(live_fn(), timeout=HYBRID_LIVE_BUDGET_S)
            except asyncio.TimeoutError:
                raise RuntimeError(
                    "hybrid demo mode timed out and no LangCache configured for replay"
                )
        return await live_fn()

    @staticmethod
    async def _maybe_replay(replay_key: str | None, redis: Any) -> dict[str, Any] | None:
        """Short-circuit to `us:replay:{synth_id}` when DEMO_MODE=replay."""
        if DEMO_MODE != "replay" or replay_key is None or redis is None:
            return None
        raw = await redis.get(replay_key)
        if not raw:
            log.warning("DEMO_MODE=replay but key missing: %s", replay_key)
            return None
        log.info("replay hit: %s", replay_key)
        return json.loads(raw)

    async def _execute_with_fallback(
        self,
        *,
        kind: str,
        model: str,
        thinking_level: str,
        system: str,
        user_parts: list[dict[str, Any]],
        response_schema: dict[str, Any] | None = None,
        tool_declaration: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Google first; on 429 fall back to InsForge Model Gateway.

        Signature-mismatch retry runs inside `_call_google` (architecture.md §13 row).
        """
        try:
            return await self._call_google(
                kind=kind,
                model=model,
                thinking_level=thinking_level,
                system=system,
                user_parts=user_parts,
                response_schema=response_schema,
                tool_declaration=tool_declaration,
            )
        except GeminiRateLimitError:
            log.warning("Gemini 429 on %s — routing via InsForge Model Gateway", model)
            return await self._call_insforge_gateway(
                kind=kind,
                model=model,
                thinking_level=thinking_level,
                system=system,
                user_parts=user_parts,
                response_schema=response_schema,
                tool_declaration=tool_declaration,
            )

    async def _call_google(
        self,
        *,
        kind: str,
        model: str,
        thinking_level: str,
        system: str,
        user_parts: list[dict[str, Any]],
        response_schema: dict[str, Any] | None,
        tool_declaration: dict[str, Any] | None,
        signature: str | None = None,
    ) -> dict[str, Any]:
        if self._client is None or genai_types is None:
            raise RuntimeError(
                "google-genai SDK unavailable — set GOOGLE_API_KEY and install deps, "
                "or use DEMO_MODE=replay."
            )

        config: dict[str, Any] = {
            "system_instruction": system,
            "thinking_config": {"thinking_level": thinking_level},
        }
        if kind == "json":
            config["response_mime_type"] = "application/json"
            if response_schema is not None:
                config["response_schema"] = response_schema
        elif kind == "tool":
            config["tools"] = [tool_declaration]

        if signature is not None:
            config["thought_signature"] = signature

        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=model,
                contents=user_parts,
                config=config,
            )
        except Exception as exc:  # noqa: BLE001 — SDK surface varies
            msg = str(exc)
            if "429" in msg or "rate" in msg.lower():
                raise GeminiRateLimitError(msg) from exc
            if "signature" in msg.lower() and signature is None:
                log.info("retrying with explicit thought-signature per architecture.md §13")
                return await self._call_google(
                    kind=kind,
                    model=model,
                    thinking_level=thinking_level,
                    system=system,
                    user_parts=user_parts,
                    response_schema=response_schema,
                    tool_declaration=tool_declaration,
                    signature="explicit-retry",
                )
            raise

        return _parse_gemini_response(response, kind=kind)

    async def _call_insforge_gateway(
        self,
        *,
        kind: str,
        model: str,
        thinking_level: str,
        system: str,
        user_parts: list[dict[str, Any]],
        response_schema: dict[str, Any] | None,
        tool_declaration: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """InsForge Model Gateway routes to Anthropic/Grok on Gemini 429 (architecture.md §13).

        We leave this as an HTTP-only shim — InsForge integration is owned elsewhere.
        """
        if not MODEL_GATEWAY_URL:
            raise RuntimeError("MODEL_GATEWAY_URL not configured; cannot fall back")

        payload = {
            "model": model,
            "thinking_level": thinking_level,
            "system": system,
            "user_parts": user_parts,
            "response_schema": response_schema,
            "tool_declaration": tool_declaration,
            "kind": kind,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(MODEL_GATEWAY_URL, json=payload)
            resp.raise_for_status()
            return resp.json()


def _parse_gemini_response(response: Any, *, kind: str) -> dict[str, Any]:
    """Extract structured payload from a google-genai response envelope."""
    if kind == "json":
        text = getattr(response, "text", None)
        if text is None and hasattr(response, "candidates"):
            text = response.candidates[0].content.parts[0].text
        return json.loads(text) if isinstance(text, str) else text

    # tool call path
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        parts = getattr(cand.content, "parts", [])
        for part in parts:
            fn = getattr(part, "function_call", None)
            if fn is not None:
                args = getattr(fn, "args", {})
                if hasattr(args, "to_dict"):
                    return dict(args.to_dict())
                return dict(args)
    raise RuntimeError("no function_call in Gemini tool response")
