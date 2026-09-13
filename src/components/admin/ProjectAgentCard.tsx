"use client";

/**
 * ProjectAgentCard — shows the project's active agent and lets the user
 * connect / switch / disconnect agents (one active agent per project).
 */

import { useState } from "react";
import Link from "next/link";
import { Bot, ChevronRight, Info, Link2, Settings2, Sparkles, Unlink } from "lucide-react";
import { useAgents, useProjectAgent } from "@/modules/admin-ui/hooks";
import type { Agent } from "@/modules/admin-ui/hooks";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<Agent["status"], string> = {
  draft:     "bg-amber-500/10 text-amber-300 border-amber-500/30",
  published: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  archived:  "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

function AgentAvatar({ name }: { name: string }) {
  const initials = (name || "A").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 font-semibold text-white text-base">
      {initials || <Bot className="w-5 h-5" />}
    </div>
  );
}

export function ProjectAgentCard({ projectId, orgId }: { projectId: string; orgId?: string }) {
  const { agent, loading, assign, refetch } = useProjectAgent(projectId);
  const { agents } = useAgents(orgId ?? null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agents in this org that could be connected (exclude archived + current)
  const candidates = agents.filter((a) => a.status !== "archived" && a.id !== agent?.id);

  async function handleAssign(agentId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await assign(agentId);
      setSelected("");
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
            <Bot className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Project agent</h2>
            <p className="text-sm text-white/40 mt-1">
              The AI personality that powers this project&apos;s assistant.
            </p>
          </div>
        </div>
        <Link
          href={agent ? `/agents/${agent.id}` : "/agents"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          {agent ? "Configure agent" : "Manage agents"}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="mt-5 h-24 rounded-xl bg-white/[0.03] animate-pulse" />
      ) : agent ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3.5">
            <AgentAvatar name={agent.assistantName || agent.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white truncate">{agent.name}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[agent.status] ?? STATUS_STYLES.draft}`}>
                  {agent.status}
                </span>
              </div>
              <p className="text-sm text-white/40 mt-0.5 truncate">
                Speaks as <span className="text-white/70">{agent.assistantName}</span>
                {agent.voiceId ? ` · voice: ${agent.voiceId}` : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => handleAssign(null)}
              className="border-white/[0.1] text-white/60 hover:border-red-500/30 hover:text-red-300"
            >
              <Unlink className="w-3.5 h-3.5 mr-1.5" /> Disconnect
            </Button>
          </div>

          {candidates.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                aria-label="Switch to another agent"
                className="flex-1 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              >
                <option value="" className="bg-[#0d0d1a]">Switch to a different agent...</option>
                {candidates.map((a) => (
                  <option key={a.id} value={a.id} className="bg-[#0d0d1a]">
                    {a.name} — speaks as {a.assistantName}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!selected || busy}
                onClick={() => handleAssign(selected)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                <Link2 className="w-4 h-4 mr-1.5" /> {busy ? "Switching..." : "Switch"}
              </Button>
            </div>
          )}
        </div>
      ) : candidates.length > 0 ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
            <Sparkles className="w-5 h-5 text-white/20 mx-auto" />
            <p className="text-sm text-white/50 mt-2">No agent connected yet</p>
            <p className="text-xs text-white/25 mt-1">
              Connect one below — it gives this project its name, voice, language and instructions.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Choose an agent to connect"
              className="flex-1 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              <option value="" className="bg-[#0d0d1a]">Choose an agent...</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id} className="bg-[#0d0d1a]">
                  {a.name} — speaks as {a.assistantName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!selected || busy}
              onClick={() => handleAssign(selected)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Link2 className="w-4 h-4 mr-1.5" /> {busy ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
          <p className="text-sm text-white/50">No agent connected yet</p>
          <p className="text-xs text-white/25 mt-1 mb-4">
            Your organisation doesn&apos;t have any agents to connect. Create one first — it only takes a minute.
          </p>
          <Link href="/agents">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white">
              <Sparkles className="w-4 h-4 mr-1.5" /> Create an agent
            </Button>
          </Link>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <Info className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
        <p className="text-xs text-white/40 leading-relaxed">
          A project uses one agent at a time. Connecting a new agent replaces the current one — your knowledge bases stay exactly as they are.
        </p>
      </div>
    </div>
  );
}
