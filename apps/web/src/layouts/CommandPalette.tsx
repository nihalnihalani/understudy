import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  CircleCheck,
  FileVideo,
  Network,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/lib/theme";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to page, agent, or receipt…" />
      <CommandList>
        <CommandEmpty>No results. Try &ldquo;synthesize&rdquo;.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/synthesize")}>
            <FileVideo />
            Upload recording
            <CommandShortcut>U</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/agents")}>
            <Sparkles />
            Agent wall
            <CommandShortcut>A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/agents/demo/supply-chain")}>
            <ShieldCheck />
            Supply chain receipt
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Synthesis pipeline">
          <CommandItem onSelect={() => go("/synthesize")}>
            <Activity />
            Start a synthesis run
          </CommandItem>
          <CommandItem
            onSelect={() => go("/agents/demo/supply-chain/dream-query")}
          >
            <Network />
            View Dream Query schema diff
          </CommandItem>
          <CommandItem onSelect={() => go("/agents")}>
            <CircleCheck />
            Verify a signed agent
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
            Switch to {theme === "dark" ? "light" : "dark"} mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
