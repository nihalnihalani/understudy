import { cn } from "@/lib/cn";
import type { SynthesisStatus } from "@/api/types";

const TONE: Record<SynthesisStatus | "verified" | "failed" | "pending", string> = {
  queued: "chip-amber",
  running: "chip-amber",
  completed: "chip-emerald",
  verified: "chip-emerald",
  failed: "chip-crimson",
  pending: "",
};

export function StatusChip({
  status,
  label,
}: {
  status: SynthesisStatus | "verified" | "failed" | "pending";
  label?: string;
}) {
  return (
    <span className={cn("chip", TONE[status])} aria-label={label ?? status}>
      {status === "running" || status === "queued" ? (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse-dot"
          aria-hidden
        />
      ) : status === "completed" || status === "verified" ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 5l2 2 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : status === "failed" ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 2l6 6m0-6l-6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      <span className="uppercase tracking-wide">{label ?? status}</span>
    </span>
  );
}
