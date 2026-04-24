import { useState } from "react";
import { Copy, Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScriptPanelProps {
  lines: string[];
  filename?: string;
  footerNote?: string;
}

import { motion } from "framer-motion";

import { Scanlines } from "@/components/ui/scanlines";

export function ScriptPanel({
  lines,
  filename = "tinyfish_run.ts",
  footerNote = "SWE-bench 78% · emitted by gemini-3-flash",
}: ScriptPanelProps) {
  const [copied, setCopied] = useState(false);
  const source = lines.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard denied — silent, button still hints the action */
    }
  };

  const download = () => {
    const blob = new Blob([source], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] overflow-hidden relative">
      <header className="flex items-center justify-between border-b border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl relative z-20">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {filename}
          </span>
          <Badge variant="primary">TypeScript</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy script">
            {copied ? (
              <>
                <Check className="size-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Copy
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={download}
            aria-label="Download script"
          >
            <Download className="size-3.5" /> Download
          </Button>
        </div>
      </header>
      <ScrollArea className="flex-1 bg-black/60 backdrop-blur-md relative overflow-hidden">
        <Scanlines className="opacity-30" />
        <pre className="m-0 p-3 font-mono text-[12px] leading-[1.65] relative z-10">
          <motion.div
            variants={{
              show: {
                transition: {
                  staggerChildren: 0.03,
                },
              },
            }}
            initial="hidden"
            animate="show"
          >
            {lines.map((line, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, x: -5 },
                  show: { opacity: 1, x: 0 },
                }}
                className="flex gap-3"
              >
                <span className="w-6 shrink-0 select-none text-right tabular-nums text-faint">
                  {i + 1}
                </span>
                <span className={cn(highlightFor(line))}>{line || " "}</span>
              </motion.div>
            ))}
          </motion.div>
        </pre>
      </ScrollArea>
      <footer className="flex items-center justify-between border-t border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-muted-foreground backdrop-blur-xl relative z-20">
        <span>{footerNote}</span>
        <Badge variant="success">SWE-bench 78%</Badge>
      </footer>
    </div>
  );
}

function highlightFor(line: string): string {
  const t = line.trimStart();
  if (t.startsWith("//")) return "italic text-faint";
  if (t.startsWith("import")) return "text-primary-soft";
  if (t.startsWith("export ")) return "text-accent";
  if (t.startsWith("return ")) return "text-warning";
  if (t.startsWith("const ") || t.startsWith("let ") || t.startsWith("var "))
    return "text-primary-soft";
  if (t.startsWith("await ")) return "text-accent";
  return "text-foreground";
}
