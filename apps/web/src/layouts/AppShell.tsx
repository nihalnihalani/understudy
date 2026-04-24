import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  FileVideo,
  Activity,
  Network,
  ShieldCheck,
  Sparkles,
  Search,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "@/components/brand/Wordmark";
import { Breadcrumbs } from "./Breadcrumbs";
import { HealthRail } from "./HealthRail";
import {
  CommandPalette,
  useCommandPaletteHotkey,
} from "./CommandPalette";

interface NavItem {
  to: string;
  label: string;
  icon: typeof FileVideo;
  endAdornment?: string;
  match?: RegExp;
}

const NAV: NavItem[] = [
  { to: "/synthesize", label: "Upload", icon: FileVideo, match: /^\/synthesize\/?$/ },
  {
    to: "/synthesize/demo",
    label: "Synthesis",
    icon: Activity,
    match: /^\/synthesize\/[^/]+$/,
  },
  {
    to: "/synthesize/demo/dream-query",
    label: "Dream Query",
    icon: Network,
    match: /dream-query$/,
  },
  {
    to: "/agents/demo/supply-chain",
    label: "Supply Chain",
    icon: ShieldCheck,
    match: /supply-chain$/,
  },
  { to: "/agents", label: "Agents", icon: Sparkles, match: /^\/agents\/?$/ },
];

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(() => setPaletteOpen(true));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar onCommandPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1400px] px-8 py-6">
              <Outlet />
            </div>
          </main>
          <Footer />
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </TooltipProvider>
  );
}

function Sidebar({ onCommandPalette }: { onCommandPalette: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-surface"
      )}
      aria-label="Primary navigation"
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <NavLink to="/" className="flex items-center gap-2">
          <Wordmark />
        </NavLink>
      </div>

      <button
        onClick={onCommandPalette}
        className={cn(
          "mx-3 mt-4 flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[12px] text-muted-foreground",
          "transition-colors duration-fast",
          "hover:border-border-strong hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Quick jump…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="mt-4 flex flex-col gap-0.5 px-2" aria-label="Sections">
        {NAV.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border p-3">
        <a
          href="https://github.com/nihalnihalani/understudy"
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground",
            "transition-colors duration-fast",
            "hover:bg-elevated hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <BookOpen className="size-3.5" />
          <span className="flex-1">Documentation</span>
          <ExternalLink className="size-3 text-faint" />
        </a>
        <div className="flex items-center justify-between pl-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
            Theme
          </span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/synthesize" || item.to === "/agents"}
      className={({ isActive }) => {
        const active =
          isActive ||
          (item.match ? item.match.test(window.location.pathname) : false);
        return cn(
          "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px]",
          "transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-elevated text-foreground"
            : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground"
        );
      }}
    >
      {({ isActive }) => {
        const active =
          isActive ||
          (item.match ? item.match.test(window.location.pathname) : false);
        return (
          <>
            <span
              aria-hidden
              className={cn(
                "absolute left-0 h-4 w-0.5 rounded-r-full transition-colors duration-fast",
                active ? "bg-primary" : "bg-transparent"
              )}
            />
            <item.icon
              className={cn(
                "size-3.5 shrink-0",
                active ? "text-primary" : "text-faint group-hover:text-muted"
              )}
            />
            {item.label}
          </>
        );
      }}
    </NavLink>
  );
}

function TopBar() {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 shrink-0 items-center gap-6 border-b border-border bg-background/80 px-8 backdrop-blur"
      )}
    >
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-3">
        <HealthRail />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="h-10 shrink-0 border-t border-border bg-surface">
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-8 font-mono text-[10px] text-faint">
        <span>pipeline · flash-lite → 3.1 pro → 3 flash</span>
        <span>SLSA L2 · cosign · Fulcio · Rekor</span>
        <span>apps/web · vite</span>
      </div>
    </footer>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-[68ch] text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export { Button };
