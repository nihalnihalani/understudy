# Prompt — Intent Abstraction (Gemini 3.1 Pro)

Mirrors architecture.md §10(b). Consumes the action trace emitted by Flash-Lite.

- **Model:** `gemini-3.1-pro` (pinned in `understudy/models.py` — `GEMINI_INTENT_ABSTRACTION`)
- **`thinking_level`:** `high`
- **`response_mime_type`:** `application/json`

## System prompt (verbatim)

```
You infer user goals from low-level UI event streams.
Given an ordered action trace, infer GOAL, INPUTS that vary
per run, INVARIANTS that are fixed, and a structured OUTPUT.
Favor generality: "Order #1042" -> "most recent order".
```

## User content shape

```
events=[...], dom_snapshots=[...], page_titles=[...]
```

## Output JSON schema (verbatim from architecture.md §10b)

```json
{
  "goal": "string",
  "inputs": [{"name": "date_range", "type": "string", "default": "yesterday"}],
  "invariants": {"target_site": "shopify.com"},
  "output_schema": {},
  "steps": [{"intent": "navigate_to_orders", "selector_hint": "nav >> Orders"}]
}
```

## Example input

```json
{
  "events": [
    {"action": "NAV",    "target_description": "admin orders page", "frame_index": 0},
    {"action": "CLICK",  "target_description": "Filters button",    "frame_index": 2},
    {"action": "TYPE",   "target_description": "Date range input",  "text_typed": "yesterday", "frame_index": 4},
    {"action": "CLICK",  "target_description": "Export CSV button", "frame_index": 6}
  ],
  "dom_snapshots": [
    {"url": "https://admin.shopify.com/orders", "title": "Orders · Shopify"}
  ],
  "page_titles": ["Orders · Shopify"]
}
```

## Example output

```json
{
  "goal": "Export Shopify orders CSV filtered by a user-provided date range",
  "inputs": [
    {"name": "date_range", "type": "string", "default": "yesterday"}
  ],
  "invariants": {
    "target_site": "admin.shopify.com",
    "export_format": "csv"
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "csv_url": {"type": "string"},
      "row_count": {"type": "integer"}
    }
  },
  "steps": [
    {"intent": "navigate_to_orders",  "selector_hint": "nav >> Orders"},
    {"intent": "open_filters",        "selector_hint": "button >> Filters"},
    {"intent": "set_date_range",      "selector_hint": "input[aria-label='Date range']"},
    {"intent": "export_csv",          "selector_hint": "button >> Export"}
  ]
}
```

## Rationale for `thinking_level: high`

This is the one stage in the pipeline where deep reasoning matters: the model has to generalize from a brittle literal trace ("clicked the button at (720, 96)") to an abstract goal ("export orders for a user-picked date range"). That leap benefits directly from Pro's 71% SWE-bench complex-reasoning score and from `high` thinking. Using anything cheaper here results in agents that overfit to the captured literal values — the very v1 bug this stage exists to fix.

## Why Pro, not Flash

3.1 Pro wins on messy, multi-step reasoning over heterogeneous event streams. This is the only step in the pipeline where Pro beats Flash (architecture.md §11). We deliberately do NOT use 3 Flash here even though it is cheaper, because Flash's 78% SWE-bench edge is on coding specifically, not on abstraction.
