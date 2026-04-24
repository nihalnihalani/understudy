import { Brain, Tags, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyRow } from "@/components/common/CopyRow";

export interface MemoryDump {
  ams_namespace: string;
  stm_turn_count: number;
  ltm_record_count: number;
  vector_count: number;
  quantization: "int8" | "float32";
  topics: string[];
  entities: Record<string, string | number | boolean>;
}

export function MemoryDumpPanel({ memory, fixture }: { memory: MemoryDump; fixture?: boolean }) {
  const entries = Object.entries(memory.entities);
  return (
    <section
      data-demo={fixture ? "fixture" : undefined}
      aria-label="Agent memory dump"
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label="stm turns" value={memory.stm_turn_count.toLocaleString()} />
        <Stat label="ltm records" value={memory.ltm_record_count.toLocaleString()} />
        <Stat label="vectors" value={memory.vector_count.toLocaleString()} subtext={memory.quantization} />
      </div>

      <div className="rounded-md border border-border bg-surface/60 p-3">
        <CopyRow label="namespace" value={memory.ams_namespace} />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Tags className="size-3 text-faint" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
            top topics
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {memory.topics.length === 0 ? (
            <span className="font-mono text-[11px] text-faint">—</span>
          ) : (
            memory.topics.map((t) => (
              <Badge key={t} variant="primary">
                {t}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <User className="size-3 text-faint" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
            top entities
          </span>
        </div>
        <dl className="rounded-md border border-border bg-surface/60 px-3 py-2 font-mono text-[11px]">
          {entries.length === 0 ? (
            <span className="text-faint">— no entities extracted</span>
          ) : (
            entries.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0"
              >
                <span className="text-muted-foreground">{k}</span>
                <span className="truncate text-foreground" title={String(v)}>
                  {String(v)}
                </span>
              </div>
            ))
          )}
        </dl>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Brain className="mt-0.5 size-3 shrink-0 text-faint" />
        Redis Agent Memory Server · STM stream + LTM hash + Vector Sets (int8).
        Topics and entities are auto-extracted on every turn.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-2.5 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {subtext && (
        <div className="font-mono text-[10px] text-muted-foreground">{subtext}</div>
      )}
    </div>
  );
}
