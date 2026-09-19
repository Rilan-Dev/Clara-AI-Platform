"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Pencil, Plus, Search, Trash2, X, Save, Sparkles } from "lucide-react";
import { useOrgs } from "@/modules/admin-ui/hooks";
import * as api from "@/modules/admin-ui/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { WorkspaceWizard } from "@/components/admin/WorkspaceWizard";

function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }

export default function OrgsPage() {
  const { orgs, loading, error, create, remove, refetch } = useOrgs();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => { const term = search.trim().toLowerCase(); return term ? orgs.filter(o => o.name.toLowerCase().includes(term) || o.slug.toLowerCase().includes(term)) : orgs; }, [orgs, search]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim()) return; setCreating(true); setFormError(null);
    try { await create(name.trim()); setName(""); setShowForm(false); } catch (err) { setFormError((err as Error).message); } finally { setCreating(false); }
  }

  async function handleSave(orgId: string) {
    if (!editName.trim()) return;
    setSavingId(orgId);
    try { await api.updateOrg(orgId, editName.trim(), editLogo.trim() || undefined); setEditingId(null); await refetch(); }
    finally { setSavingId(null); }
  }

  async function handleDelete(orgId: string) {
    if (!confirm("Delete this organisation profile and its tenant data?")) return;
    setDeletingId(orgId); try { await remove(orgId); } finally { setDeletingId(null); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <AdminPageHeader
        icon={Building2}
        title="Organisations"
        description="Manage organisation profiles and view platform-level resource counts. Tenant projects, knowledge bases, members, and AI configuration are intentionally not accessible here."
        chips={[`${filtered.length} organisations`, "Profiles only", "Platform summaries"]}
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => { setShowForm(v => !v); setShowWizard(false); }} className="gap-2"><Plus className="w-4 h-4" /> Quick Profile</Button>
            <Button onClick={() => { setShowWizard(v => !v); setShowForm(false); }} className="gap-2"><Sparkles className="w-4 h-4" /> New Workspace</Button>
          </div>
        }
      />

      {showWizard && <WorkspaceWizard onCreated={() => { refetch(); }} />}

      <div className="max-w-sm relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or slug..." className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" /></div>

      {showForm && <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm"><h2 className="text-sm font-semibold text-foreground mb-4">Create Organisation Profile</h2><form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><label className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" disabled={creating} className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" /></div><div className="flex gap-2"><Button type="submit" disabled={creating || !name.trim()}>{creating ? "Creating..." : "Create"}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div></form>{formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}</div>}

      {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}</div>}
      {error && <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm text-destructive">{error}</div>}

      {!loading && !error && <div className="grid gap-4">{filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center"><Building2 className="w-8 h-8 text-primary mx-auto mb-3" /><p className="font-medium text-foreground">No organisations found</p></div> : filtered.map(org => {
        const editing = editingId === org.id;
        return <div key={org.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4 min-w-0"><div className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">{org.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="font-semibold text-foreground truncate">{org.name}</p><p className="text-xs text-muted-foreground/70 truncate">Created {formatDate(org.createdAt)} · <span className="font-mono">/{org.slug}</span></p></div></div>
            <div className="flex items-center gap-2"><Link href={`/orgs/${org.id}`} className="flex-1 md:flex-none"><Button variant="outline" size="sm" className="w-full md:w-auto">Open</Button></Link><Button variant="outline" size="sm" aria-label={`Edit ${org.name}`} onClick={() => { setEditingId(org.id); setEditName(org.name); setEditLogo(org.logoUrl ?? ""); }}><Pencil className="w-3.5 h-3.5" /></Button><Button variant="outline" size="sm" aria-label={`Delete ${org.name}`} className="border-destructive/20 text-destructive hover:bg-destructive/10 px-2.5" onClick={() => handleDelete(org.id)} disabled={deletingId === org.id}><Trash2 className="w-3.5 h-3.5" /></Button></div>
          </div>
          <div className="mt-4 sm:mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 max-w-md"><div className="rounded-xl border border-border/70 bg-muted/50 p-3 sm:p-4"><p className="text-xs text-muted-foreground/70">Agents</p><p className="text-lg sm:text-xl font-bold text-foreground mt-1">{org.agentCount ?? 0}</p></div><div className="rounded-xl border border-border/70 bg-muted/50 p-3 sm:p-4"><p className="text-xs text-muted-foreground/70">Knowledge Bases</p><p className="text-lg sm:text-xl font-bold text-foreground mt-1">{org.knowledgeBaseCount ?? 0}</p></div></div>
          {editing && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex justify-between items-center mb-4"><p className="text-sm font-semibold text-foreground">Organisation profile</p><button onClick={() => setEditingId(null)} className="text-muted-foreground/70 hover:text-foreground"><X className="w-4 h-4" /></button></div><div className="grid md:grid-cols-2 gap-3"><div><label className="text-xs text-muted-foreground/70">Name</label><input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground" /></div><div><label className="text-xs text-muted-foreground/70">Logo URL</label><input value={editLogo} onChange={e => setEditLogo(e.target.value)} className="mt-1 w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground" /></div></div><div className="flex gap-2 mt-3"><Button onClick={() => handleSave(org.id)} disabled={savingId === org.id || !editName.trim()}><Save className="w-3.5 h-3.5 mr-1.5" />{savingId === org.id ? "Saving..." : "Save"}</Button><Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button></div></div>}
        </div>;
      })}</div>}
    </div>
  );
}
