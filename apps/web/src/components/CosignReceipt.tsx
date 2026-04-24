// Renders a cosign/SLSA/Rekor receipt as first-class UI.
// Every row is copyable, every external ref is an explicit link.
// The data shape is `ApiFullAttestation` from @/api/types — the live bundle
// returned by GET /agents/{id}/attestation (apps/api/schemas.py).

import { useState } from "react";
import { cn } from "@/lib/cn";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-fg-faint hover:text-accent-cyan transition-colors"
      aria-label={label ?? "Copy value"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      <span className="font-mono text-mono-xs">{copied ? "copied" : "copy"}</span>
    </button>
  );
}

function Row({
  label,
  value,
  copyable,
  link,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  link?: string;
}) {
  return (
    <div className="receipt-row">
      <dt>{label}</dt>
      <dd className="flex items-center gap-2 justify-between">
        <span className="flex-1 min-w-0 break-all">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-cyan underline decoration-dotted underline-offset-2"
            >
              {value}
            </a>
          ) : (
            value
          )}
        </span>
        {copyable && <CopyButton text={value} label={`Copy ${label}`} />}
      </dd>
    </div>
  );
}

export function CosignReceipt({
  title,
  verified,
  subtitle,
  command,
  children,
}: {
  title: string;
  verified: boolean;
  subtitle?: string;
  command?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5" aria-label={title}>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[16px] font-semibold">{title}</h3>
          {subtitle && (
            <p className="text-[12px] text-fg-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        <span
          className={cn(
            "chip",
            verified ? "chip-emerald" : "chip-crimson",
            "text-[12px] font-semibold tracking-wider"
          )}
          role="status"
          aria-live="polite"
        >
          {verified ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path
                  d="M2 6l3 3 5-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              VERIFIED
            </>
          ) : (
            "FAILED"
          )}
        </span>
      </header>
      <dl className="mb-4">{children}</dl>
      {command && (
        <div className="bg-canvas-elevated border border-border-subtle rounded px-3 py-2 font-mono text-mono-sm text-fg-muted overflow-auto scrollbar-tight">
          <span className="text-fg-faint select-none">$ </span>
          {command}
        </div>
      )}
    </section>
  );
}

CosignReceipt.Row = Row;
