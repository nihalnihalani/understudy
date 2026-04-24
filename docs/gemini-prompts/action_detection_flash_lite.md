# Prompt — Action Detection (Gemini 3.1 Flash-Lite)

Mirrors architecture.md §10(a). The synthesis worker loads this prompt verbatim and feeds it keyframe pairs.

- **Model:** `gemini-3.1-flash-lite` (pinned in `understudy/models.py` — `GEMINI_ACTION_DETECTION`)
- **`thinking_level`:** `minimal`
- **`response_mime_type`:** `application/json`
- **Input:** two consecutive scene-change keyframes (PNG) + DOM diff.
- **Tool surface:** `emit_event(event_type, selector, value, confidence)` — referenced in the prompt for tool-call style responses; our worker uses JSON-mode responses with the same shape.

## System prompt (verbatim)

```
You are a frame-level UI event detector.
```

## User content shape (per pair)

- `inline_data` (PNG): frame_t
- `inline_data` (PNG): frame_t+1
- `text`: `DOM-diff: {...}` — JSON diff of the HTML tree between the two frames.

## Output JSON schema (verbatim from architecture.md §10a)

```json
{
  "action": "CLICK|TYPE|SCROLL|NAV|WAIT|SUBMIT|NOOP",
  "target_description": "short natural language",
  "bbox": [x1, y1, x2, y2],
  "text_typed": "string or null",
  "confidence": 0.0-1.0
}
```

## Example input

Frames: two PNGs of a Shopify admin UI — `frame_3.png` showing the orders list, `frame_4.png` showing the filter panel opened with "Date range" focused.

`DOM-diff`:

```json
{
  "added": ["div.filter-panel[role='dialog']", "input[aria-label='Date range']"],
  "removed": [],
  "focus_changed": "input[aria-label='Date range']"
}
```

## Example output

```json
{
  "action": "CLICK",
  "target_description": "Filters button on the orders list toolbar",
  "bbox": [720.0, 96.0, 796.0, 124.0],
  "text_typed": null,
  "confidence": 0.94
}
```

## Rationale for `thinking_level: minimal`

Per-frame UI event inference is a low-entropy classification task — pixel diff + DOM diff make the answer near-deterministic. `minimal` cuts per-call latency by ~3x vs `medium` with no measurable accuracy drop at this resolution. The 52% SWE-bench score for Flash-Lite (architecture.md §11) is immaterial here: we are not asking it to code, only to label events.

## Notes

- Keyframe selection (OpenCV PSNR delta) must precede this call — running on raw 60 frames costs ~25s vs ~6s on 8 keyframes (architecture.md §3 hackathon note).
- Never emit raw CSS selectors. Only selector hints (role + visible text). Resolution happens at agent runtime (architecture.md §10 "Selector strategy").
- Frames are downsampled to 512px on the long edge before sending (architecture.md §13 "Multimodal payload size" row).
