import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, ExternalLink, FileCode2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyRow } from "@/components/common/CopyRow";
import { MemoryDumpPanel, type MemoryDump } from "./MemoryDumpPanel";
import { AgentSparkline } from "./AgentSparkline";
import { AgentRunsTable } from "./AgentRunsTable";
import { relativeTime, truncateDigest } from "@/lib/format";
import type { Agent, AgentRun } from "@/api/types";
import type { AgentCardExtras } from "./AgentCard";

export interface AgentDetailSheetProps {
  agent: Agent | null;
  extras: AgentCardExtras | null;
  memory?: MemoryDump;
  recentRuns?: AgentRun[];
  skillsPinned?: { name: string; version: string; invocations: number }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memoryFixture?: boolean;
  runsFixture?: boolean;
}

export function AgentDetailSheet({
  agent,
  extras,
  memory,
  recentRuns = [],
  skillsPinned = [],
  open,
  onOpenChange,
  memoryFixture,
  runsFixture,
}: AgentDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        {agent && extras ? (
          <>
            <SheetHeader className="border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="font-mono">
                    agent-{agent.id.slice(0, 6)}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-[11px]">
                    {extras.subgraph_id} · last seen {relativeTime(extras.last_seen_at)}
                  </SheetDescription>
                </div>
                {extras.verified ? (
                  <Badge variant="success">
                    <ShieldCheck className="size-3" />
                    signed · SLSA L2
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <ShieldAlert className="size-3" />
                    unsigned
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4">
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="memory">Memory</TabsTrigger>
                    <TabsTrigger value="runs">Runs</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-5">
                    <OverviewTab
                      agent={agent}
                      extras={extras}
                      skillsPinned={skillsPinned}
                    />
                  </TabsContent>

                  <TabsContent value="memory">
                    {memory ? (
                      <MemoryDumpPanel memory={memory} fixture={memoryFixture} />
                    ) : (
                      <EmptyBlock>No memory records returned for this agent yet.</EmptyBlock>
                    )}
                  </TabsContent>

                  <TabsContent value="runs">
                    <AgentRunsTable runs={recentRuns} fixture={runsFixture} />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>No agent selected</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OverviewTab({
  agent,
  extras,
  skillsPinned,
}: {
  agent: Agent;
  extras: AgentCardExtras;
  skillsPinned: { name: string; version: string; invocations: number }[];
}) {
  return (
    <>
      <section aria-label="Agent manifest preview">
        <div className="mb-2 flex items-center gap-1.5">
          <FileCode2 className="size-3 text-faint" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
            manifest
          </span>
        </div>
        <dl className="space-y-0.5 rounded-md border border-border bg-surface/60 px-3 py-2">
          <CopyRow label="id" value={agent.id} />
          <CopyRow label="image" value={agent.image_digest} />
          <CopyRow
            label="endpoint"
            value={agent.graphql_endpoint}
            href={agent.graphql_endpoint}
            tone="accent"
            truncate
          />
          <CopyRow label="ams" value={agent.ams_namespace} />
          <CopyRow label="cosign" value={truncateDigest(agent.cosign_sig, 20, 10)} />
        </dl>
      </section>

      {extras.sparkline && extras.sparkline.length > 0 && (
        <section aria-label="Recent runs sparkline">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">
            activity · last 24 invocations
          </div>
          <div className="rounded-md border border-border bg-surface/60 px-4 py-3">
            <AgentSparkline
              data={extras.sparkline}
              width={480}
              height={48}
              tone="success"
              className="w-full"
            />
          </div>
        </section>
      )}

      {skillsPinned.length > 0 && (
        <section aria-label="Pinned skills">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">
            skills_pinned ({skillsPinned.length})
          </div>
          <ul className="space-y-1 rounded-md border border-border bg-surface/60 p-2 font-mono text-[11px]">
            {skillsPinned.map((s) => (
              <li
                key={`${s.name}@${s.version}`}
                className="flex items-center justify-between gap-3 rounded-sm px-2 py-1 hover:bg-elevated"
              >
                <span className="truncate text-foreground">{s.name}</span>
                <span className="shrink-0 text-muted-foreground">@{s.version}</span>
                <span className="shrink-0 tabular-nums text-faint">
                  {s.invocations.toLocaleString()}×
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <Button asChild variant="primary" size="sm" className="flex-1">
          <Link to={`/agents/${agent.id}/supply-chain`}>
            <ShieldCheck className="size-3.5" />
            View supply chain
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a
            href={agent.graphql_endpoint}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink className="size-3.5" />
            GraphQL
          </a>
        </Button>
      </div>
    </>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/40 px-4 py-8 text-center font-mono text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}
