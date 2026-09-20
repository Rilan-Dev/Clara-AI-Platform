"use client";

/**
 * src/features/admin/screens/agent-workspace/versions-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/versions — the Develop area (§19.5/§19.7/§19.8):
 *
 *   - compact version timeline (published markers, change summaries, authors);
 *   - branch list with create-from-version, archive, and MERGE INTO MAIN with
 *     an explicit conflict-resolution review (never silent);
 *   - half-canvas diff drawer (semantic — never raw JSON);
 *   - restore-as-new-version (history is never destroyed).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  archiveAgentBranch,
  createAgentBranch,
  executeAgentMerge,
  fetchAgentBranches,
  fetchAgentDiff,
  fetchAgentVersions,
  restoreAgentVersion,
  reviewAgentMerge,
  type AgentBranchDTO,
  type AgentVersionDTO,
  type MergeReviewDTO,
  type SemanticDiffDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { AgentWorkspaceHeader, useAgentWorkspaceContext } from "@/components/admin/agent-workspace/AgentWorkspaceHeader";
import {
  ContextDrawer,
  DiffViewer,
  VersionBadge,
  WorkspaceButton,
  timeAgo,
} from "@/components/admin/ai-platform/shared";
import { useAuth } from "@/modules/admin-ui/hooks";

export default function AgentVersionsScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, loading: ctxLoading, refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [versions, setVersions] = useState<AgentVersionDTO[]>([]);
  const [branches, setBranches] = useState<AgentBranchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [diff, setDiff] = useState<SemanticDiffDTO | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<AgentVersionDTO | null>(null);
  const [branchForm, setBranchForm] = useState<{ name: string; description: string; fromVersionId: string } | null>(null);
  const [mergeBranch, setMergeBranch] = useState<AgentBranchDTO | null>(null);
  const [mergeReview, setMergeReview] = useState<MergeReviewDTO | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "theirs" | "ours">>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [versionsResult, branchesResult] = await Promise.all([
        fetchAgentVersions(agentId),
        fetchAgentBranches(agentId),
      ]);
      setVersions(versionsResult.versions);
      setBranches(branchesResult.branches);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDiff = useCallback(
    async (a: string, b: string) => {
      setDiffOpen(true);
      setDiff(null);
      try {
        setDiff(await fetchAgentDiff(agentId, a, b));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [agentId],
  );

  const confirmRestore = useCallback(async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await restoreAgentVersion(agentId, restoreTarget.id);
      setRestoreTarget(null);
      await load();
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [restoreTarget, agentId, load, refetchCtx]);

  const createBranch = useCallback(async () => {
    if (!branchForm?.name || !branchForm.fromVersionId) return;
    setBusy(true);
    try {
      await createAgentBranch(agentId, {
        name: branchForm.name,
        description: branchForm.description || null,
        fromVersionId: branchForm.fromVersionId,
      });
      setBranchForm(null);
      await load();
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [branchForm, agentId, load, refetchCtx]);

  const openMerge = useCallback(
    async (branch: AgentBranchDTO) => {
      setMergeBranch(branch);
      setMergeReview(null);
      setResolutions({});
      try {
        setMergeReview(await reviewAgentMerge(agentId, branch.id));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [agentId],
  );

  const doMerge = useCallback(async () => {
    if (!mergeBranch) return;
    setBusy(true);
    try {
      await executeAgentMerge(
        agentId,
        mergeBranch.id,
        Object.entries(resolutions).map(([field, pick]) => ({ field, pick })),
      );
      setMergeBranch(null);
      setMergeReview(null);
      await load();
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [mergeBranch, agentId, resolutions, load, refetchCtx]);

  const nextVersionNumber = versions[0]?.versionNumber ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AgentWorkspaceHeader tab="versions" context={context} loading={ctxLoading} />

      {error && (
        <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Version timeline (§19.5) ───────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Versions · Main</h2>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Immutable checkpoints. Restoring creates a new version — history is never deleted.
              </p>
            </div>
            {!isAdmin && versions.length > 0 && (
              <WorkspaceButton variant="secondary" onClick={() => setBranchForm({ name: "", description: "", fromVersionId: versions[0]!.id })}>
                Create branch
              </WorkspaceButton>
            )}
          </header>

          {loading ? (
            <div className="mt-4 space-y-2.5">
              <div className="h-16 animate-pulse rounded-xl bg-muted/60" />
              <div className="h-16 animate-pulse rounded-xl bg-muted/60" />
              <div className="h-16 animate-pulse rounded-xl bg-muted/60" />
            </div>
          ) : (
            <ol className="mt-4 space-y-2.5">
              {versions.map((version, index) => {
                const isPublished = context?.deployment?.versionId === version.id;
                const previous = versions[index + 1];
                return (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                        <span className={isPublished ? "text-primary" : "text-muted-foreground/50"}>●</span>
                        v{version.versionNumber}
                        {isPublished && <VersionBadge tone="success">Published</VersionBadge>}
                        {version.source === "legacy_snapshot" && <VersionBadge tone="muted">Imported</VersionBadge>}
                        {version.source === "restore" && <VersionBadge tone="muted">Restore</VersionBadge>}
                        {version.source === "merge" && <VersionBadge tone="muted">Merge</VersionBadge>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                        {version.changeSummary ?? "—"} · {version.createdByName ?? "System"} · {timeAgo(version.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {previous && (
                        <WorkspaceButton variant="ghost" onClick={() => void openDiff(previous.id, version.id)}>
                          Compare
                        </WorkspaceButton>
                      )}
                      <WorkspaceButton variant="ghost" onClick={() => void openDiff(version.id, "draft")}>
                        vs Draft
                      </WorkspaceButton>
                      {!isAdmin && version.id !== versions[0]?.id && (
                        <WorkspaceButton variant="secondary" onClick={() => setRestoreTarget(version)}>
                          Restore
                        </WorkspaceButton>
                      )}
                    </div>
                  </li>
                );
              })}
              {versions.length === 0 && (
                <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground/70">
                  No versions yet — save the first version from Assistant &amp; AI.
                </li>
              )}
            </ol>
          )}
        </section>

        {/* ── Branches (§19.3) ───────────────────────────────────────────────── */}
        <aside className="h-fit space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Branches</h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Experiments forked from an exact version. Merging requires review.
            </p>
            <ul className="mt-4 space-y-2">
              {branches.map((branch) => (
                <li key={branch.id} className="rounded-xl border border-border/70 px-3.5 py-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                    {branch.name}
                    {branch.isMain && <VersionBadge tone="primary">Main</VersionBadge>}
                    {branch.isArchived && <VersionBadge tone="muted">Archived</VersionBadge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">
                    {branch.latestVersionNumber != null ? `v${branch.latestVersionNumber}` : "no versions"}
                    {branch.forkedFromVersionNumber != null ? ` · from Main v${branch.forkedFromVersionNumber}` : ""}
                    {branch.draftUpdatedAt ? ` · draft ${timeAgo(branch.draftUpdatedAt)}` : ""}
                  </p>
                  {!branch.isMain && !isAdmin && !branch.isArchived && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <WorkspaceButton variant="secondary" onClick={() => void openMerge(branch)}>
                        Merge into Main
                      </WorkspaceButton>
                      <WorkspaceButton
                        variant="ghost"
                        onClick={async () => {
                          await archiveAgentBranch(agentId, branch.id, true);
                          await load();
                        }}
                      >
                        Archive
                      </WorkspaceButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* Diff drawer (§19.6) */}
      <ContextDrawer open={diffOpen} onClose={() => setDiffOpen(false)} title="Version diff" subtitle="Field-aware comparison — raw JSON is never shown.">
        <DiffViewer diff={diff} />
      </ContextDrawer>

      {/* Restore confirmation (§7) */}
      <ContextDrawer
        open={restoreTarget != null}
        onClose={() => setRestoreTarget(null)}
        title={restoreTarget ? `Restore v${restoreTarget.versionNumber}?` : ""}
        subtitle={
          restoreTarget
            ? `This will create v${nextVersionNumber + 1} using v${restoreTarget.versionNumber}'s configuration. No history will be deleted.`
            : ""
        }
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <WorkspaceButton onClick={() => setRestoreTarget(null)}>Cancel</WorkspaceButton>
            <WorkspaceButton variant="primary" onClick={confirmRestore} disabled={busy}>
              Restore as new version
            </WorkspaceButton>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          The restored configuration also becomes the Main draft. Production keeps running its deployed version until you publish.
        </p>
      </ContextDrawer>

      {/* Branch creation (§19.7) */}
      <ContextDrawer
        open={branchForm != null}
        onClose={() => setBranchForm(null)}
        title="Create branch"
        subtitle={`From Main · v${versions[0]?.versionNumber ?? 1}`}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <WorkspaceButton onClick={() => setBranchForm(null)}>Cancel</WorkspaceButton>
            <WorkspaceButton variant="primary" onClick={createBranch} disabled={busy || !branchForm?.name.trim()}>
              Create branch
            </WorkspaceButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-foreground/90">Branch name</span>
            <input
              value={branchForm?.name ?? ""}
              onChange={(e) => setBranchForm((f) => (f ? { ...f, name: e.target.value } : f))}
              placeholder="experiment/new-voice"
              className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-foreground/90">Description</span>
            <input
              value={branchForm?.description ?? ""}
              onChange={(e) => setBranchForm((f) => (f ? { ...f, description: e.target.value } : f))}
              placeholder="Test Tamil realtime voice"
              className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground/70">
            The branch starts from an exact immutable version. After creation you edit its draft in Assistant &amp; AI by switching context.
          </p>
        </div>
      </ContextDrawer>

      {/* Merge review (§19.8) — never silent, conflicts resolved field-by-field */}
      <ContextDrawer
        open={mergeBranch != null}
        onClose={() => setMergeBranch(null)}
        width="sm:w-[36rem]"
        title={mergeBranch ? `Merge ${mergeBranch.name} → Main` : ""}
        subtitle={
          mergeReview
            ? `${mergeReview.compatibleChangeCount} compatible · ${mergeReview.conflictCount} conflict${mergeReview.conflictCount === 1 ? "" : "s"}`
            : "Loading review…"
        }
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="flex-1 text-[11px] text-muted-foreground/70">
              Merging creates a new immutable Main version. The branch history is never rewritten.
            </p>
            <div className="flex items-center gap-2.5">
              <WorkspaceButton onClick={() => setMergeBranch(null)}>Cancel</WorkspaceButton>
              <WorkspaceButton
                variant="primary"
                onClick={doMerge}
                disabled={
                  busy ||
                  !mergeReview ||
                  mergeReview.conflicts.some((c) => !(c.field.field in resolutions))
                }
              >
                Merge
              </WorkspaceButton>
            </div>
          </div>
        }
      >
        {!mergeReview ? (
          <p className="py-8 text-center text-sm text-muted-foreground/70">Building three-way review…</p>
        ) : (
          <div className="space-y-5">
            {mergeReview.incoming.map((section) => (
              <section key={section.key} className="rounded-xl border border-border bg-card">
                <h4 className="border-b border-border/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {section.title}
                </h4>
                <ul className="divide-y divide-border/60">
                  {section.changes.map((change) => (
                    <li key={change.field} className="px-4 py-2.5 text-xs">
                      <p className="font-medium text-foreground/90">{change.label}</p>
                      {change.before != null && <p className="mt-1 text-muted-foreground/70 line-through">{change.before}</p>}
                      {change.after != null && <p className="mt-0.5 font-medium text-foreground">{change.after}</p>}
                      {change.addedItems && change.addedItems.length > 0 && <p className="mt-0.5 text-emerald-600">+ {change.addedItems.join(", ")}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {mergeReview.conflicts.map((conflict) => (
              <section key={conflict.field.field} className="rounded-xl border border-amber-600/40 bg-amber-500/5">
                <h4 className="border-b border-amber-600/20 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Conflict · {conflict.sectionTitle}
                </h4>
                <div className="px-4 py-3 text-xs">
                  <p className="font-medium text-foreground/90">{conflict.field.label}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setResolutions((r) => ({ ...r, [conflict.field.field]: "ours" }))}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        resolutions[conflict.field.field] === "ours"
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-card hover:border-primary/25"
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Main (keep)</p>
                      <p className="mt-0.5 font-medium text-foreground">{conflict.field.ours ?? "not set"}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResolutions((r) => ({ ...r, [conflict.field.field]: "theirs" }))}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        resolutions[conflict.field.field] === "theirs"
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-card hover:border-primary/25"
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{mergeBranch?.name} (incoming)</p>
                      <p className="mt-0.5 font-medium text-foreground">{conflict.field.theirs ?? "not set"}</p>
                    </button>
                  </div>
                </div>
              </section>
            ))}

            {mergeReview.compatibleChangeCount === 0 && mergeReview.conflictCount === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground/70">
                No changes to merge.
              </p>
            )}
          </div>
        )}
      </ContextDrawer>
    </div>
  );
}
