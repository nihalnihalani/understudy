import { useState } from "react";
import type { MouseEvent } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentState } from "./AgentSparkline";

export function Monogram({ id, state }: { id: string; state: AgentState }) {
  const letters = id.replace(/-/g, "").slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border font-mono text-[12px] font-semibold",
        state === "active" && "border-success/30 bg-success/10 text-success",
        state === "idle" && "border-primary/30 bg-primary/10 text-primary-soft",
        state === "pending" && "border-warning/30 bg-warning/10 text-warning",
        state === "failed" && "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      {letters}
    </span>
  );
}

export function SignedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-sm border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-success"
        role="status"
      >
        <ShieldCheck className="size-3" />
        signed
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive"
      role="status"
    >
      <ShieldAlert className="size-3" />
      unsigned
    </span>
  );
}

export function InlineCopy({
  prefix,
  value,
  fullValue,
  label,
}: {
  prefix: string;
  value: string;
  fullValue: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] text-foreground">
      <span className="font-mono text-[9px] uppercase tracking-wider text-faint">{prefix}</span>
      <span className="truncate">{value}</span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(fullValue);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
        className={cn(
          "ml-auto inline-flex size-5 items-center justify-center rounded-sm text-faint",
          "transition-colors duration-fast",
          "hover:bg-elevated hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          copied && "text-success"
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}

export function InlineLink({ href, host }: { href: string; host: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex items-center gap-1.5 font-mono text-[11px] text-accent",
        "hover:text-accent/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <CircleDot className="size-3 shrink-0" />
      <span className="truncate">{host}</span>
      <ExternalLink className="ml-auto size-3 shrink-0 text-faint" />
    </a>
  );
}

export function IconAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-sm text-faint",
        "transition-colors duration-fast",
        "hover:bg-elevated hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {icon}
    </button>
  );
}
