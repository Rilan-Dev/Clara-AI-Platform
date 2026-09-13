"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, Plus, Trash2, Zap } from "lucide-react";
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
    <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" /> Agents
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Agents group knowledge bases for this organisation. Each agent carries its own assistant configuration.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Agent
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <form onSubmit={handleCreate} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Agent name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer Support Agent"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
          {formError && <p className="mt-3 text-sm text-rose-400">{formError}</p>}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <Zap className="w-6 h-6 text-indigo-300" />
          </div>
          <p className="font-medium text-white">No agents yet</p>
          <p className="text-sm text-white/40 mt-1">Create an agent to start uploading documents and building your knowledge base.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-white truncate">{agent.name}</p>
                {agent.description && <p className="text-sm text-white/40 mt-1 truncate">{agent.description}</p>}
                <p className="text-xs text-white/30 mt-1">Created {formatDate(agent.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/orgs/${orgId}/agents/${agent.id}`}>
                  <Button variant="outline" size="sm">Open Agent</Button>
                </Link>
                <Button variant="outline" size="sm"
                  className="border-rose-500/20 text-rose-300 hover:bg-rose-500/10"
                  onClick={() => handleDelete(agent.id)}
                  disabled={deletingId === agent.id}>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {deletingId === agent.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
