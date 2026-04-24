import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
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
    retry: false,
  });
  const probeByName = Object.fromEntries(
    (health?.services ?? []).map((s) => [s.name, s.status])
  );
  const [now, setNow] = useState<string>(() => formatClock());
  useEffect(() => {
    const t = setInterval(() => setNow(formatClock()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-canvas/70 border-b border-border-subtle">
        <div className="max-w-[1440px] mx-auto px-8 py-3.5 grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
          {/* Brand */}
          <div className="flex items-center gap-3 font-mono text-[13px] tracking-[0.08em]">
            <span className="brand-mark">U</span>
            <span className="text-fg font-medium">UNDERSTUDY</span>
            <span className="text-fg-dim">/</span>
            <span className="text-fg-faint hidden md:inline">COMMAND CENTER</span>
          </div>

          {/* Telemetry */}
          <div className="hidden lg:flex gap-3 justify-center font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
            <span className="inline-flex gap-2 items-center">
              <span className="status-dot live heartbeat" />
              <strong className="text-fg font-medium">PIPELINE LIVE</strong>
            </span>
            <span>T— <strong className="text-fg font-medium">{now}</strong></span>
            <span>MODE <strong className="text-fg font-medium">{health?.demo_mode ?? "…"}</strong></span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1 justify-end font-mono text-[10px] tracking-[0.14em] uppercase" aria-label="primary">
            {nav.map((item) =>
              item.external ? (
                <a
                  key={item.to}
                  href={item.to}
                  className="px-3 py-1.5 text-fg-faint hover:text-accent-amber border border-transparent hover:border-border-subtle hover:bg-primary-soft transition-colors"
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
                      "px-3 py-1.5 border border-transparent transition-colors",
                      isActive
                        ? "text-accent-amber border-border-subtle bg-primary-soft"
                        : "text-fg-faint hover:text-accent-amber hover:border-border-subtle hover:bg-primary-soft"
                    )
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
          </nav>
        </div>

        {/* Health probe strip — hairline matrix below the topbar */}
        <div className="border-t border-border-subtle">
          <div className="max-w-[1440px] mx-auto px-8 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-fg-faint">
            <ProbePill name="REDIS"      status={probeByName.redis} />
            <ProbePill name="GEMINI"     status={probeByName.gemini} />
            <ProbePill name="COSMO"      status={probeByName.cosmo_mcp} />
            <ProbePill name="CHAINGUARD" status={probeByName.chainguard} />
            <ProbePill name="INSFORGE"   status={probeByName.insforge} />
            <ProbePill name="TINYFISH"   status={probeByName.tinyfish} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-8 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-border-subtle bg-canvas-elevated/40">
        <div className="max-w-[1440px] mx-auto px-8 py-6 grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-[10px] tracking-[0.14em] uppercase text-fg-faint">
          <div>
            <div className="text-fg mb-1">PIPELINE</div>
            FLASH-LITE → 3.1 PRO → 3 FLASH
          </div>
          <div className="md:text-center">
            <div className="text-fg mb-1">SUPPLY CHAIN</div>
            SLSA L2 · CHAINGUARD · COSIGN · FULCIO · REKOR
          </div>
          <div className="md:text-right">
            <div className="text-fg mb-1">RUNTIME</div>
            APPS/WEB · VITE · REACT
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProbePill({ name, status }: { name: string; status: string | undefined }) {
  const ok = status === "ok" || status === "live";
  const mock = status === "mock";
  const dotCls = ok ? "live" : mock ? "" : "bad";
  const valueCls = ok
    ? "text-accent-emerald"
    : mock
    ? "text-fg-dim"
    : "text-accent-bad";
  const value = ok ? "LIVE" : mock ? "STUB" : (status ?? "—").toUpperCase();
  return (
    <span
      className="inline-flex items-center gap-2"
      title={
        ok
          ? "configured + reachable"
          : mock
          ? "credentials not set — running with stub adapters"
          : "service degraded"
      }
    >
      <span className={cn("status-dot", dotCls)} />
      {name}
      <span className={cn("font-medium", valueCls)}>{value}</span>
    </span>
  );
}

function formatClock(): string {
  const d = new Date();
  return d.toISOString().slice(11, 19) + " UTC";
}
