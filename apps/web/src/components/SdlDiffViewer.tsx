import { cn } from "@/lib/cn";

type DiffLine = {
  type: "add" | "remove" | "context";
  text: string;
};

interface Props {
  sdlDelta: string;
  removedSdl?: string;
}

const GQL_KEYWORDS = new Set([
  "extend",
  "type",
  "input",
  "enum",
  "interface",
  "union",
  "scalar",
  "schema",
  "directive",
  "query",
  "mutation",
  "subscription",
  "on",
  "implements",
  "true",
  "false",
  "null",
]);

function highlight(line: string): React.ReactNode {
  // Small, intentional syntax highlighter — full PrismJS is overkill for 50 lines.
  const parts: React.ReactNode[] = [];
  // Strings first.
  const strSplit = line.split(/(""".*?"""|"[^"]*")/g);
  strSplit.forEach((seg, i) => {
    if (i % 2 === 1) {
      parts.push(
        <span key={`s${i}`} className="text-accent-amber">
          {seg}
        </span>
      );
      return;
    }
    const tokens = seg.split(/(\b\w+\b|[!{}()[\]:,=@])/);
    tokens.forEach((tok, j) => {
      if (!tok) return;
      if (GQL_KEYWORDS.has(tok)) {
        parts.push(
          <span key={`k${i}-${j}`} className="text-primary-300 font-medium">
            {tok}
          </span>
        );
      } else if (/^[A-Z][A-Za-z0-9_]*$/.test(tok)) {
        parts.push(
          <span key={`t${i}-${j}`} className="text-accent-cyan">
            {tok}
          </span>
        );
      } else if (tok.startsWith("@")) {
        parts.push(
          <span key={`d${i}-${j}`} className="text-primary-300">
            {tok}
          </span>
        );
      } else {
        parts.push(<span key={`n${i}-${j}`}>{tok}</span>);
      }
    });
  });
  return parts;
}

function parse(sdlAdded: string, sdlRemoved: string): DiffLine[] {
  const out: DiffLine[] = [];
  sdlRemoved
    .split("\n")
    .forEach((l) => out.push({ type: "remove", text: l }));
  sdlAdded
    .split("\n")
    .forEach((l) => out.push({ type: "add", text: l }));
  return out;
}

export function SdlDiffViewer({ sdlDelta, removedSdl = "" }: Props) {
  const lines = parse(sdlDelta, removedSdl);
  return (
    <div
      className="card p-0 overflow-hidden"
      role="region"
      aria-label="SDL delta diff"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="text-[13px] font-medium">
          SDL Delta — <span className="font-mono text-fg-muted">extend type Query</span>
        </div>
        <div className="text-mono-sm font-mono text-fg-muted">
          dream_queries.sdl_delta (GraphQL)
        </div>
      </div>
      <pre className="m-0 p-0 text-mono-lg font-mono max-h-[520px] overflow-auto scrollbar-tight">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 px-2 py-0.5 min-h-[22px]",
              line.type === "add" && "diff-plus",
              line.type === "remove" && "diff-minus"
            )}
          >
            <span className="w-8 text-right text-fg-faint select-none tabular-nums">
              {i + 1}
            </span>
            <span
              className={cn(
                "w-4 select-none",
                line.type === "add" && "text-accent-emerald",
                line.type === "remove" && "text-accent-crimson",
                line.type === "context" && "text-fg-faint"
              )}
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span className="flex-1">{highlight(line.text)}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
