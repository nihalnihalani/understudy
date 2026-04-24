import { type SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Understudy wordmark — monogram `[u_]` + typeset wordmark. The `_` motif
 * is the recording caret; it animates only when `animate` is true.
 */
export function Wordmark({
  className,
  animate = false,
  compact = false,
}: {
  className?: string;
  animate?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-sans font-semibold tracking-tight text-foreground",
        className
      )}
      aria-label="Understudy"
    >
      <WordmarkGlyph animate={animate} className="shrink-0" />
      {!compact && <span className="text-[15px]">Understudy</span>}
    </span>
  );
}

export function WordmarkGlyph({
  animate = false,
  ...props
}: SVGProps<SVGSVGElement> & { animate?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="0.75"
        y="0.75"
        width="22.5"
        height="22.5"
        rx="5"
        stroke="hsl(var(--border-strong))"
        strokeWidth="1.5"
      />
      {/* "u" stroke */}
      <path
        d="M7 7v6.5a4.5 4.5 0 0 0 9 0V7"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* caret */}
      <rect
        x="8"
        y="17"
        width="8"
        height="1.5"
        rx="0.75"
        fill="hsl(var(--success))"
        className={animate ? "animate-caret" : ""}
      />
    </svg>
  );
}
