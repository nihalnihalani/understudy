// SYNTHESIS HUD — the hero screen. Beats 0:20-1:20.
// Renders the three-Gemini stage cards, keyframe ribbon, intent tree,
// script panel, and the live trace tail. Data shape:
// GET /synthesis/{id} -> SynthesisRunDetail (apps/api/schemas.py).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GeminiStageCard } from "@/components/GeminiStageCard";
import { MeterBar } from "@/components/MeterBar";
import { StatusChip } from "@/components/StatusChip";
import { TraceStreamTail } from "@/components/TraceStreamTail";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useTraceStream } from "@/hooks/useTraceStream";
import {
  DEMO_ACTION_CALLS,
  DEMO_INTENT,
  DEMO_INTENT_THOUGHTS,
  DEMO_KEYFRAMES,
  DEMO_SCRIPT_LINES,
  DEMO_SYNTHESIS,
} from "@/fixtures/demo";
import type { IntentAbstraction } from "@/api/types";

export default function SynthesisHUD() {
  const { id } = useParams<{ id: string }>();
  const { run, trace } = useTraceStream(id);
  const usingFixtures = !run;
  const effectiveRun = run ?? DEMO_SYNTHESIS.run;
  const effectiveTrace = trace.length > 0 ? trace : DEMO_SYNTHESIS.trace;
  const intent: IntentAbstraction =
    effectiveRun.intent_abstraction ?? DEMO_INTENT;

  // Live run timer — monotonic since page-mount; good enough for HUD chrome.
  const [elapsed, setElapsed] = useState<number>(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((x) => x + 100), 100);
    return () => clearInterval(t);
  }, []);

  // Derive stage states from the run row. In fixture mode, progression is
  // simulated so the HUD is visibly "alive" when demoed offline.
  const stages = useMemo(() => {
    if (!usingFixtures) {
      return {
        flashLite: effectiveRun.gemini_lite_trace ? "completed" : "running",
        pro: effectiveRun.gemini_pro_trace
          ? "completed"
          : effectiveRun.gemini_lite_trace
          ? "running"
          : "pending",
        flash: effectiveRun.gemini_flash_trace
          ? "completed"
          : effectiveRun.gemini_pro_trace
          ? "running"
          : "pending",
      } as const;
    }
    return { flashLite: "completed", pro: "running", flash: "pending" } as const;
  }, [usingFixtures, effectiveRun]);

  const [scriptTab, setScriptTab] = useState<"intent" | "script">("intent");
  const [selectedFrame, setSelectedFrame] = useState(4);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-mono text-fg-muted">
          Synthesize ›{" "}
          <span className="text-fg">run-{effectiveRun.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip status={effectiveRun.status} />
          <span className="font-mono text-[14px] tabular-nums">
            {formatDuration(elapsed)}
          </span>
        </div>
      </div>

      <StageStepper stages={stages} />

      <div className="grid grid-cols-[320px_minmax(0,1fr)_420px] gap-4">
        {/* LEFT RAIL: three stage cards */}
        <div className="flex flex-col gap-4">
          <GeminiStageCard
            title="Action Detection"
            modelId="gemini-3.1-flash-lite"
            thinkingLevel="minimal"
            state={stages.flashLite}
            durationSeconds={14.2}
            toolCalls={DEMO_ACTION_CALLS}
            footer="8 keyframes · 4 events · $0.004 token spend"
          />
          <GeminiStageCard
            title="Intent Abstraction"
            modelId="gemini-3.1-pro"
            thinkingLevel="high"
            state={stages.pro}
            durationSeconds={21.0}
            progress={64}
            toolCalls={DEMO_INTENT_THOUGHTS}
            footer="thought-trace · streaming"
          />
          <GeminiStageCard
            title="Script Emission"
            modelId="gemini-3-flash"
            thinkingLevel="medium"
            state={stages.flash}
            placeholder="tool_calls will stream here — emit_tinyfish_script()"
            footer="awaiting intent spec"
          />
        </div>

        {/* CENTER: keyframe ribbon + DOM diff */}
        <div className="flex flex-col gap-4">
          <section className="card p-4">
            <header className="flex items-baseline justify-between mb-2">
              <h2 className="text-[14px] font-medium">
                Keyframes — scene-change extracted
              </h2>
              <span className="text-mono-sm font-mono text-fg-muted">
                OpenCV PSNR delta · 60 raw → 8 key · ~10× token reduction
              </span>
            </header>
            <KeyframeRibbon
              frames={DEMO_KEYFRAMES}
              selected={selectedFrame}
              onSelect={setSelectedFrame}
            />
            <div className="mt-3">
              <div className="meter-track h-[3px] relative">
                <div
                  className="absolute top-[-4px] w-[11px] h-[11px] rounded-full bg-primary"
                  style={{ left: `${(selectedFrame / 7) * 100}%` }}
                  aria-hidden
                />
                <div
                  className="h-full bg-primary/60"
                  style={{ width: `${(selectedFrame / 7) * 100}%` }}
                />
              </div>
            </div>
          </section>

          <details className="card p-4 group">
            <summary className="cursor-pointer text-[13px] font-medium flex items-center justify-between">
              <span>DOM-diff preview (frame {selectedFrame + 1})</span>
              <span className="chip">3 nodes</span>
            </summary>
            <pre className="mt-3 font-mono text-mono-base leading-[1.7] text-fg-muted">
              <div className="diff-minus px-2">- &lt;button class="px-3"&gt;Filters&lt;/button&gt;</div>
              <div className="diff-plus px-2">+ &lt;button class="px-3" aria-expanded="true"&gt;Filters&lt;/button&gt;</div>
              <div className="diff-plus px-2">+ &lt;input name="dateRange" value="yesterday"/&gt;</div>
            </pre>
          </details>
        </div>

        {/* RIGHT PANEL: intent tree / script */}
        <div className="flex flex-col">
          <div className="card flex-1 flex flex-col overflow-hidden">
            <nav className="flex border-b border-border-subtle">
              <TabButton active={scriptTab === "intent"} onClick={() => setScriptTab("intent")}>
                Intent Tree
              </TabButton>
              <TabButton
                active={scriptTab === "script"}
                onClick={() => setScriptTab("script")}
              >
                TinyFish Script
              </TabButton>
            </nav>
            <div className="flex-1 overflow-auto scrollbar-tight p-4">
              {scriptTab === "intent" ? (
                <IntentTree intent={intent} />
              ) : (
                <ScriptPanel />
              )}
            </div>
            <footer className="flex flex-wrap gap-1.5 px-4 py-3 border-t border-border-subtle">
              <span className="chip chip-indigo">skills: web-workflow-pack@2.3.1</span>
              <span className="chip">runtime: wolfi-base</span>
              <span className="chip chip-emerald">mode: LIVE</span>
              <span className="chip">token_spend: $0.027</span>
            </footer>
          </div>
          <div className="mt-3">
            <Link
              to={`/synthesize/${effectiveRun.id}/dream-query`}
              className="btn btn-ghost w-full justify-center"
            >
              Open Cosmo Dream Query →
            </Link>
          </div>
        </div>
      </div>

      <TraceStreamTail events={effectiveTrace} />
    </div>
  );
}

