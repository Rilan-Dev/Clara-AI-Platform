"use client";

/**
 * src/features/admin/screens/org-agents-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Agents index (/orgs/[id]/agents) — main content while NO agent is selected.
 *
 * The agents and knowledge bases themselves now live in the workspace sidebar
 * (ElevenLabs layout); this screen answers "where do I go from here":
 *   1. how many agents / knowledge bases exist (stats row)
 *   2. what to do next (select-an-agent hint · new agent CTA)
 *   3. fastest path back to recent work (recent agents)
 */

import Link from "next/link";
import { BookOpen, Bot, ChevronRight, MousePointerClick, Plus, Sparkles } from "lucide-react";
import { useAgentsWorkspace } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { WorkspaceButton } from "@/components/admin/ai-platform/shared";
import { useAuth } from "@/modules/admin-ui/hooks";
import { hasOrgCapability } from "@/lib/org-role-capabilities";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function OrgAgentsScreen() {
  const { agents, agentsLoading, kbs, kbsLoading, openCreate } = useAgentsWorkspace();
  const { primaryOrgRole } = useAuth();
  const canCreateAgent = hasOrgCapability(primaryOrgRole, "createAgent");

  const recent = [...agents]
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Bot className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-tight text-foreground">
                {agentsLoading ? "…" : agents.length}
              </p>
              <p className="text-xs text-muted-foreground">Agents</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">
            Each agent groups knowledge bases and carries its own assistant configuration — language, voice and behaviour.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <BookOpen className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-tight text-foreground">
                {kbsLoading ? "…" : kbs.length}
              </p>
              <p className="text-xs text-muted-foreground">Knowledge bases</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">
            Knowledge bases live in the sidebar — open one directly, or manage an agent&apos;s knowledge from its
            Knowledge tab.
          </p>
        </div>
      </div>

      {/* Empty state / next-step hint */}
      {!agentsLoading && agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center sm:px-6 sm:py-16">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium text-foreground">Create your first agent</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            An agent groups knowledge bases and carries its own assistant configuration. Create one to start uploading
            documents and building your knowledge base.
          </p>
          <div className="mt-5 flex justify-center">
            {canCreateAgent && <WorkspaceButton variant="primary" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New Agent
            </WorkspaceButton>}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">
              Select an agent <span className="hidden lg:inline">in the sidebar </span>to configure its assistant,
              knowledge and tools.
            </p>
          </div>
          {canCreateAgent && <WorkspaceButton variant="secondary" onClick={openCreate} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> New Agent
          </WorkspaceButton>}
        </div>
      )}

      {/* Recent agents — fastest path back into ongoing work */}
      {!agentsLoading && recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Recent agents</h2>
          <ul className="space-y-3">
            {recent.map((agent) => (
              <li key={agent.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 transition-colors hover:border-primary/30">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/orgs/${agent.orgId}/agents/${agent.id}`}
                        className="truncate text-sm font-medium text-foreground hover:text-primary"
                      >
                        {agent.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground/80">
                        {agent.description ?? "No description"} · updated {formatDate(agent.updatedAt ?? agent.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Link href={`/orgs/${agent.orgId}/agents/${agent.id}`} className="shrink-0">
                    <WorkspaceButton variant="secondary">
                      Open <ChevronRight className="h-3.5 w-3.5" />
                    </WorkspaceButton>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
