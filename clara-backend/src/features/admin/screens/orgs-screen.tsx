"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Plus, Search, Trash2 } from "lucide-react";
import { useOrgs } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";

export default function OrgsPage() {
  const { orgs, loading, error, create, remove } = useOrgs();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orgs;
    return orgs.filter(
      (org) =>
        org.name.toLowerCase().includes(term) ||
        org.slug.toLowerCase().includes(term),
    );
  }, [orgs, search]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
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

  async function handleDelete(orgId: string) {
    if (!confirm("Delete this organisation and all its projects, knowledge bases, and settings?")) {
      return;
    }

    setDeletingId(orgId);
    try {
      await remove(orgId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <AdminPageHeader
        icon={Building2}
        title="Organisation Workspace"
        description="Create organisations, open their AI policy, and continue through the full project and knowledge-base workflow from one consistent admin surface."
        chips={[
          `${filtered.length} visible organisation${filtered.length === 1 ? "" : "s"}`,
          "Org AI policy",
          "Projects → KBs",
        ]}
        actions={
          <Button onClick={() => setShowForm((current) => !current)} className="gap-2">
            <Plus className="w-4 h-4" /> New Organisation
          </Button>
        }
      />

      <div className="max-w-sm relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or slug..."
          className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {showForm && (
        <div className="mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Create Organisation</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-white/50 mb-1.5">Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Corp"
                disabled={creating}
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
          {formError && <p className="mt-3 text-sm text-rose-400">{formError}</p>}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                <Building2 className="w-6 h-6 text-indigo-300" />
              </div>
              <p className="font-medium text-white">No organisations found</p>
              <p className="text-sm text-white/40 mt-1">Create an organisation to start the full org → project → KB flow.</p>
            </div>
          ) : (
            filtered.map((org) => (
              <div key={org.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 text-sm font-bold text-indigo-300">
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{org.name}</p>
                      <p className="text-xs text-white/35 font-mono truncate">/{org.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/orgs/${org.id}`}>
                      <Button variant="outline" size="sm">Open Projects & AI</Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-rose-500/20 text-rose-300 hover:bg-rose-500/10"
                      onClick={() => handleDelete(org.id)}
                      disabled={deletingId === org.id}
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      {deletingId === org.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
