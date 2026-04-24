import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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

import { BackgroundGlows } from "@/components/ui/background-glows";
import RetroGrid from "@/components/ui/retro-grid";

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(() => setPaletteOpen(true));
  const location = useLocation();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary-strong overflow-hidden relative">
        <BackgroundGlows />
        <RetroGrid className="opacity-20" />
        {/* Grid Background */}
        <div className="pointer-events-none absolute inset-0 z-0 h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]">
          <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_0%,hsl(var(--background))_100%]"></div>
        </div>

        <Sidebar onCommandPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col relative z-10">
          <TopBar />
          <main className="flex-1 overflow-x-hidden relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.15 } }}
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                className="w-full px-6 lg:px-10 xl:px-12 pt-3 pb-4"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
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
          "mx-3 mt-4 flex h-9 items-center gap-2 rounded-md border border-border-strong bg-elevated/50 px-3 text-[13px] text-muted-foreground shadow-sm",
          "transition-all duration-fast",
          "hover:border-primary/30 hover:bg-elevated hover:text-foreground hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Quick jump…</span>
        <Kbd className="bg-background">⌘K</Kbd>
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
          "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none",
          "transition-all duration-fast",
          "focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          active
            ? "bg-elevated text-foreground font-medium shadow-sm"
            : "text-muted-foreground hover:bg-elevated/80 hover:text-foreground"
        );
      }}
    >
      {({ isActive }) => {
        const active =
          isActive ||
          (item.match ? item.match.test(window.location.pathname) : false);
        return (
          <>
            {active && (
              <>
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 h-5 w-0.5 rounded-r-full bg-primary z-20"
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  aria-hidden
                />
                <motion.div
                  layoutId="nav-glow"
                  className="absolute inset-0 z-0 bg-primary/5 blur-md rounded-md"
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  aria-hidden
                />
              </>
            )}
            <item.icon
              className={cn(
                "relative z-10 size-4 shrink-0 transition-colors duration-fast",
                active ? "text-primary" : "text-faint group-hover:text-muted-foreground"
              )}
            />
            <span className="relative z-10">{item.label}</span>
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
        "sticky top-0 z-20 flex h-14 shrink-0 items-center gap-6 border-b border-border bg-background/60 px-6 lg:px-10 xl:px-12 backdrop-blur-md"
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
      <div className="flex h-full items-center justify-between px-6 lg:px-10 xl:px-12 font-mono text-[10px] text-faint">
        <span>pipeline · flash-lite → 3.1 pro → 3 flash</span>
        <span>SLSA L2 · cosign · Fulcio · Rekor</span>
        <span>apps/web · vite</span>
      </div>
    </footer>
  );
}

import { ShinyText } from "@/components/ui/shiny-text";

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
    <div className="mb-4 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-faint">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          <ShinyText>{title}</ShinyText>
        </h1>
        {description && (
          <p className="mt-1.5 max-w-[68ch] text-[14px] text-muted-foreground">
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
