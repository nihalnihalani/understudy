import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CopyRowProps {
  label?: string;
  value: string;
  truncate?: boolean;
  href?: string;
  tone?: "default" | "mono" | "success" | "accent";
  className?: string;
  dense?: boolean;
}

export function CopyRow({
  label,
  value,
  truncate = false,
  href,
  tone = "mono",
  className,
  dense = false,
}: CopyRowProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable — silent; the focus ring still signals the action
    }
  }, [value]);

  const valueCls = cn(
    "flex-1 min-w-0 text-[12px] leading-[1.5]",
    tone === "mono" && "font-mono text-foreground",
    tone === "default" && "text-foreground",
    tone === "success" && "font-mono text-success",
    tone === "accent" && "font-mono text-accent",
    truncate ? "truncate" : "break-all"
  );

  return (
    <div
      className={cn(
        "group grid items-center gap-3 rounded-sm",
        label ? "grid-cols-[max-content_1fr_auto]" : "grid-cols-[1fr_auto]",
        dense ? "py-1" : "py-1.5",
        className
      )}
    >
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          {label}
        </span>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(valueCls, "text-accent underline decoration-dotted underline-offset-2 hover:text-accent/80")}
          title={value}
        >
          {value}
        </a>
      ) : (
        <span className={valueCls} title={value}>
          {value}
        </span>
      )}
      <button
        type="button"
        onClick={onCopy}
        aria-label={label ? `Copy ${label}` : "Copy value"}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-faint",
          "transition-colors duration-fast",
          "hover:bg-elevated hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          copied && "text-success"
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
