import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { cn } from "@/lib/cn";

const nav = [
  { to: "/synthesize", label: "Synthesize" },
  { to: "/agents", label: "Agents" },
  { to: "/agents/demo/supply-chain", label: "Supply Chain" },
  { to: "https://github.com/nihalnihalani/understudy", label: "Docs", external: true },
];

export default function App() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    // Never error-bubble the health chip.
    retry: false,
  });
  const probeByName = Object.fromEntries(
    (health?.services ?? []).map((s) => [s.name, s.status])
  );

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="h-14 border-b border-border-subtle bg-canvas-surface sticky top-0 z-30">
        <div className="h-full max-w-[1440px] mx-auto px-6 flex items-center gap-8">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold text-[16px] tracking-tight">
              Understudy
            </span>
            <span className="text-fg-muted text-[12px] hidden md:inline">
              Show it once. Understudy takes over.
            </span>
          </div>
          <nav className="flex items-center gap-1" aria-label="primary">
            {nav.map((item) =>
              item.external ? (
                <a
                  key={item.to}
                  href={item.to}
                  className="px-3 py-1.5 text-[13px] text-fg-muted hover:text-fg rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {item.label}
                </a>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-1.5 text-[13px] rounded",
                      isActive
                        ? "text-fg bg-canvas-elevated"
                        : "text-fg-muted hover:text-fg"
                    )
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <HealthChip name="redis" status={probeByName.redis} />
            <HealthChip name="gemini" status={probeByName.gemini} />
            <HealthChip name="cosmo_mcp" label="cosmo" status={probeByName.cosmo_mcp} />
            <HealthChip
              name="chainguard"
              label="chainguard"
              status={probeByName.chainguard}
            />
            <span className="chip chip-indigo ml-3" aria-label="demo mode">
              DEMO_MODE: {health?.demo_mode ?? "…"}
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1440px] mx-auto w-full px-6 py-6">
        <Outlet />
      </main>
      <footer className="h-10 border-t border-border-subtle">
        <div className="h-full max-w-[1440px] mx-auto px-6 flex items-center justify-between text-[11px] font-mono text-fg-faint">
          <span>pipeline: flash-lite → 3.1 pro → 3 flash</span>
          <span>SLSA L2 · Chainguard · cosign · Fulcio · Rekor</span>
          <span>apps/web · vite</span>
        </div>
      </footer>
    </div>
  );
}

function HealthChip({
  name,
  status,
  label,
}: {
  name: string;
  status: string | undefined;
  label?: string;
}) {
  const ok = status === "ok" || status === "live";
  const mock = status === "mock";
  const tone = ok ? "emerald" : mock ? "amber" : "crimson";
  return (
    <span
      className={cn(
        "chip",
        tone === "emerald" && "chip-emerald",
        tone === "amber" && "chip-amber",
        tone === "crimson" && "chip-crimson"
      )}
      aria-label={`${name} health: ${status ?? "unknown"}`}
    >
      <span
        className={cn(
          "inline-block w-1.5 h-1.5 rounded-full",
          tone === "emerald" && "bg-accent-emerald",
          tone === "amber" && "bg-accent-amber animate-pulse-dot",
          tone === "crimson" && "bg-accent-crimson"
        )}
      />
      <span>{label ?? name}</span>
      <span className="text-fg-faint">{status ?? "—"}</span>
    </span>
  );
}
