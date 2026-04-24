import { Fragment } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Crumb {
  label: string;
  to?: string;
  mono?: boolean;
}

function short(id: string) {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/**
 * Compute breadcrumbs from the current URL. Uses useParams for named
 * segments (`:id`) so IDs get the monospace treatment.
 */
function buildCrumbs(pathname: string, params: Record<string, string | undefined>): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Home" }];

  const crumbs: Crumb[] = [];
  const [root, ...rest] = segments;

  if (root === "synthesize") {
    crumbs.push({ label: "Synthesis", to: "/synthesize" });
    if (params.id) {
      crumbs.push({
        label: short(params.id),
        mono: true,
        to: `/synthesize/${params.id}`,
      });
    }
    if (rest.at(-1) === "dream-query") {
      crumbs.push({ label: "Dream Query" });
    }
  } else if (root === "agents") {
    crumbs.push({ label: "Agents", to: "/agents" });
    if (params.id) {
      crumbs.push({
        label: short(params.id),
        mono: true,
        to: `/agents/${params.id}`,
      });
    }
    if (rest.at(-1) === "supply-chain") {
      crumbs.push({ label: "Supply Chain" });
    }
  } else {
    segments.forEach((s, i) => {
      crumbs.push({
        label: s,
        to: "/" + segments.slice(0, i + 1).join("/"),
      });
    });
  }

  return crumbs;
}

export function Breadcrumbs({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const params = useParams<Record<string, string>>();
  const crumbs = buildCrumbs(pathname, params);

  return (
    <nav
      className={cn(
        "flex items-center gap-1.5 text-[12px] text-muted-foreground",
        className
      )}
      aria-label="Breadcrumb"
    >
      {crumbs.map((crumb, idx) => {
        const last = idx === crumbs.length - 1;
        const content = (
          <span
            className={cn(
              crumb.mono && "font-mono text-[11px]",
              last ? "text-foreground" : "hover:text-foreground transition-colors duration-fast"
            )}
          >
            {crumb.label}
          </span>
        );
        return (
          <Fragment key={`${crumb.label}-${idx}`}>
            {idx > 0 && (
              <ChevronRight className="size-3 shrink-0 text-faint" />
            )}
            {crumb.to && !last ? (
              <Link to={crumb.to}>{content}</Link>
            ) : (
              content
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
