"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Activity, Bot, Building2, CreditCard, Database,
  Plus, RefreshCw, Trash2, Users, Zap,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { useAuth, useOrg, useAgents } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EditOrgPanel } from "@/components/admin/EditOrgPanel";
import { Button } from "@/components/ui/button";

type OrgSummary = {
  id: string; name: string; slug: string;
  plan_id: string; sub_status: string; price_usd: number;
  kb_count: number; user_count: number; query_count: number; created_at: string;
};
type Plan = { id: string; name: string; price_usd: number };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Agents section (shared by both admin and org views) ─────────────────────

function AgentsSection({
  orgId, agents, loading: agentsLoading,
  create, remove,
}: {
  orgId: string;
  agents: ReturnType<typeof useAgents>["agents"];
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

      {agentsLoading ? (
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
              <div>
                <p className="font-medium text-white">{agent.name}</p>
                {agent.description && <p className="text-sm text-white/40 mt-1">{agent.description}</p>}
                <p className="text-xs text-white/30 mt-1">Created {formatDate(agent.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { user }    = useAuth();
  const isAdmin     = user?.isSuperAdmin ?? false;

  const { data: org } = useOrg(id);
  const { agents, loading: agentsLoading, create, remove } = useAgents(id);

  // Local state so edits reflect immediately without refetch
  const [editedOrg, setEditedOrg] = useState<{ name: string; slug: string; logoUrl?: string | null } | null>(null);

  // Platform-level billing data — only fetched for super admins
  const [orgSummary, setOrgSummary]     = useState<OrgSummary | null>(null);
  const [plans, setPlans]               = useState<Plan[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(isAdmin);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [message, setMessage]           = useState("");

  useEffect(() => {
    // Only super-admins need the platform-wide org summary + plans
    if (!isAdmin) { setLoadingSummary(false); return; }

    Promise.all([
      fetch(apiUrl("/api/platform/orgs?page=1&perPage=200")).then((r) => r.json()),
      fetch(apiUrl("/api/subscriptions/plans")).then((r) => r.json()),
    ])
      .then(([orgsData, plansData]) => {
        const found = (orgsData.orgs ?? []).find((item: OrgSummary) => item.id === id);
        setOrgSummary(found ?? null);
        setPlans(plansData.plans ?? []);
      })
      .finally(() => setLoadingSummary(false));
  }, [id, isAdmin]);

  async function handleChangePlan(planId: string) {
    if (!orgSummary) return;
    setUpdatingPlan(true); setMessage("");
    try {
      await fetch(apiUrl("/api/orgs/subscription"), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId: orgSummary.id, planId }),
      });
      setOrgSummary((c) => (c ? { ...c, plan_id: planId } : c));
      setMessage("Subscription plan updated.");
      window.setTimeout(() => setMessage(""), 2500);
    } finally { setUpdatingPlan(false); }
  }

  // Loading state
  if (loadingSummary && !org) {
    return (
      <div className="p-8 flex items-center gap-3 text-white/40">
        <RefreshCw className="w-5 h-5 animate-spin" /> Loading organisation...
      </div>
    );
  }

  if (!org && !orgSummary) {
    return (
      <div className="p-8">
        <p className="text-white/40">Organisation not found.</p>
        <Link href="/orgs" className="text-indigo-400 text-sm mt-2 inline-block">← Back to orgs</Link>
      </div>
    );
  }

  const displayName  = editedOrg?.name ?? org?.name  ?? orgSummary?.name  ?? "Organisation";
  const displaySlug  = editedOrg?.slug ?? org?.slug  ?? orgSummary?.slug  ?? "";
  const activePlan   = orgSummary?.plan_id  ?? "free";
  const subStatus    = orgSummary?.sub_status ?? "inactive";

  // ── ORG USER LAYOUT ─────────────────────────────────────────────────────────
  // Org users see: Agents first (the main action), then org details
  // They don't see: platform stats, subscription plan management

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8 space-y-8">
        <AdminPageHeader
          icon={Building2}
          title={displayName}
          description="Manage your agents and knowledge bases. Each assistant is configured per agent and knowledge base."
          chips={[`/${displaySlug}`]}
        />

        {/* Quick-start hint when empty */}
        {!agentsLoading && agents.length === 0 && (
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-6 py-5 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20">
              <Zap className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <p className="font-semibold text-white">Get started: create an agent</p>
              <p className="text-sm text-white/50 mt-1">
                Agents organise your knowledge bases. Create one below, then add knowledge bases to upload documents and enable your AI assistant.
              </p>
            </div>
          </div>
        )}

        {/* ── Agents — TOP priority for org users ── */}
        <AgentsSection
          orgId={id}
          agents={agents}
          loading={agentsLoading}
          create={create}
          remove={remove}
        />


        {/* ── Org Details — editable for org_admin ── */}
        <EditOrgPanel
          org={{ id, name: displayName, slug: displaySlug, logoUrl: editedOrg?.logoUrl ?? org?.logoUrl ?? null }}
          isSuperAdmin={false}
          onSaved={(updated) => setEditedOrg(updated)}
        />
      </div>
    );
  }

  // ── SUPER ADMIN LAYOUT ───────────────────────────────────────────────────────
  // Admins see: stats, subscription management, agents, org info

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <AdminPageHeader
        icon={Building2}
        title={displayName}
        description="Manage subscription state and the agents that contain this organisation's knowledge bases."
        breadcrumbs={[
          { label: "Organisations", href: "/orgs" },
          { label: displayName },
        ]}
        chips={[`/${displaySlug}`, activePlan, subStatus]}
        actions={undefined}
      />

      {/* Stats grid */}
      {orgSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Knowledge Bases", value: orgSummary.kb_count,                          icon: Database,    color: "text-indigo-300" },
            { label: "Users",           value: orgSummary.user_count,                         icon: Users,       color: "text-cyan-300"   },
            { label: "Total Queries",   value: orgSummary.query_count.toLocaleString(),        icon: Activity,    color: "text-violet-300" },
            { label: "MRR",             value: orgSummary.price_usd > 0 ? `$${orgSummary.price_usd}/mo` : "Free", icon: CreditCard, color: "text-emerald-300" },
          ].map((item) => (
            <div key={item.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-white/40">{item.label}</div>
                <item.icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <div className="text-2xl font-black text-white">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Subscription plan management */}
      {plans.length > 0 && (
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-400" /> Subscription Plan
          </h2>
          {message && <div className="text-xs text-emerald-400 mb-4">{message}</div>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {plans.map((plan) => (
              <button key={plan.id} onClick={() => handleChangePlan(plan.id)}
                disabled={updatingPlan || activePlan === plan.id}
                className={`p-4 rounded-xl border text-left transition-all ${
                  activePlan === plan.id
                    ? "border-indigo-500/50 bg-indigo-600/10 cursor-default"
                    : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20"
                } disabled:opacity-60`}>
                <div className="text-xs font-semibold text-indigo-400 mb-1">{plan.name}</div>
                <div className="text-sm font-bold text-white">
                  {plan.price_usd === -1 ? "Custom" : plan.price_usd === 0 ? "Free" : `$${plan.price_usd}/mo`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      
      {/* Agents */}
      <AgentsSection
        orgId={id}
        agents={agents}
        loading={agentsLoading}
        create={create}
        remove={remove}
      />

      {/* Org Details — super admin can also edit slug */}
      <EditOrgPanel
        org={{ id, name: displayName, slug: displaySlug, logoUrl: editedOrg?.logoUrl ?? org?.logoUrl ?? null }}
        isSuperAdmin={true}
        onSaved={(updated) => setEditedOrg(updated)}
      />


    </div>
  );
}
