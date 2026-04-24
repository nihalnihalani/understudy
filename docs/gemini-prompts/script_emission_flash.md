# Prompt — Script Emission (Gemini 3 Flash)

Mirrors architecture.md §10(c) and §11. Emits the final TinyFish CLI script + Cosmo SDL + runtime manifest.

- **Model:** `gemini-3-flash` (pinned in `understudy/models.py`)
- **`thinking_level`:** `medium`
- **`response_mime_type`:** `text/x-typescript`
- **Why this model, not 3.1 Pro:** 78% SWE-bench Verified vs Pro's 71%, cheaper ($0.50/$3 per 1M), lower latency. For code emission specifically, 3 Flash dominates (architecture.md §11).

## Tool call

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

## Notes

- Skill versions get pinned at synthesis time — drift is caught by the runtime manifest (architecture.md §13 "TinyFish Skill version drift").
- On validation failure, re-emit rather than fall back to Pro — retry loop stays in 3 Flash per the cost/latency argument in architecture.md §11.
