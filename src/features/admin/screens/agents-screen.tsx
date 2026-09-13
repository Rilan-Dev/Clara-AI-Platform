"use client";

/**
 * Agents list screen — the organisation's library of AI agents.
 * ElevenLabs-style: card grid, status badges, quick create modal.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Sparkles, Mic, Languages, FolderKanban, Trash2, X, Search,
  ArrowRight,
} from "lucide-react";
import { useAuth, useAgents } from "@/modules/admin-ui/hooks";
import type { Agent } from "@/modules/admin-ui/hooks";
import { createAgent as createAgentApi } from "@/modules/admin-ui/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Agent["status"], { dot: string; label: string; cls: string }> = {
  draft:     { dot: "bg-amber-400",    label: "Draft",     cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  published: { dot: "bg-emerald-400",  label: "Published", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  archived:  { dot: "bg-zinc-400",     label: "Archived",  cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" },
};

function StatusBadge({ status }: { status: Agent["status"] }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
];

function AgentAvatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = (name || "A")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const gradient = AVATAR_GRADIENTS[(name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} font-semibold text-white ${
        size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
      }`}
    >
      {initials || <Bot className="h-5 w-5" />}
    </div>
  );
}

// ── Create agent modal ────────────────────────────────────────────────────────

function CreateAgentModal({
  open,
  onClose,
  onCreated,
  defaultOrgId,
  orgs,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: Agent) => void;
  defaultOrgId: string | null;
  orgs: { id: string; name: string }[];
  isSuperAdmin: boolean;
}) {
  const [name, setName] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [description, setDescription] = useState("");
  const [orgId, setOrgId] = useState<string>(defaultOrgId ?? orgs[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Orgs load async — keep the selected org in sync until the user picks one.
  useEffect(() => {
    if (!orgId && orgs[0]?.id) setOrgId(orgs[0].id);
  }, [orgId, orgs]);

  async function handleCreate() {
    if (!name.trim()) { setError("Please give your agent a name."); return; }
    setCreating(true);
    setError(null);
    try {
      const agent = await createAgentApi({
        name: name.trim(),
        assistantName: assistantName.trim() || undefined,
        description: description.trim() || undefined,
        ...(isSuperAdmin || orgId ? { orgId } : {}),
      });
      onCreated(agent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0d0d1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2">
              <Sparkles className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Create a new agent</h3>
              <p className="text-xs text-white/40 mt-0.5">You can configure everything right after</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="agent-name">
              Agent name <span className="text-red-400">*</span>
            </label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Insurance Support Agent"
              className="bg-white/[0.03] border-white/[0.08]"
              autoFocus
            />
            <p className="text-[11px] text-white/30 mt-1.5">Just for you and your team — customers never see this.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="agent-assistant">
              Assistant name
            </label>
            <Input
              id="agent-assistant"
              value={assistantName}
              onChange={(e) => setAssistantName(e.target.value)}
              placeholder={name.trim() || "Clara"}
              className="bg-white/[0.03] border-white/[0.08]"
            />
            <p className="text-[11px] text-white/30 mt-1.5">The name customers see when they chat. We fill this for you if you leave it empty.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="agent-desc">
              What is this agent for?
            </label>
            <Textarea
              id="agent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Answers policy and claim questions for our insurance customers"
              className="bg-white/[0.03] border-white/[0.08] min-h-[70px] resize-none"
            />
          </div>

          {isSuperAdmin && orgs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="agent-org">
                Organisation <span className="text-red-400">*</span>
              </label>
              <select
                id="agent-org"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id} className="bg-[#0d0d1a]">{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {creating ? "Creating..." : "Create agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ agent, onDelete }: { agent: Agent; onDelete: (agent: Agent) => void }) {
  const [confirming, setConfirming] = useState(false);
  const projectCount = agent.projectCount ?? 0;

  return (
    <div className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all">
      <Link href={`/agents/${agent.id}`} className="block" aria-label={`Open agent ${agent.name}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AgentAvatar name={agent.assistantName || agent.name} />
            <div className="min-w-0">
              <p className="font-medium text-white truncate group-hover:text-indigo-200 transition-colors">{agent.name}</p>
              <p className="text-xs text-white/40 truncate mt-0.5">
                Speaks as <span className="text-white/60">{agent.assistantName}</span>
              </p>
            </div>
          </div>
          <StatusBadge status={agent.status} />
        </div>

        {agent.description && (
          <p className="mt-3 text-xs text-white/40 line-clamp-2 leading-relaxed">{agent.description}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-[11px] text-white/50">
            <Mic className="w-3 h-3 text-white/30" />
            {agent.voiceId ? `${agent.voiceProvider ?? "voice"} · ${agent.voiceId}` : "Default voice"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-[11px] text-white/50">
            <Languages className="w-3 h-3 text-white/30" />
            {(agent.allowedLanguages?.length ?? 1)} language{(agent.allowedLanguages?.length ?? 1) === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-[11px] text-white/50">
            <FolderKanban className="w-3 h-3 text-white/30" />
            {projectCount} project{projectCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
          Configure <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </Link>

      {/* Delete */}
      <div className="absolute top-4 right-4">
        {confirming ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-[#0d0d1a] border border-red-500/30 px-2 py-1 shadow-lg">
            <span className="text-[11px] text-white/70">Delete?</span>
            <button
              onClick={() => onDelete(agent)}
              className="text-[11px] font-medium text-red-400 hover:text-red-300"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-[11px] text-white/50 hover:text-white/80"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
            aria-label={`Delete agent ${agent.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AgentsScreen() {
  const { primaryOrgId } = useAuth();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Super admins no longer manage agents (org self-service), so org users are
  // the only audience here: they see their own organisation's agents because
  // the API filters by membership. Pass null (not undefined) so the fetch
  // is enabled.
  const { agents, loading, error, remove } = useAgents(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.assistantName ?? "").toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q),
    );
  }, [agents, search]);

  function handleCreated(agent: Agent) {
    setShowCreate(false);
    router.push(`/agents/${agent.id}`);
  }

  async function handleDelete(agent: Agent) {
    try {
      await remove(agent.id);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const createOrgs = primaryOrgId ? [{ id: primaryOrgId, name: "" }] : [];

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <AdminPageHeader
        icon={Bot}
        title="Agents"
        description="Create reusable AI agents with their own name, personality, voice and language — then connect them to your projects."
        chips={[
          `${agents.length} agent${agents.length === 1 ? "" : "s"}`,
          "Your organisation",
        ]}
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="pl-9 bg-white/[0.03] border-white/[0.08]"
          />
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New agent
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/[0.06]" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 bg-white/[0.06] rounded w-3/4" />
                  <div className="h-2.5 bg-white/[0.04] rounded w-1/2" />
                </div>
              </div>
              <div className="mt-4 h-2.5 bg-white/[0.04] rounded w-full" />
              <div className="mt-2 h-2.5 bg-white/[0.04] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-10 text-center max-w-xl mx-auto">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Bot className="w-7 h-7 text-indigo-300" />
          </div>
          <h3 className="mt-4 font-semibold text-white">
            {search ? "No agents match your search" : "Create your first agent"}
          </h3>
          <p className="mt-2 text-sm text-white/40 leading-relaxed">
            {search
              ? "Try a different name or clear the search box."
              : "An agent is the personality your AI assistant uses — its name, voice, language, and how it answers questions. Create one, configure it, then connect it to a project so it can start helping your customers."}
          </p>
          {!search && (
            <Button
              onClick={() => setShowCreate(true)}
              className="mt-5 bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Create agent
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <CreateAgentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        defaultOrgId={primaryOrgId}
        orgs={createOrgs}
        isSuperAdmin={false}
      />
    </div>
  );
}
