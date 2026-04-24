"""In-process mock implementations of the adapter protocols.

Lives next to `adapters.py` (imported as `apps.api.adapters_mock`) because Python doesn't
let a module and a subpackage share a name. Returns plausible, ER-shaped fixtures so the
API can be exercised end-to-end without Gemini / Cosmo / Chainguard credentials.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from understudy.models import (
    GEMINI_ACTION_DETECTION,
    GEMINI_INTENT_ABSTRACTION,
    GEMINI_SCRIPT_EMISSION,
)


class MockSynthesisClient:
    """Returns canned responses shaped like architecture.md §10 output schemas."""

    async def detect_actions(self, frames: list[bytes]) -> list[dict[str, Any]]:
        return [
            {
                "model": GEMINI_ACTION_DETECTION,
                "action": "CLICK",
                "target_description": "Orders nav link",
                "bbox": [120, 64, 200, 88],
                "text_typed": None,
                "confidence": 0.97,
            },
            {
                "model": GEMINI_ACTION_DETECTION,
                "action": "TYPE",
                "target_description": "date filter input",
                "bbox": [300, 140, 520, 176],
                "text_typed": "yesterday",
                "confidence": 0.93,
            },
        ]

    async def abstract_intent(
        self, events: list[dict[str, Any]], dom_snapshots: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return {
            "model": GEMINI_INTENT_ABSTRACTION,
            "goal": "Export yesterday's orders as CSV",
            "inputs": [{"name": "date_range", "type": "string", "default": "yesterday"}],
            "invariants": {"target_site": "shopify.com"},
            "output_schema": {"type": "file", "mime": "text/csv"},
            "steps": [
                {"intent": "navigate_to_orders", "selector_hint": "nav >> Orders"},
                {"intent": "apply_date_filter", "selector_hint": "input[name=date_range]"},
                {"intent": "export_csv", "selector_hint": "button >> Export"},
            ],
        }

    async def emit_script(self, intent: dict[str, Any]) -> dict[str, Any]:
        return {
            "model": GEMINI_SCRIPT_EMISSION,
            "script": (
                "import { tinyfish } from '@tinyfish/cli';\n"
                "export default async function run({ date_range }) {\n"
                "  const page = await tinyfish.web_browser.open('https://shopify.com/admin');\n"
                "  await page.skill('web-workflow-pack/navigate', 'Orders');\n"
                "  await page.skill('web-workflow-pack/filter_date', date_range);\n"
                "  return page.skill('web-workflow-pack/export_csv');\n"
                "}\n"
            ),
            "cosmo_sdl": "type OrderExport { id: ID! url: String! }",
            "runtime_manifest": {
                "tinyfish_products": ["web_browser", "web_fetch"],
                "redis_namespace": "ams:agent:mock",
                "insforge_tables": ["order_exports"],
            },
            "skills_pinned": [{"name": "web-workflow-pack", "version": "1.4.0"}],
        }


class MockCosmoDreamClient:
    """Returns a Dream Query result shaped like architecture.md §4."""

    async def dream_query(self, desired_operation: str) -> dict[str, Any]:
        return {
            "sdl_delta": (
                "extend type Query {\n"
                "  orderExport(dateRange: String!): OrderExport!\n"
                "}\n"
            ),
            "validation_report": "no breaking changes vs live client traffic",
            "subgraph_id": f"sg_{uuid4().hex[:12]}",
        }


class MockSignerClient:
    """Returns a fake SLSA L2 predicate + cosign sig (architecture.md §6)."""

    async def sign(self, image_digest: str) -> dict[str, Any]:
        return {
            "cosign_sig": f"MEUCIQD{uuid4().hex}",
            "slsa_predicate": {
                "predicateType": "https://slsa.dev/provenance/v1",
                "builder": {"id": "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml"},
                "buildType": "https://slsa.dev/container-based-build/v0.1",
                "materials": [{"uri": f"pkg:oci/{image_digest}", "digest": {"sha256": image_digest}}],
            },
            "sbom": {"format": "spdx-json", "generation_time": datetime.now(timezone.utc).isoformat()},
            "rekor_log_index": 9_000_000 + hash(image_digest) % 1_000_000,
        }

    async def verify(self, image_digest: str) -> bool:
        return True
