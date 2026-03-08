"use client";
/**
 * /admin/orgs/[orgId]/projects/[projectId] — Knowledge base list for a project
 */
import Link from "next/link";
import { use, useState } from "react";
import { useOrg, useKbs } from "@/modules/admin-ui/hooks";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { params: Promise<{ orgId: string; projectId: string }> };

export default function ProjectPage({ params }: Props) {
  const { orgId, projectId } = use(params);
  const { data: org } = useOrg(orgId);
  const { kbs, loading, create, remove } = useKbs(projectId);
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
    if (!confirm("Delete this knowledge base and all its documents and vectors?")) return;
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
        <Link href={`/admin/orgs/${orgId}`} className="hover:text-foreground transition-colors">{org?.name ?? "…"}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Knowledge Bases</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Bases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each knowledge base has its own document collection and assistant configuration.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <PlusIcon /> New Knowledge Base
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-soft animate-fade-in">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Create Knowledge Base</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kbName">Name</Label>
                <Input id="kbName" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="HR Handbook 2025" required disabled={creating} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kbDesc">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="kbDesc" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Employee handbook and HR policies" disabled={creating} />
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
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {/* KB list */}
      {!loading && (
        <div className="space-y-3">
          {kbs.length === 0 && !showForm && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <KbIcon />
              </div>
              <div>
                <p className="font-medium text-foreground">No knowledge bases yet</p>
                <p className="text-sm text-muted-foreground">Create one to start uploading documents.</p>
              </div>
              <Button onClick={() => setShowForm(true)} size="sm"><PlusIcon /> Create Knowledge Base</Button>
            </div>
          )}
          {kbs.map((kb) => (
            <div key={kb.id}
              className="rounded-xl border border-card-border bg-card px-5 py-4 shadow-soft hover:shadow-medium transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                  <KbIcon className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link href={`/admin/kbs/${kb.id}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors">
                      {kb.name}
                    </Link>
                    <StatusBadge status={kb.status} />
                  </div>
                  {kb.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{kb.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {formatDate(kb.createdAt)} · Collection: <span className="font-mono">{kb.qdrantCollection}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <Link href={`/admin/kbs/${kb.id}/config`}>
                    <Button variant="outline" size="sm" className="h-8">Config</Button>
                  </Link>
                  <Link href={`/admin/kbs/${kb.id}`}>
                    <Button variant="default" size="sm" className="h-8">Documents →</Button>
                  </Link>
                  <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(kb.id)}>
                    Delete
                  </Button>
                </div>
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

function KbIcon({ className = "text-muted-foreground" }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}
