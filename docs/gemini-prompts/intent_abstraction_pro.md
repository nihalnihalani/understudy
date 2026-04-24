# Prompt — Intent Abstraction (Gemini 3.1 Pro)

Mirrors architecture.md §10(b). Consumes the action trace emitted by Flash-Lite.

- **Model:** `gemini-3.1-pro` (pinned in `understudy/models.py`)
- **`thinking_level`:** `high`
- **`response_mime_type`:** `application/json`

## Prompt body

```
SYSTEM: You infer user goals from low-level UI event streams.
       Given an ordered action trace, infer GOAL, INPUTS that vary
       per run, INVARIANTS that are fixed, and a structured OUTPUT.
       Favor generality: "Order #1042" -> "most recent order".
USER: events=[...], dom_snapshots=[...], page_titles=[...]
TOOLS: set_goal(), set_tool_surface(), set_pre_conditions()
```

## Output schema

```json
{
  "goal": "string",
  "inputs": [{"name": "date_range", "type": "string", "default": "yesterday"}],
  "invariants": {"target_site": "shopify.com"},
  "output_schema": {},
  "steps": [{"intent": "navigate_to_orders", "selector_hint": "nav >> Orders"}]
}
```

## Why Pro, not Flash

3.1 Pro wins on messy, multi-step reasoning over heterogeneous event streams. This is the one step in the pipeline where Pro beats Flash (architecture.md §11).
