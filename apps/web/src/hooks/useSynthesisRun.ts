// Thin wrapper over useTraceStream that falls back to the demo fixture when
// the API has no row yet. Keeps the HUD page free of fixture-branching noise.
//
// The stream hook alone is not sufficient because:
//   - a direct-navigation HUD visit (e.g. from a demo replay link) needs an
//     immediate render without waiting for the first REST poll,
//   - fixture data must look like a live stream to exercise the UI offline.

import { useMemo } from "react";
import { useTraceStream } from "./useTraceStream";
import {
  DEMO_ACTION_CALLS,
  DEMO_INTENT,
  DEMO_INTENT_THOUGHTS,
  DEMO_SYNTHESIS,
} from "@/fixtures/demo";
import type { IntentAbstraction, SynthesisRun, TraceEvent } from "@/api/types";

export type StageKey = "flashLite" | "pro" | "flash";

export interface StageSnapshot {
  key: StageKey;
  title: string;
  modelId: string;
  thinkingLevel: "minimal" | "low" | "medium" | "high";
  state: "pending" | "streaming" | "done" | "error";
  toolCalls: string[];
  elapsedSeconds?: number;
  tokenCount?: number;
  variant: "call" | "thought";
  placeholder?: string;
  footer?: string;
}

export interface SynthesisRunState {
  run: SynthesisRun;
  trace: TraceEvent[];
  intent: IntentAbstraction;
  stages: StageSnapshot[];
  usingFixture: boolean;
  connected: boolean;
  error: Error | null;
}

function splitLines(trace: string | null, fallback: string[]): string[] {
  if (!trace) return fallback;
  return trace.split("\n").filter((l) => l.length > 0);
}

function stageState(
  run: SynthesisRun,
  stage: StageKey,
  usingFixture: boolean
): StageSnapshot["state"] {
  if (run.status === "failed") return "error";
  if (usingFixture) {
    if (stage === "flashLite") return "done";
    if (stage === "pro") return "streaming";
    return "pending";
  }
  const traceDone =
    (stage === "flashLite" && !!run.gemini_lite_trace) ||
    (stage === "pro" && !!run.gemini_pro_trace) ||
    (stage === "flash" && !!run.gemini_flash_trace);
  if (traceDone) return "done";
  if (stage === "flashLite") return "streaming";
  if (stage === "pro" && run.gemini_lite_trace) return "streaming";
  if (stage === "flash" && run.gemini_pro_trace) return "streaming";
  return "pending";
}

export function useSynthesisRun(synthId: string | undefined): SynthesisRunState {
  const { run, trace, connected, error } = useTraceStream(synthId);
  const usingFixture = !run;
  const effectiveRun = run ?? DEMO_SYNTHESIS.run;
  const effectiveTrace = trace.length > 0 ? trace : DEMO_SYNTHESIS.trace;
  const intent = effectiveRun.intent_abstraction ?? DEMO_INTENT;

  const stages = useMemo<StageSnapshot[]>(() => {
    const flashLiteCalls = splitLines(
      effectiveRun.gemini_lite_trace,
      DEMO_ACTION_CALLS
    );
    const proThoughts = splitLines(
      effectiveRun.gemini_pro_trace,
      DEMO_INTENT_THOUGHTS
    );
    const flashLines = splitLines(effectiveRun.gemini_flash_trace, []);

    return [
      {
        key: "flashLite",
        title: "Action Detection",
        modelId: "gemini-3.1-flash-lite-preview",
        thinkingLevel: "minimal",
        state: stageState(effectiveRun, "flashLite", usingFixture),
        toolCalls: flashLiteCalls,
        elapsedSeconds: 14.2,
        tokenCount: 3840,
        variant: "call",
        footer: `8 keyframes · ${flashLiteCalls.length} tool_calls`,
      },
      {
        key: "pro",
        title: "Intent Abstraction",
        modelId: "gemini-3-flash-preview",
        thinkingLevel: "medium",
        state: stageState(effectiveRun, "pro", usingFixture),
        toolCalls: proThoughts,
        elapsedSeconds: 21.0,
        tokenCount: 7210,
        variant: "thought",
        footer: "thought-trace streaming",
      },
      {
        key: "flash",
        title: "Script Emission",
        modelId: "gemini-3-flash-preview",
        thinkingLevel: "medium",
        state: stageState(effectiveRun, "flash", usingFixture),
        toolCalls: flashLines,
        elapsedSeconds: flashLines.length > 0 ? 8.4 : undefined,
        tokenCount: flashLines.length > 0 ? 1960 : undefined,
        variant: "call",
        placeholder: "awaiting intent spec · emit_tinyfish_script()",
        footer: "SWE-bench 78%",
      },
    ];
  }, [effectiveRun, usingFixture]);

  return {
    run: effectiveRun,
    trace: effectiveTrace,
    intent,
    stages,
    usingFixture,
    connected,
    error,
  };
}
