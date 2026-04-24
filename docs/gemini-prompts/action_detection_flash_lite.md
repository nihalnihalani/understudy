# Prompt — Action Detection (Gemini 3.1 Flash-Lite)

Mirrors architecture.md §10(a). The synthesis worker loads this prompt verbatim and feeds it keyframe pairs.

- **Model:** `gemini-3.1-flash-lite` (pinned in `understudy/models.py`)
- **`thinking_level`:** `minimal`
- **`response_mime_type`:** `application/json`
- **Input:** two consecutive scene-change keyframes (PNG) + DOM diff.
- **Tool:** `emit_event(event_type, selector, value, confidence)`

## Prompt body

```
SYSTEM: You are a frame-level UI event detector.
USER: [image/png frame_t] [image/png frame_t+1]
      DOM-diff: {...}
```

## Output schema

```json
{
  "action": "CLICK|TYPE|SCROLL|NAV|WAIT|SUBMIT|NOOP",
  "target_description": "short natural language",
  "bbox": [x1, y1, x2, y2],
  "text_typed": "string or null",
  "confidence": 0.0-1.0
}
```

## Notes

- Keyframe selection (OpenCV PSNR delta) must precede this call — running on raw 60 frames costs ~25s vs ~6s on 8 keyframes (architecture.md §3 hackathon note).
- Never emit raw CSS selectors. Only selector hints (role + visible text). Resolution happens at agent runtime (architecture.md §10 "Selector strategy").
