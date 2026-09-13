"use client";
/**
 * /admin/orgs — Organisation list + create
 */
import Link from "next/link";
import { useState } from "react";
import { useOrgs } from "@/modules/admin-ui/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OrgsPage() {
  const { orgs, loading, error, create, remove } = useOrgs();
  const [name, setName]       = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      await create(name.trim());
      setName("");
      setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this organisation and all its agents and knowledge bases? This cannot be undone.")) return;
    setDeleteId(id);
    try { await remove(id); } catch { /* ignore */ }
    setDeleteId(null);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organisations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your organisations, their agents, and knowledge bases.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant="default">
          <PlusIcon /> New Organisation
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-soft animate-fade-in">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Create Organisation</h2>
          <form onSubmit={handleCreate} className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="orgName">Name</Label>
              <Input
                id="orgName" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp" required disabled={creating}
              />
            </div>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setName(""); }}>
              Cancel
            </Button>
          </form>
          {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Org list */}
      {!loading && !error && (
        <div className="space-y-3">
          {orgs.length === 0 && !showForm && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <OrgIcon />
              </div>
              <div>
                <p className="font-medium text-foreground">No organisations yet</p>
                <p className="text-sm text-muted-foreground">Create your first organisation to get started.</p>
              </div>
              <Button onClick={() => setShowForm(true)} variant="default" size="sm">
                <PlusIcon /> Create Organisation
              </Button>
            </div>
          )}
          {orgs.map((org) => (
            <div key={org.id}
              className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-4 shadow-soft hover:shadow-medium transition-shadow">
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-sm font-bold text-primary">{org.name[0]?.toUpperCase()}</span>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link href={`/admin/orgs/${org.id}`}
                  className="font-semibold text-foreground hover:text-primary transition-colors">
                  {org.name}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Created {formatDate(org.createdAt)} · <span className="font-mono">{org.slug}</span>
                </p>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/admin/orgs/${org.id}`}>
                  <Button variant="outline" size="sm" className="h-8">
                    Projects & AI
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(org.id)}
                  disabled={deleteId === org.id}>
                  {deleteId === org.id ? "…" : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
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

function OrgIcon() {
  return (
    <svg className="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z" />
    </svg>
  );
}
