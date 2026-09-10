"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BookOpen, FolderKanban, Plus, Trash2 } from "lucide-react";
import { useAuth, useOrg, useKbs, useProject } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EditProjectPanel } from "@/components/admin/EditProjectPanel";
import { Button } from "@/components/ui/button";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProjectDetailPage() {
  const { id = "", projectId = "" } = useParams<{ id: string; projectId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { data: org } = useOrg(id);
  const { data: project } = useProject(projectId);
  const { kbs, loading, create, remove } = useKbs(projectId);

  // Local state so edits reflect immediately
  const [editedProject, setEditedProject] = useState<{ name: string; description?: string | null } | null>(null);

  // RBAC: super_admin and org_admin can edit; project_manager can also edit
  const canEditProject = Boolean(user?.isSuperAdmin) || true; // org role checked server-side

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setFormError(null);
    try {
      await create(name.trim(), description.trim() || undefined);
      setName("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(kbId: string) {
    if (!confirm("Delete this knowledge base and all indexed content?")) return;
    setDeletingId(kbId);
    try {
      await remove(kbId);
    } finally {
      setDeletingId(null);
    }
  }

  if (isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl space-y-8">
        <AdminPageHeader
          icon={FolderKanban}
          title={editedProject?.name ?? project?.name ?? "Knowledge Bases"}
          description="View project details and access to knowledge bases for this project."
          breadcrumbs={[
            { label: "Organisations", href: "/orgs" },
            { label: org?.name ?? "Organisation", href: `/orgs/${id}` },
            { label: "Projects", href: `/orgs/${id}` },
            { label: project?.name ?? "Project" },
          ]}
          chips={[
            `${kbs.length} KB${kbs.length === 1 ? "" : "s"}`,
            project?.description ?? "Project workspace",
          ]}
        />

        {/* Project details — read-only for platform admins */}
        {project && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
                <FolderKanban className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Project Details</h2>
                <p className="text-sm text-white/40 mt-1">
                  Platform admins can view project details but cannot edit them.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium text-white">{project.name}</p>
                    {project.description && (
                      <p className="text-sm text-white/40 mt-1">{project.description}</p>
                    )}
                    <p className="text-xs text-white/30 mt-1">
                      Created {formatDate(project.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((item) => (
              <div key={item} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : kbs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
              <BookOpen className="w-6 h-6 text-indigo-300" />
            </div>
            <p className="font-medium text-white">No knowledge bases available</p>
            <p className="text-sm text-white/40 mt-1">
              Platform admins can view knowledge bases but cannot manage them.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {kbs.map((kb) => (
              <div key={kb.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-medium text-white">{kb.name}</p>
                    <StatusBadge status={kb.status} />
                  </div>
                  {kb.description && (
                    <p className="text-sm text-white/40 mt-1">{kb.description}</p>
                  )}
                  <p className="text-xs text-white/30 mt-1">
                    Created {formatDate(kb.createdAt)} · <span className="font-mono">{kb.qdrantCollection}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/kbs/${kb.id}/config?orgId=${id}&projectId=${projectId}`}>
                    <Button variant="outline" size="sm">Assistant & AI</Button>
                  </Link>
                  <Link href={`/kbs/${kb.id}?orgId=${id}&projectId=${projectId}`}>
                    <Button size="sm">Open KB</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-8">
      <AdminPageHeader
        icon={FolderKanban}
        title={editedProject?.name ?? project?.name ?? "Knowledge Bases"}
        description="Create knowledge bases, open assistant configuration, and continue into the runtime and deployment workflow for this project."
        breadcrumbs={[
          // Org users go directly to their org page; admins go to the full orgs list
          user?.isSuperAdmin
            ? { label: "Organisations", href: "/orgs" }
            : { label: org?.name ?? "Organisation", href: `/orgs/${id}` },
          user?.isSuperAdmin
            ? { label: org?.name ?? "Organisation", href: `/orgs/${id}` }
            : { label: "Projects", href: `/orgs/${id}` },
          { label: project?.name ?? "Project" },
        ].filter(Boolean) as { label: string; href?: string }[]}
        chips={[
          `${kbs.length} KB${kbs.length === 1 ? "" : "s"}`,
          project?.description ?? "Project workspace",
        ]}
        actions={
          <Button onClick={() => setShowForm((current) => !current)} className="gap-2">
            <Plus className="w-4 h-4" /> New Knowledge Base
          </Button>
        }
      />

      {/* Project details — editable */}
      {project && (
        <EditProjectPanel
          project={{ id: projectId, name: editedProject?.name ?? project.name, description: editedProject?.description ?? project.description }}
          canEdit={canEditProject}
          onSaved={(updated) => setEditedProject(updated)}
        />
      )}

      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <form onSubmit={handleCreate} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">KB name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="HR Handbook"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Description</label>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context"
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((item) => (
            <div key={item} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : kbs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <BookOpen className="w-6 h-6 text-indigo-300" />
          </div>
          <p className="font-medium text-white">No knowledge bases yet</p>
          <p className="text-sm text-white/40 mt-1">Create a KB to upload documents, tune assistant config, and manage AI runtime overrides.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {kbs.map((kb) => (
            <div key={kb.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-medium text-white">{kb.name}</p>
                  <StatusBadge status={kb.status} />
                </div>
                {kb.description && <p className="text-sm text-white/40 mt-1">{kb.description}</p>}
                <p className="text-xs text-white/30 mt-1">
                  Created {formatDate(kb.createdAt)} · <span className="font-mono">{kb.qdrantCollection}</span>
                </p>
              </div>
                <div className="flex items-center gap-2">
                  <Link href={`/kbs/${kb.id}/config?orgId=${id}&projectId=${projectId}`}>
                    <Button variant="outline" size="sm">Assistant & AI</Button>
                  </Link>
                  <Link href={`/kbs/${kb.id}?orgId=${id}&projectId=${projectId}`}>
                    <Button size="sm">Open KB</Button>
                  </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-500/20 text-rose-300 hover:bg-rose-500/10"
                  onClick={() => handleDelete(kb.id)}
                  disabled={deletingId === kb.id}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {deletingId === kb.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