function StageStepper({
  stages,
}: {
  stages: { flashLite: string; pro: string; flash: string };
}) {
  const items = [
    {
      label: "Action Detection",
      model: "gemini-3.1-flash-lite",
      level: "minimal",
      state: stages.flashLite,
      dur: "14.2s",
    },
    {
      label: "Intent Abstraction",
      model: "gemini-3.1-pro",
      level: "high",
      state: stages.pro,
      dur: "21.0s",
    },
    {
      label: "Script Emission",
      model: "gemini-3-flash",
      level: "medium",
      state: stages.flash,
      dur: "queued",
    },
  ];
  return (
    <section
      className="card px-3 py-2 flex items-stretch gap-2 overflow-auto scrollbar-tight"
      aria-label="Pipeline stages"
    >
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            "flex-1 min-w-[280px] px-3 py-2 rounded border",
            it.state === "completed" && "border-accent-emerald/30 bg-accent-emerald/5",
            it.state === "running" && "border-accent-amber/30 bg-accent-amber/5",
            it.state === "pending" && "border-border-subtle"
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-fg-faint text-mono-xs">{i + 1}</span>
            <span className="text-[13px] font-medium">{it.label}</span>
            <StatusChip
              status={
                it.state === "completed"
                  ? "completed"
                  : it.state === "running"
                  ? "running"
                  : "pending"
              }
            />
            <span className="ml-auto text-mono-sm font-mono text-fg-muted">
              {it.dur}
            </span>
          </div>
          <div className="mt-1.5 font-mono text-mono-sm text-fg-muted">
            {it.model} · thinking_level: {it.level}
          </div>
          {it.state === "running" && (
            <MeterBar value={64} tone="amber" className="mt-2 h-[3px]" />
          )}
        </div>
      ))}
    </section>
  );
}

