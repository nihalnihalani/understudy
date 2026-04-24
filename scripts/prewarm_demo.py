"""Pre-warm the demo the night before — seeds LangCache, AMS, Vector Sets, Dream Query cache.

Run against the production Redis so stage latency is entirely cache-hit. See architecture.md
§14 (Hermetic Demo Mode) — this script produces the `us:replay:{synth_id}` payloads consumed
by `DEMO_MODE=replay`.

Every key pattern in architecture.md §9 that the demo script touches appears here.
Run: `python -m scripts.prewarm_demo` or `python scripts/prewarm_demo.py`.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from understudy.memory.client import MemoryClient  # noqa: E402
from understudy.memory.langcache import LangCache, prompt_hash  # noqa: E402


# --- ANSI color helpers (no deps) --------------------------------------------
_ISATTY = sys.stdout.isatty()
_RED = "\033[31m" if _ISATTY else ""
_GREEN = "\033[32m" if _ISATTY else ""
_YELLOW = "\033[33m" if _ISATTY else ""
_RESET = "\033[0m" if _ISATTY else ""


DEMO_AGENT = "export-shopify-orders"
DEMO_SYNTH_ID = "synth-demo-001"
DEMO_RUN_ID = "run-demo-001"


# The 5 prior turns the demo agent should "remember" (architecture.md §15 beat 2:40-2:55).
SEED_TURNS: list[tuple[str, str]] = [
    ("user", "Export yesterday's Shopify orders to CSV."),
    ("agent", "Filtered orders by date=yesterday, exported 142 rows to orders.csv."),
    ("user", "Filter orders by status = fulfilled, same date range."),
    ("agent", "Exported 118 fulfilled orders to fulfilled.csv."),
    ("user", "Do the same for last 7 days."),
]


# Canned Gemini responses — the 2:30-2:40 LangCache hit demo relies on these being present.
CANNED_GEMINI: list[tuple[str, str, str]] = [
    (
        "Export yesterday's Shopify orders to CSV",
        "gemini-3-flash",
        (
            "```ts\nimport { browser } from '@tinyfish/cli';\n"
            "await browser.goto('https://admin.shopify.com/store/orders');\n"
            "await browser.filter({ date: 'yesterday' });\n"
            "await browser.exportCsv('orders.csv');\n```"
        ),
    ),
    (
        "Filter Shopify orders by status fulfilled and export CSV",
        "gemini-3-flash",
        (
            "```ts\nimport { browser } from '@tinyfish/cli';\n"
            "await browser.goto('https://admin.shopify.com/store/orders');\n"
            "await browser.filter({ status: 'fulfilled' });\n"
            "await browser.exportCsv('fulfilled.csv');\n```"
        ),
    ),
    (
        "What is the intent of the user recording from Shopify?",
        "gemini-3.1-pro",
        (
            '{"goal":"export Shopify orders filtered by date or status",'
            '"inputs":[{"name":"date_range","type":"string","default":"yesterday"}],'
            '"invariants":{"target_site":"shopify.com"}}'
        ),
    ),
]


SEED_VECTORS: list[tuple[str, str]] = [
    ("mem-001", "export yesterday shopify orders csv"),
    ("mem-002", "filter fulfilled orders export"),
    ("mem-003", "last seven days shopify orders csv"),
    ("mem-004", "shopify admin orders page navigation"),
    ("mem-005", "csv download from shopify admin"),
]


DEMO_DREAM_QUERY = {
    "desired_operation": (
        "query ExportOrders($range:String!){ shopifyOrders(dateRange:$range){ id total status } }"
    ),
    "sdl_delta": (
        "extend type Query { shopifyOrders(dateRange: String!): [Order!]! }\n"
        "type Order { id: ID! total: Money! status: OrderStatus! }"
    ),
    "validation_report": "no breaking changes vs live traffic (0/24 ops affected)",
    "subgraph_id": "shopify_agent_v1",
}


DEMO_REPLAY = {
    "synth_id": DEMO_SYNTH_ID,
    "stages": {
        "action_detection": {
            "model": "gemini-3.1-flash-lite",
            "latency_ms": 1240,
            "events": [
                {"action": "NAV", "target_description": "orders page"},
                {"action": "CLICK", "target_description": "date filter"},
                {"action": "TYPE", "text_typed": "yesterday"},
                {"action": "CLICK", "target_description": "export button"},
                {"action": "SUBMIT", "target_description": "export modal"},
            ],
        },
        "intent_abstraction": {
            "model": "gemini-3.1-pro",
            "latency_ms": 2180,
            "goal": "export Shopify orders filtered by date range to CSV",
        },
        "script_emission": {
            "model": "gemini-3-flash",
            "latency_ms": 2940,
            "script_preview": CANNED_GEMINI[0][2],
        },
    },
}


def _deterministic_embedding(text: str, dim: int = 64) -> np.ndarray:
    import hashlib

    h = hashlib.sha256(text.encode()).digest()
    raw = (h * ((dim // len(h)) + 1))[:dim]
    arr = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
    arr = (arr - 127.5) / 127.5
    norm = np.linalg.norm(arr)
    if norm > 0:
        arr = arr / norm
    return arr.astype(np.float32)


def seed_ams(mem: MemoryClient) -> None:
    mem.ams.wipe()
    for role, content in SEED_TURNS:
        mem.record_turn(role, content)


def seed_langcache(mem: MemoryClient) -> None:
    cache: LangCache = mem.langcache
    for prompt, model, response in CANNED_GEMINI:
        cache.store(prompt, model, response, agent=DEMO_AGENT)
    cache.set_policy(DEMO_AGENT, {"ttl_s": "86400", "similarity_threshold": "0.95"})


def seed_vectors(mem: MemoryClient) -> None:
    for mid, text in SEED_VECTORS:
        mem.remember_embedding(mid, _deterministic_embedding(text), summary=text)


def seed_dream(mem: MemoryClient) -> None:
    mem.store_dream_query(DEMO_RUN_ID, DEMO_DREAM_QUERY)


def seed_replay(mem: MemoryClient) -> None:
    mem.store_replay(DEMO_SYNTH_ID, DEMO_REPLAY)


# Canned per-stage Gemini responses matching the schemas the worker expects.
# Keys land at us:replay:synth-demo-001:{action_<i>,intent,script} and are read by
# `_maybe_replay` in apps/synthesis-worker/gemini_client.py — including the
# `synth-demo-001` fallback that catches every fresh upload in DEMO_MODE=replay.
_STAGE_ACTION = {
    "action": "CLICK",
    "target_description": "Orders nav link",
    "bbox": [120.0, 64.0, 200.0, 88.0],
    "text_typed": None,
    "confidence": 0.94,
}
_STAGE_INTENT = {
    "goal": "Export yesterday's Shopify orders to CSV",
    "inputs": [
        {"name": "date_range", "type": "string", "default": "yesterday"},
    ],
    "invariants": {"target_site": "shopify.com"},
    "output_schema": {"type": "file", "mime": "text/csv"},
    "steps": [
        {"intent": "navigate_to_orders", "selector_hint": "nav >> Orders"},
        {"intent": "apply_date_filter", "selector_hint": "input[name=date_range]"},
        {"intent": "export_csv", "selector_hint": "button >> Export"},
    ],
}
_STAGE_SCRIPT = {
    "script": (
        "import { tinyfish } from '@tinyfish/cli';\n"
        "export default async function run({ date_range }) {\n"
        "  const page = await tinyfish.web_browser.open("
        "'https://shopify.com/admin');\n"
        "  await page.skill('web-workflow-pack/navigate', 'Orders');\n"
        "  await page.skill('web-workflow-pack/filter_date', date_range);\n"
        "  return page.skill('web-workflow-pack/export_csv');\n"
        "}\n"
    ),
    "cosmo_sdl": "type OrderExport { id: ID! url: String! }",
    "runtime_manifest": {
        "tinyfish_products": ["web_browser", "web_fetch"],
        "redis_namespace": "ams:agent:demo",
        "insforge_tables": ["order_exports"],
    },
    "skills_pinned": [{"name": "web-workflow-pack", "version": "1.4.0"}],
}


def seed_stage_replays(mem: MemoryClient, n_action_frames: int = 16) -> int:
    """Seed per-stage replay keys the worker reads via `_maybe_replay`.

    Architecture.md §14: hermetic mode reuses one canned trace across every
    fresh upload — the gemini-client fallback rewrites the synth_id segment
    of the lookup key to `synth-demo-001` on miss.
    """
    import json as _json

    written = 0
    for i in range(n_action_frames):
        mem.r.set(
            f"us:replay:{DEMO_SYNTH_ID}:action_{i}", _json.dumps(_STAGE_ACTION)
        )
        written += 1
    mem.r.set(f"us:replay:{DEMO_SYNTH_ID}:intent", _json.dumps(_STAGE_INTENT))
    mem.r.set(f"us:replay:{DEMO_SYNTH_ID}:script", _json.dumps(_STAGE_SCRIPT))
    return written + 2


def expected_keys(agent: str) -> list[tuple[str, str]]:
    """Every key prewarm writes, labelled by category. Used by verify() / --check mode.

    Returns a list of (category, key) pairs. Category is a human-readable tag —
    the verification summary counts per category so the operator sees
    "N replay, M LangCache, K AMS" at a glance.
    """
    keys: list[tuple[str, str]] = []
    # replay payload
    keys.append(("replay", f"us:replay:{DEMO_SYNTH_ID}"))
    # dream query payload
    keys.append(("dream", f"dream:{DEMO_RUN_ID}"))
    # per-agent LangCache entries (prompt-hash keyed)
    for prompt, model, _response in CANNED_GEMINI:
        h = prompt_hash(prompt, model)
        keys.append(("langcache", f"langcache:gemini:{agent}:{h}"))
    # LangCache config for the agent
    keys.append(("langcache_config", f"langcache:config:{agent}"))
    # AMS short-term Stream (entries seeded by record_turn)
    keys.append(("ams_stm", f"ams:agent:{agent}:stm"))
    # AMS vector set (seeded by remember_embedding)
    keys.append(("vset", f"vset:agent:{agent}:memory"))
    return keys


def verify(r: Any, agent: str) -> bool:
    """Run EXISTS on every key prewarm just wrote. Prints a colored summary.

    Returns True when every key is present, False otherwise. T-minus-5 pre-pitch
    check: `python scripts/prewarm_demo.py --check` (see docs/demo-runbook.md).
    """
    keys = expected_keys(agent)
    missing: list[tuple[str, str]] = []
    counts: dict[str, int] = {}
    for category, key in keys:
        try:
            present = bool(r.exists(key))
        except Exception as exc:  # pragma: no cover — shouldn't happen in practice
            print(f"{_RED}[prewarm:verify] EXISTS {key} raised: {exc}{_RESET}")
            missing.append((category, key))
            continue
        if not present:
            missing.append((category, key))
        else:
            counts[category] = counts.get(category, 0) + 1

    if missing:
        print(f"{_RED}[prewarm:verify] MISSING {len(missing)} key(s):{_RESET}")
        for category, key in missing:
            print(f"{_RED}  - [{category}] {key}{_RESET}")
        print(
            f"{_RED}[prewarm:verify] DEMO NOT READY — rerun `python scripts/prewarm_demo.py` "
            f"before the pitch.{_RESET}"
        )
        return False

    # AMS turn count — useful stage-side signal; best-effort.
    turns = 0
    try:
        turns = int(r.xlen(f"ams:agent:{agent}:stm") or 0)
    except Exception:
        turns = 0

    print(
        f"{_GREEN}[prewarm:verify] DEMO READY — "
        f"{counts.get('replay', 0)} replay keys, "
        f"{counts.get('langcache', 0)} LangCache entries, "
        f"{turns} AMS turns seeded, "
        f"{counts.get('dream', 0)} Dream Query payload, "
        f"{counts.get('vset', 0)} Vector Set key.{_RESET}"
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--redis-url",
        default=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    )
    parser.add_argument("--agent", default=DEMO_AGENT)
    parser.add_argument("--dry-run", action="store_true", help="Print plan, do not write.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify prewarm keys exist; do not seed. Exit 1 if any key is missing.",
    )
    args = parser.parse_args()

    print(f"[prewarm] redis={args.redis_url} agent={args.agent}")

    if args.check:
        # T-minus-5 pre-pitch verification — no writes.
        import redis

        r = redis.Redis.from_url(args.redis_url)
        return 0 if verify(r, args.agent) else 1

    if args.dry_run:
        print("[prewarm] DRY RUN — would seed:")
        print(f"  - AMS: {len(SEED_TURNS)} turns")
        print(f"  - LangCache: {len(CANNED_GEMINI)} canned Gemini responses")
        print(f"  - Vector Set: {len(SEED_VECTORS)} memory embeddings")
        print(f"  - dream:{DEMO_RUN_ID}")
        print(f"  - us:replay:{DEMO_SYNTH_ID}")
        return 0

    import redis

    r = redis.Redis.from_url(args.redis_url)
    mem = MemoryClient(agent_id=args.agent, redis_client=r)

    start = time.perf_counter()
    seed_ams(mem)
    seed_langcache(mem)
    seed_vectors(mem)
    seed_dream(mem)
    seed_replay(mem)
    seed_stage_replays(mem)
    elapsed = (time.perf_counter() - start) * 1000

    # Sanity-check the dump — this is the command BizDev runs on stage.
    dump = mem.dump()
    print(
        f"[prewarm] done in {elapsed:.0f}ms: "
        f"{len(dump['recent_turns'])} turns, "
        f"{len(dump['topics'])} topics, "
        f"{len(dump['entities'])} entities, "
        f"{dump['vector_count']} vectors"
    )

    # Final verification block — EXISTS on every key we just wrote.
    ok = verify(r, args.agent)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
