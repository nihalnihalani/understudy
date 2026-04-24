# Prompt — Script Emission (Gemini 3 Flash)

Mirrors architecture.md §10(c) and §11. Emits the final TinyFish CLI script + Cosmo SDL + runtime manifest.

- **Model:** `gemini-3-flash` (pinned in `understudy/models.py` — `GEMINI_SCRIPT_EMISSION`)
- **`thinking_level`:** `medium`
- **`response_mime_type`:** `text/x-typescript` (informational; the actual response is a tool call)
- **Why this model, not 3.1 Pro:** 78% SWE-bench Verified vs Pro's 71%, cheaper ($0.50 / $3 per 1M), lower latency. For code emission specifically, 3 Flash dominates (architecture.md §11).

## System prompt (worker)

```
You emit production-grade TinyFish CLI TypeScript for the given intent spec.
Call `emit_tinyfish_script` exactly once with the script, Cosmo SDL, runtime
manifest, and pinned TinyFish Skills. Prefer Skill primitives over inline
selectors; TinyFish resolves selector_hint → accessibility tree at runtime.
```

## Tool call (verbatim from architecture.md §10c)

The model responds with exactly one `emit_tinyfish_script` tool call:

```json
{
  "model": "gemini-3-flash",
  "thinking_level": "medium",
  "tools": [{"function_declarations": [
    {
      "name": "emit_tinyfish_script",
      "description": "Emit a TinyFish CLI script with pinned Agent Skills for the intent spec",
      "parameters": {
        "type": "object",
        "required": ["script", "cosmo_sdl", "runtime_manifest", "skills_pinned"],
        "properties": {
          "script": {"type": "string", "description": "TypeScript for @tinyfish/cli v2+"},
          "cosmo_sdl": {"type": "string", "description": "GraphQL SDL from Dream Query"},
          "runtime_manifest": {
            "type": "object",
            "properties": {
              "tinyfish_products": {"type": "array", "items": {"enum": ["web_agent", "web_search", "web_fetch", "web_browser"]}},
              "redis_namespace": {"type": "string"},
              "insforge_tables": {"type": "array", "items": {"type": "string"}}
            }
          },
          "skills_pinned": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {"name": {"type": "string"}, "version": {"type": "string"}}
            }
          }
        }
      }
    }
  ]}]
}
```

## Example input

Intent spec from the Pro stage (Shopify orders export):

```json
{
  "goal": "Export Shopify orders CSV filtered by a user-provided date range",
  "inputs": [{"name": "date_range", "type": "string", "default": "yesterday"}],
  "invariants": {"target_site": "admin.shopify.com", "export_format": "csv"},
  "output_schema": {"type": "object", "properties": {"csv_url": {"type": "string"}, "row_count": {"type": "integer"}}},
  "steps": [
    {"intent": "navigate_to_orders",  "selector_hint": "nav >> Orders"},
    {"intent": "open_filters",        "selector_hint": "button >> Filters"},
    {"intent": "set_date_range",      "selector_hint": "input[aria-label='Date range']"},
    {"intent": "export_csv",          "selector_hint": "button >> Export"}
  ]
}
```

## Example tool-call arguments

```json
{
  "script": "import { agent, skill } from '@tinyfish/cli';\n\nexport default agent({\n  name: 'shopify-orders-export',\n  inputs: { date_range: { type: 'string', default: 'yesterday' } },\n  async run({ input, browser }) {\n    await browser.navigate('https://admin.shopify.com/orders');\n    await skill('open-filters').run(browser);\n    await skill('set-date-range').run(browser, { value: input.date_range });\n    const csv = await skill('export-csv').run(browser);\n    return { csv_url: csv.url, row_count: csv.rows };\n  }\n});\n",
  "cosmo_sdl": "type Query { run(input: RunInput!): RunResult! }\ninput RunInput { date_range: String = \"yesterday\" }\ntype RunResult { csv_url: String!, row_count: Int! }\n",
  "runtime_manifest": {
    "tinyfish_products": ["web_agent", "web_browser"],
    "redis_namespace": "ams:agent:shopify-orders-export",
    "insforge_tables": ["agent_runs", "agent_memories"]
  },
  "skills_pinned": [
    {"name": "open-filters",   "version": "1.2.0"},
    {"name": "set-date-range", "version": "1.4.1"},
    {"name": "export-csv",     "version": "2.0.0"}
  ]
}
```

## Rationale for `thinking_level: medium`

Code emission for an intent we have *already* abstracted is a medium-reasoning task: the structural choices are made (steps + inputs + output schema); this stage is translation, not invention. `medium` is the sweet spot — `low` shows up as subtly wrong TypeScript, `high` burns ~2x the latency for no measurable quality win given 3 Flash's 78% SWE-bench floor.

## Notes

- Skill versions get pinned at synthesis time — drift is caught by the runtime manifest (architecture.md §13 "TinyFish Skill version drift").
- On validation failure, re-emit rather than fall back to Pro — retry loop stays in 3 Flash per the cost/latency argument in architecture.md §11. The 78% number is only earned if we actually pin 3 Flash for code emission.
- `cosmo_sdl` is populated by the Cosmo Dream Query driver at a later stage when available. When `COSMO_MOCK=1`, the worker accepts whatever Gemini returns and the cosmo-engineer patches it up post-hoc (architecture.md §14 fallback behavior).
