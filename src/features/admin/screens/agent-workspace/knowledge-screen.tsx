"use client";

/**
 * /orgs/[id]/agents/[agentId]/knowledge — the agent's knowledge bases
 * (content stays live; version configs only record attachments for diffs).
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useKbs } from "@/modules/admin-ui/hooks";
import { AgentWorkspaceHeader, useAgentWorkspaceContext } from "@/components/admin/agent-workspace/AgentWorkspaceHeader";
import { WorkspaceButton } from "@/components/admin/ai-platform/shared";

export default function AgentKnowledgeScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { context, loading } = useAgentWorkspaceContext(agentId);
  const { kbs, loading: kbsLoading } = useKbs(agentId);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AgentWorkspaceHeader tab="knowledge" context={context} loading={loading} />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Knowledge bases</h2>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Knowledge content is live — it is never versioned or rolled back with agent configuration.
        </p>

        {kbsLoading ? (
          <div className="mt-4 space-y-2.5">
            <div className="h-14 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-14 animate-pulse rounded-xl bg-muted/60" />
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {kbs.map((kb) => (
              <li key={kb.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Link href={`/kbs/${kb.id}`} className="truncate text-sm font-medium text-foreground hover:text-primary">
                      {kb.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground/60">
                      {kb.description ?? "No description"} · {kb.status}
                    </p>
                  </div>
                </div>
                <Link href={`/kbs/${kb.id}`}>
                  <WorkspaceButton variant="secondary">Open</WorkspaceButton>
                </Link>
              </li>
            ))}
            {kbs.length === 0 && (
              <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground/70">
                No knowledge bases attached to this agent yet.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
