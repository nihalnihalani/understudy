import { useState } from "react";
import { ChevronRight, ChevronDown, Target, Waypoints, Shield, FileJson2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { IntentAbstraction } from "@/api/types";

interface IntentTreeProps {
  intent: IntentAbstraction;
}

export function IntentTree({ intent }: IntentTreeProps) {
  return (
    <div className="space-y-3 text-[13px]">
      <section className="rounded-md border border-border-strong bg-elevated p-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-faint">
          <Target className="size-3" /> Goal
        </div>
        <p className="mt-1 text-[14px] font-medium leading-snug text-foreground">
          {intent.goal}
        </p>
      </section>

      <Collapsible icon={Waypoints} label="Inputs" count={intent.inputs.length}>
        <ul className="space-y-1">
          {intent.inputs.map((inp) => (
            <li key={inp.name} className="font-mono text-[11px]">
              <span className="text-accent">{inp.name}</span>
              <span className="text-muted-foreground">: </span>
              <span className="text-foreground">{inp.type}</span>
              {inp.default !== undefined && (
                <>
                  <span className="text-muted-foreground"> = </span>
                  <span className="text-warning">
                    {JSON.stringify(inp.default)}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible
        icon={Shield}
        label="Invariants"
        count={Object.keys(intent.invariants).length}
      >
        <ul className="space-y-1">
          {Object.entries(intent.invariants).map(([k, v]) => (
            <li key={k} className="font-mono text-[11px]">
              <span className="text-accent">{k}</span>
              <span className="text-muted-foreground">: </span>
              <span className="text-warning">&quot;{v}&quot;</span>
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible
        icon={FileJson2}
        label="Output schema"
        count={Object.keys(intent.output_schema).length}
      >
        <pre className="overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[11px] leading-[1.5] text-muted-foreground">
{JSON.stringify(intent.output_schema, null, 2)}
        </pre>
      </Collapsible>

      <Collapsible
        icon={Waypoints}
        label={`Steps`}
        count={intent.steps.length}
        defaultOpen
      >
        <ol className="space-y-1.5">
          {intent.steps.map((s, i) => (
            <li key={i} className="flex gap-3 font-mono text-[11px]">
              <span className="w-5 shrink-0 text-right tabular-nums text-faint">
                {i + 1}.
              </span>
              <div className="min-w-0">
                <div className="text-foreground">{s.intent}</div>
                <div className="truncate text-muted-foreground">
                  selector_hint:{" "}
                  <span className="text-accent">{s.selector_hint}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Collapsible>
    </div>
  );
}

function Collapsible({
  icon: Icon,
  label,
  count,
  children,
  defaultOpen = true,
}: {
  icon: typeof Target;
  label: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-l-2 border-border-strong pl-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint",
          "transition-colors duration-fast hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <Icon className="size-3" />
        <span>{label}</span>
        {typeof count === "number" && (
          <Badge variant="default" className="ml-auto">
            {count}
          </Badge>
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
