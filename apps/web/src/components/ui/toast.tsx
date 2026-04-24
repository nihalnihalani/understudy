import { Toaster as SonnerToaster, toast } from "sonner";
import { useTheme } from "@/lib/theme";

/**
 * Wrapper over sonner that wires it into the Understudy theme. Import `toast`
 * from here so callers never touch sonner directly.
 */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-surface border border-border text-foreground shadow-md rounded-md font-sans text-[13px]",
          description: "text-muted-foreground text-[12px]",
          actionButton:
            "bg-primary text-primary-foreground rounded-sm px-2 py-1 text-[12px] font-medium",
          cancelButton:
            "bg-elevated text-muted-foreground rounded-sm px-2 py-1 text-[12px]",
          error: "!bg-destructive/10 !text-destructive !border-destructive/35",
          success: "!bg-success/10 !text-success !border-success/35",
          warning: "!bg-warning/10 !text-warning !border-warning/35",
          info: "!bg-primary/10 !text-primary-soft !border-primary/40",
        },
      }}
    />
  );
}

export { toast };
