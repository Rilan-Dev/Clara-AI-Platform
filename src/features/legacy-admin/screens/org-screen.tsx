"use client";
/**
 * /admin/orgs/[orgId] — Agents list for an organisation
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useOrg, useOrgAISettings, useAgents } from "@/modules/admin-ui/hooks";
import { OrgAISettingsEditor } from "@/components/admin/OrgAISettingsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OrgPage() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const { data: org, loading: orgLoading } = useOrg(orgId);
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    save: saveAISettings,
  } = useOrgAISettings(orgId);
  const { agents, loading, create, remove } = useAgents(orgId);
  const [name, setName]           = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [creating, setCreating]   = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      await create(name.trim(), description.trim() || undefined);
      setName(""); setDescription(""); setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent and all its knowledge bases?")) return;
    await remove(id).catch(() => {});
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/orgs" className="hover:text-foreground transition-colors">Organisations</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{orgLoading ? "…" : org?.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage agent structure and the organisation-level AI policy in one place.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <PlusIcon /> New Project
        </Button>
      </div>

      <div className="mb-8">
        {settingsLoading ? (
          <div className="space-y-3">
            <div className="h-12 rounded-xl bg-muted/40 animate-pulse" />
            <div className="h-80 rounded-xl bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <OrgAISettingsEditor
            orgName={org?.name ?? "this organisation"}
            settings={settings}
            onSave={saveAISettings}
          />
        )}
        {settingsError && (
          <p className="mt-3 text-sm text-destructive">{settingsError}</p>
        )}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Project Directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Agents group related knowledge bases together.
          </p>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-soft animate-fade-in">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Create Project</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="projName">Name</Label>
                <Input id="projName" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="HR Policies" required disabled={creating} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="projDesc">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="projDesc" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Internal HR documents and policies" disabled={creating} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || !name.trim()}>{creating ? "Creating…" : "Create"}</Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setName(""); setDescription(""); }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {/* Agents */}
      {!loading && (
        <div className="space-y-3">
          {agents.length === 0 && !showForm && (
            <EmptyState
              icon={<FolderIcon />}
              title="No agents yet"
              description="Create an agent to organise your knowledge bases."
              onAction={() => setShowForm(true)}
              actionLabel="Create Project"
            />
          )}
          {agents.map((agent) => (
            <div key={agent.id}
              className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-4 shadow-soft hover:shadow-medium transition-shadow">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10">
                <FolderIcon className="text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/admin/orgs/${orgId}/agents/${agent.id}`}
                  className="font-semibold text-foreground hover:text-primary transition-colors">
                  {agent.name}
                </Link>
                {agent.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{agent.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">Created {formatDate(agent.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/admin/orgs/${orgId}/agents/${agent.id}`}>
                  <Button variant="outline" size="sm" className="h-8">Open →</Button>
                </Link>
                <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(agent.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, description, onAction, actionLabel }: {
  icon: React.ReactNode; title: string; description: string;
  onAction: () => void; actionLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">{icon}</div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button onClick={onAction} variant="default" size="sm"><PlusIcon /> {actionLabel}</Button>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function FolderIcon({ className = "text-muted-foreground" }: { className?: string }) {
  return (
    <svg className={`h-6 w-6 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}
