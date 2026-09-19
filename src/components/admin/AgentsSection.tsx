"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, ChevronRight, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type Agent = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

/**
 * AgentsSection — create / open / delete agents inside an organisation.
 * Agents group knowledge bases; each carries its own assistant configuration.
 */
export function AgentsSection({
  orgId, agents, loading, create, remove,
}: {
  orgId: string;
  agents: Agent[];
  loading: boolean;
  create: (name: string, desc?: string) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm]     = useState(false);
  const [name, setName]             = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError]   = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true); setFormError(null);
    try {
      await create(name.trim(), description.trim() || undefined);
      setName(""); setDescription(""); setShowForm(false);
    } catch (err) { setFormError((err as Error).message); }
    finally { setCreating(false); }
  }

  async function handleDelete(agentId: string) {
    if (!confirm("Delete this agent and every knowledge base inside it?")) return;
    setDeletingId(agentId);
    try { await remove(agentId); } finally { setDeletingId(null); }
  }

  return (
    <div className="border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
        <div>
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" /> Agents
          </h2>
          {/* Desktop explanatory text — noise on phones, the empty state
              already explains what agents are. */}
          <p className="hidden sm:block text-sm text-muted-foreground mt-1">
            Agents group knowledge bases for this organisation. Each agent carries its own assistant configuration.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2 shrink-0 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> New Agent
        </Button>
      </div>

      {showForm && (
        <div className="mb-4 sm:mb-6 rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
          {/* Mobile: single column with 16px body text (iOS form spec);
              desktop keeps the 3-col layout. */}
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Agent name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer Support Agent"
                className="w-full bg-background border border-input rounded-xl px-4 py-3 md:py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context"
                className="w-full bg-background border border-input rounded-xl px-4 py-3 md:py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || !name.trim()} className="flex-1 md:flex-none">
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
          {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 sm:px-6 sm:py-12 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <p className="font-medium text-foreground">No agents yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create an agent to start uploading documents and building your knowledge base.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id}
              className="rounded-xl border border-border bg-surface px-4 sm:px-5 py-4 flex flex-col gap-3.5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{agent.name}</p>
                {agent.description && <p className="text-sm text-muted-foreground mt-1 truncate">{agent.description}</p>}
                <p className="text-xs text-muted-foreground/70 mt-1">Created {formatDate(agent.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Mobile: Open grows full-width with a chevron, Delete
                    collapses to an icon-only danger button. */}
                <Link href={`/orgs/${orgId}/agents/${agent.id}`} className="flex-1 md:flex-none">
                  <Button variant="outline" size="sm" className="w-full md:w-auto gap-1.5">
                    <ChevronRight className="w-4 h-4 md:hidden" />
                    Open
                  </Button>
                </Link>
                <Button variant="outline" size="sm"
                  className="border-destructive/20 text-destructive hover:bg-destructive/10 px-2.5 md:px-3"
                  aria-label={`Delete agent ${agent.name}`}
                  onClick={() => handleDelete(agent.id)}
                  disabled={deletingId === agent.id}>
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden md:inline ml-1.5">{deletingId === agent.id ? "Deleting..." : "Delete"}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
