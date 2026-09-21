"use client";

/**
 * /orgs/[id]/agents/[agentId]/knowledge — the agent's knowledge bases
 * (content stays live; version configs only record attachments for diffs).
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, Plus, X } from "lucide-react";
import { useState } from "react";
import { useKbs } from "@/modules/admin-ui/hooks";
import { AgentWorkspaceHeader, useAgentWorkspaceContext } from "@/components/admin/agent-workspace/AgentWorkspaceHeader";
import { WorkspaceButton } from "@/components/admin/ai-platform/shared";

export default function AgentKnowledgeScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { context, loading } = useAgentWorkspaceContext(agentId);
  const { kbs, loading: kbsLoading, create } = useKbs(agentId);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setCreating(true);
    setCreateError(null);
    try {
      const kb = await create(trimmedName, description.trim() || undefined);
      setName("");
      setDescription("");
      setCreateOpen(false);
      window.location.href = `/kbs/${kb.id}`;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create knowledge base");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AgentWorkspaceHeader tab="knowledge" context={context} loading={loading} />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Knowledge bases</h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Attach existing knowledge or create a new knowledge base for this agent.
            </p>
          </div>
          <WorkspaceButton variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New knowledge base
          </WorkspaceButton>
        </div>

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

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-kb-title">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 id="create-kb-title" className="text-base font-semibold text-foreground">Create knowledge base</h3>
                <p className="mt-1 text-xs text-muted-foreground/70">Create it here and start adding documents immediately.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-foreground/90">Name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product Documentation" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-foreground/90">Description <span className="font-normal text-muted-foreground">(optional)</span></span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What should this knowledge base contain?" className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </label>
              {createError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{createError}</p>}
              <div className="flex justify-end gap-2">
                <WorkspaceButton variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</WorkspaceButton>
                <WorkspaceButton variant="primary" onClick={() => void handleCreate()} disabled={creating || !name.trim()}>
                  {creating ? "Creating…" : "Create knowledge base"}
                </WorkspaceButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
