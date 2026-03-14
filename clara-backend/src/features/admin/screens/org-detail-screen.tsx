"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Activity, Building2, CreditCard, Database,
  FolderKanban, Plus, RefreshCw, Trash2, Users, Zap,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { useAuth, useOrg, useOrgAISettings, useProjects } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OrgAISettingsEditor } from "@/components/admin/OrgAISettingsEditor";
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

// ── Projects section (shared by both admin and org views) ────────────────────

function ProjectsSection({
  orgId, projects, loading: projectsLoading,
  create, remove, showBreadcrumbOrgs,
}: {
  orgId: string;
  projects: ReturnType<typeof useProjects>["projects"];
  loading: boolean;
  create: (name: string, desc?: string) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  showBreadcrumbOrgs: boolean;
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

  async function handleDelete(projectId: string) {
    if (!confirm("Delete this project and every knowledge base inside it?")) return;
    setDeletingId(projectId);
    try { await remove(projectId); } finally { setDeletingId(null); }
  }

  return (
    <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-cyan-400" /> Projects
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Projects group knowledge bases for this organisation.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Project
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <form onSubmit={handleCreate} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Project name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer Support"
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

      {projectsLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <Zap className="w-6 h-6 text-indigo-300" />
          </div>
          <p className="font-medium text-white">No projects yet</p>
          <p className="text-sm text-white/40 mt-1">Create a project to start uploading documents and building your knowledge base.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div key={project.id}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-medium text-white">{project.name}</p>
                {project.description && <p className="text-sm text-white/40 mt-1">{project.description}</p>}
                <p className="text-xs text-white/30 mt-1">Created {formatDate(project.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/orgs/${orgId}/projects/${project.id}`}>
                  <Button variant="outline" size="sm">Open KBs</Button>
                </Link>
                <Button variant="outline" size="sm"
                  className="border-rose-500/20 text-rose-300 hover:bg-rose-500/10"
                  onClick={() => handleDelete(project.id)}
                  disabled={deletingId === project.id}>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {deletingId === project.id ? "Deleting..." : "Delete"}
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
  const { settings, loading: settingsLoading, error: settingsError, save: saveAISettings } = useOrgAISettings(id);
  const { projects, loading: projectsLoading, create, remove } = useProjects(id);

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

  const displayName  = org?.name  ?? orgSummary?.name  ?? "Organisation";
  const displaySlug  = org?.slug  ?? orgSummary?.slug  ?? "";
  const activePlan   = orgSummary?.plan_id  ?? "free";
  const subStatus    = orgSummary?.sub_status ?? "inactive";

  // ── ORG USER LAYOUT ─────────────────────────────────────────────────────────
  // Org users see: Projects first (the main action), then Org AI Settings
  // They don't see: platform stats, subscription plan management

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl space-y-8">
        <AdminPageHeader
          icon={Building2}
          title={displayName}
          description="Manage your projects and knowledge bases, and configure your organisation's AI assistant behaviour."
          chips={[`/${displaySlug}`]}
        />

        {/* Quick-start hint when empty */}
        {!projectsLoading && projects.length === 0 && (
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-6 py-5 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20">
              <Zap className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <p className="font-semibold text-white">Get started: create a project</p>
              <p className="text-sm text-white/50 mt-1">
                Projects organise your knowledge bases. Create one below, then add knowledge bases to upload documents and enable your AI assistant.
              </p>
            </div>
          </div>
        )}

        {/* ── Projects — TOP priority for org users ── */}
        <ProjectsSection
          orgId={id}
          projects={projects}
          loading={projectsLoading}
          create={create}
          remove={remove}
          showBreadcrumbOrgs={false}
        />

        {/* ── Org AI Settings ── */}
        {settingsLoading ? (
          <div className="space-y-3">
            <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="h-[28rem] rounded-2xl bg-white/[0.04] animate-pulse" />
          </div>
        ) : (
          <OrgAISettingsEditor orgName={displayName} settings={settings} onSave={saveAISettings} />
        )}
        {settingsError && <p className="text-sm text-rose-400">{settingsError}</p>}

        {/* ── Org Info ── */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-400" /> Organisation Info
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["ID",   id],
              ["Slug", `/${displaySlug}`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-xs text-white/40 mb-1">{label}</div>
                <div className="text-white/80 font-mono text-xs break-all">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── SUPER ADMIN LAYOUT ───────────────────────────────────────────────────────
  // Admins see: stats, subscription management, AI settings, projects, org info

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-8">
      <AdminPageHeader
        icon={Building2}
        title={displayName}
        description="Manage subscription state, org-wide AI policy, and the projects that contain this organisation's knowledge bases."
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

      {/* Org AI Settings */}
      {settingsLoading ? (
        <div className="space-y-3">
          <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-[28rem] rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      ) : (
        <OrgAISettingsEditor orgName={displayName} settings={settings} onSave={saveAISettings} />
      )}
      {settingsError && <p className="text-sm text-rose-400">{settingsError}</p>}

      {/* Projects */}
      <ProjectsSection
        orgId={id}
        projects={projects}
        loading={projectsLoading}
        create={create}
        remove={remove}
        showBreadcrumbOrgs={true}
      />

      {/* Org Info */}
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-violet-400" /> Organisation Info
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["ID",      id],
            ["Slug",    `/${displaySlug}`],
            ["Created", orgSummary?.created_at ? new Date(orgSummary.created_at).toLocaleString() : "—"],
            ["Plan",    activePlan],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs text-white/40 mb-1">{label}</div>
              <div className="text-white/80 font-mono text-xs break-all">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
