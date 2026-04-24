import { cn } from "@/lib/cn";
import { MeterBar } from "./MeterBar";
import { StatusChip } from "./StatusChip";

export type StageState = "pending" | "running" | "completed";

interface Props {
  title: string;
  modelId: string;
  thinkingLevel: string;
  state: StageState;
  durationSeconds?: number;
  progress?: number;
  toolCalls?: string[];
  footer?: string;
  placeholder?: string;
}

export function GeminiStageCard({
  title,
  modelId,
  thinkingLevel,
  state,
  durationSeconds,
  progress,
  toolCalls,
  footer,
  placeholder,
}: Props) {
  const isItalicThought = toolCalls?.every((t) => t.startsWith("[thought]"));
  return (
    <section
      className={cn(
        "card p-4 flex flex-col gap-3",
        state === "pending" && "opacity-60"
      )}
      aria-label={`${title} stage`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium">{title}</div>
          <div className="text-mono-sm font-mono text-fg-muted mt-0.5">
            {modelId} · thinking_level: {thinkingLevel}
          </div>
        </div>
        <StatusChip
          status={
            state === "completed"
              ? "completed"
              : state === "running"
              ? "running"
              : "pending"
          }
        />
      </header>
      {state === "running" && (
        <MeterBar
          value={progress ?? 0}
          tone="amber"
          label={`${title} progress`}
          className="h-1"
        />
      )}
      <div
        className={cn(
          "font-mono text-mono-base bg-canvas elevated-bg rounded p-2.5 h-[160px] overflow-auto scrollbar-tight",
          "bg-canvas-elevated border border-border-subtle"
        )}
        role="log"
        aria-live={state === "running" ? "polite" : "off"}
      >
        {toolCalls && toolCalls.length > 0 ? (
          <ul className="space-y-1">
            {toolCalls.map((line, i) => (
              <li
                key={i}
                className={cn(
                  "whitespace-pre-wrap leading-[1.6]",
                  isItalicThought ? "italic text-fg-muted" : "text-fg"
                )}
              >
                {line}
                {i === toolCalls.length - 1 && state === "running" && (
                  <span className="inline-block w-2 h-3.5 ml-1 align-middle bg-primary/80 animate-caret" />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-fg-faint italic">{placeholder}</div>
        )}
      </div>
      <footer className="flex items-center justify-between text-mono-sm font-mono text-fg-muted">
        <span>{footer}</span>
        {typeof durationSeconds === "number" && (
          <span>{durationSeconds.toFixed(1)}s</span>
        )}
      </footer>
    </section>
  );
}
