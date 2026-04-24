# fixtures/synthesis — Canned 3-frame demo for the synthesis worker

A hand-crafted micro-workflow the tester-debugger and scaffold-architect can replay without
Google API credentials. Models a Shopify orders CSV export in three frames — same demo
narrative used on stage (architecture.md §15, beat 0:00–0:20).

## Contents

```
frames/
  frame_00.png     # orders list
  frame_01.png     # filter panel open, date-range focused
  frame_02.png     # export complete, CSV link visible

expected/
  action_detection_0_1.json   # Flash-Lite output for (frame_00, frame_01)
  action_detection_1_2.json   # Flash-Lite output for (frame_01, frame_02)
  intent_abstraction.json     # Pro output for the 2-event trace
  script_emission.json        # Flash tool-call arguments

dom/
  diffs.json                  # DOM diffs between consecutive frames
  snapshots.json              # URL + title per frame
  page_titles.json            # flat list of page titles
```

## Usage from Python

```python
from pathlib import Path
from apps.synthesis_worker.keyframes import Keyframe

FIX = Path("fixtures/synthesis")
frames = [
    Keyframe(index=i, timestamp_s=float(i), png_bytes=p.read_bytes())
    for i, p in enumerate(sorted((FIX / "frames").glob("frame_*.png")))
]
# → feed into detect_actions(), abstract_intent(), emit_script()
```

Set `DEMO_MODE=replay` + seed `us:replay:{synth_id}:*` with the `expected/*.json` payloads
and the worker will produce identical output without touching Gemini.