function KeyframeRibbon({
  frames,
  selected,
  onSelect,
}: {
  frames: Array<{ ts: string; targetX: number; targetY: number }>;
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <ul className="flex gap-2 overflow-auto scrollbar-tight pb-1" role="tablist">
      {frames.map((f, i) => (
        <li key={i}>
          <button
            type="button"
            role="tab"
            aria-selected={selected === i}
            onClick={() => onSelect(i)}
            className={cn(
              "relative block w-[148px] h-[96px] rounded border overflow-hidden bg-canvas-elevated flex-shrink-0",
              selected === i
                ? "border-primary ring-1 ring-primary"
                : "border-border-subtle hover:border-border-strong"
            )}
          >
            <FrameIllustration selected={selected === i} />
            <span
              aria-hidden
              className="absolute w-2 h-2 rounded-full bg-accent-crimson/90 ring-2 ring-accent-crimson/30"
              style={{
                left: `${f.targetX}%`,
                top: `${f.targetY}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
            <span className="absolute top-1 left-1 font-mono text-[10px] text-fg bg-canvas/70 px-1 rounded">
              f{String(i + 1).padStart(2, "0")}
            </span>
            <span className="absolute bottom-1 right-1 font-mono text-[10px] text-fg bg-canvas/70 px-1 rounded">
              {f.ts}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FrameIllustration({ selected }: { selected: boolean }) {
  // Stylized light-UI browser to stand in for a real frame thumbnail.
  // Never a photo — fixtures-level placeholder.
  const fg = selected ? "rgba(99,102,241,0.15)" : "rgba(230,232,240,0.06)";
  return (
    <svg viewBox="0 0 148 96" className="w-full h-full" aria-hidden>
      <rect width="148" height="96" fill="rgba(231,234,240,0.92)" />
      <rect x="0" y="0" width="148" height="16" fill="rgba(220,224,234,0.9)" />
      <circle cx="6" cy="8" r="2" fill="#F87171" />
      <circle cx="13" cy="8" r="2" fill="#FBBF24" />
      <circle cx="20" cy="8" r="2" fill="#34D399" />
      <rect x="30" y="4" width="80" height="8" rx="2" fill="rgba(255,255,255,0.6)" />
      <rect x="8" y="22" width="40" height="68" fill="rgba(243,244,249,0.9)" />
      <rect x="52" y="22" width="88" height="10" fill={fg} />
      <rect x="52" y="36" width="60" height="6" fill="rgba(99,102,241,0.55)" />
      <rect x="52" y="46" width="40" height="6" fill="rgba(34,211,238,0.35)" />
      <rect x="52" y="58" width="88" height="30" fill="rgba(231,234,240,1)" stroke="rgba(0,0,0,0.05)" />
    </svg>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-[13px] border-b-2 transition-colors",
        active
          ? "text-fg border-primary"
          : "text-fg-muted border-transparent hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

function IntentTree({ intent }: { intent: IntentAbstraction }) {
  return (
    <div className="space-y-3 text-[13px]">
      <div className="card-elevated p-3">
        <div className="text-[11px] uppercase text-fg-faint tracking-wider mb-1">
          Goal
        </div>
        <div className="font-medium text-[15px] leading-snug">{intent.goal}</div>
      </div>
      <TreeBlock label="Inputs">
        {intent.inputs.map((inp) => (
          <div key={inp.name} className="font-mono text-mono-base">
            <span className="text-accent-cyan">{inp.name}</span>
            <span className="text-fg-muted">: </span>
            <span>{inp.type}</span>
            {inp.default !== undefined && (
              <>
                <span className="text-fg-muted"> = </span>
                <span className="text-accent-amber">{String(inp.default)}</span>
              </>
            )}
          </div>
        ))}
      </TreeBlock>
      <TreeBlock label="Invariants">
        {Object.entries(intent.invariants).map(([k, v]) => (
          <div key={k} className="font-mono text-mono-base">
            <span className="text-accent-cyan">{k}</span>
            <span className="text-fg-muted">: </span>
            <span className="text-accent-amber">"{v}"</span>
          </div>
        ))}
      </TreeBlock>
      <TreeBlock label="Output schema">
        <div className="font-mono text-mono-base text-fg-muted">
          {Object.keys(intent.output_schema).join(", ")} (click to expand)
        </div>
      </TreeBlock>
      <TreeBlock label={`Steps (${intent.steps.length})`}>
        <ol className="space-y-1.5">
          {intent.steps.map((s, i) => (
            <li key={i} className="flex gap-3 font-mono text-mono-base">
              <span className="text-fg-faint w-5 tabular-nums">{i + 1}.</span>
              <div className="min-w-0">
                <div className="text-fg">{s.intent}</div>
                <div className="text-fg-muted truncate">
                  selector_hint: {s.selector_hint}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </TreeBlock>
    </div>
  );
}

function TreeBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-l-2 border-border-strong pl-3">
      <div className="text-[11px] uppercase text-fg-faint tracking-wider mb-1">
        {label}
      </div>
      <div>{children}</div>
    </section>
  );
}

function ScriptPanel() {
  return (
    <pre className="font-mono text-mono-lg leading-[1.7] m-0">
      {DEMO_SCRIPT_LINES.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="w-6 text-right text-fg-faint select-none tabular-nums">
            {i + 1}
          </span>
          <span className={cn(scriptLineClass(line))}>{line || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function scriptLineClass(line: string): string {
  if (line.startsWith("import")) return "text-primary-300";
  if (line.startsWith("export")) return "text-accent-cyan";
  if (line.trim().startsWith("//")) return "text-fg-faint italic";
  return "text-fg";
}
