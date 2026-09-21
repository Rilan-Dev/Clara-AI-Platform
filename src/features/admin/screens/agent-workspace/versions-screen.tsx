"use client";

/**
 * src/features/admin/screens/agent-workspace/versions-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/versions — the Branches page (ElevenLabs layout):
 *
 *   Branches                              [+ Create branch]
 *   [Q Search branches…]
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ Name      Traffic Split   Conversations   Status   Created   Updated │
 *   │ Main      100% [Live]     —               —        author    Sep 13 │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 *   - per-row history icon opens the Branch History canvas (?history=1&branch=…)
 *   - ellipsis menu carries merge-into-main / archive / restore
 *   - version history itself lives in the history canvas, not on this page
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  archiveAgentBranch,
  createAgentBranch,
  executeAgentMerge,
  fetchAgentBranches,
  reviewAgentMerge,
  type AgentBranchDTO,
  type MergeReviewDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { useAgentWorkspaceContext } from "@/features/admin/screens/agent-workspace/workspace-shell";
import {
  ContextDrawer,
  VersionBadge,
  WorkspaceButton,
} from "@/components/admin/ai-platform/shared";
import { useAuth } from "@/modules/admin-ui/hooks";
import { GitBranch, History, MoreHorizontal, Plus, Search } from "lucide-react";

export default function AgentVersionsScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [branches, setBranches] = useState<AgentBranchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [branchForm, setBranchForm] = useState<{ name: string; description: string; fromVersionId: string } | null>(null);
  const [mergeBranch, setMergeBranch] = useState<AgentBranchDTO | null>(null);
  const [mergeReview, setMergeReview] = useState<MergeReviewDTO | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "theirs" | "ours">>({});
  const [busy, setBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const branchesResult = await fetchAgentBranches(agentId);
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

  // Close the row menu on any click outside of it.
  useEffect(() => {
    if (!menuOpenId) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpenId]);

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
      setMenuOpenId(null);
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

  const toggleArchive = useCallback(async (branch: AgentBranchDTO) => {
    setMenuOpenId(null);
    setBusy(true);
    try {
      await archiveAgentBranch(agentId, branch.id, !branch.isArchived);
      await load();
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [agentId, load, refetchCtx]);

  /** Per-row history icon — opens the Branch History canvas for this branch. */
  const openHistory = useCallback(
    (branch: AgentBranchDTO) => {
      router.push(`${pathname}?history=1&branch=${encodeURIComponent(branch.id)}`, { scroll: false });
    },
    [router, pathname],
  );

  const deployment = context?.deployment ?? null;
  const mainCurrentVersionId = context?.currentVersion?.id ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q),
    );
  }, [branches, query]);

  const openCreateBranch = useCallback(() => {
    if (!mainCurrentVersionId) return;
    setBranchForm({ name: "", description: "", fromVersionId: mainCurrentVersionId });
  }, [mainCurrentVersionId]);

  return (
    <div>

      {error && (
        <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {/* ── Page header — title + create (image: "Branches" + "+ Create branch") ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/40">
            <GitBranch className="h-4 w-4 text-primary" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Branches</h1>
            <p className="text-xs text-muted-foreground/70">
              Lines of development — forked from an immutable version, merged after review.
            </p>
          </div>
        </div>
        {!isAdmin && (
          <WorkspaceButton variant="primary" onClick={openCreateBranch} disabled={!mainCurrentVersionId}>
            <Plus className="h-3.5 w-3.5" /> Create branch
          </WorkspaceButton>
        )}
      </div>

      {/* ── Search (image: "Search branches…") ─────────────────────────────────── */}
      <div className="relative mt-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search branches…"
          aria-label="Search branches"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-primary/40"
        />
      </div>

      {/* ── Branches table ─────────────────────────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Traffic Split</th>
              <th scope="col" className="hidden px-4 py-3 sm:table-cell">Conversations (7d)</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Created by</th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">Updated</th>
              <th scope="col" className="w-20 px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              [1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded-lg bg-muted/50" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground/70">
                  {branches.length === 0 ? "No branches yet — Main is created with the agent." : "No branches match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((branch) => {
                const isLive = deployment?.branchId === branch.id;
                return (
                  <tr key={branch.id} className="group transition-colors hover:bg-muted/20">
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{branch.name}</span>
                        {branch.isMain && <VersionBadge tone="primary">Main</VersionBadge>}
                        {branch.isArchived && <VersionBadge tone="muted">Archived</VersionBadge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/60">
                        {branch.latestVersionNumber != null ? `v${branch.latestVersionNumber}` : "no versions"}
                        {branch.forkedFromVersionNumber != null ? ` · forked from Main v${branch.forkedFromVersionNumber}` : ""}
                        {branch.draftUpdatedAt ? " · has draft" : ""}
                      </p>
                    </td>

                    {/* Traffic split — the deployed branch serves 100% of traffic. */}
                    <td className="px-4 py-3">
                      {isLive ? (
                        <span className="flex items-center gap-2 text-foreground/90">
                          100%
                          <VersionBadge tone="success">Live</VersionBadge>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40" title="Not routed to production">—</span>
                      )}
                    </td>

                    {/* Conversations (7d) — per-branch conversation analytics are not tracked yet. */}
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="text-muted-foreground/40" title="Conversation analytics per branch are coming soon">—</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {branch.isArchived ? (
                        <span className="text-xs text-muted-foreground/70">Archived</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Created by */}
                    <td className="hidden max-w-[16rem] truncate px-4 py-3 text-muted-foreground/80 lg:table-cell">
                      {branch.createdByName ?? "—"}
                    </td>

                    {/* Updated */}
                    <td className="hidden px-4 py-3 text-muted-foreground/80 md:table-cell">
                      {formatBranchDate(branch.updatedAt)}
                    </td>

                    {/* Actions — history icon + ellipsis menu (image 1) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1" ref={menuOpenId === branch.id ? menuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => openHistory(branch)}
                          aria-label={`Open ${branch.name} history`}
                          title="Branch history"
                          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        {!isAdmin && (branch.isMain || !branch.isArchived) && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setMenuOpenId(menuOpenId === branch.id ? null : branch.id)}
                              aria-label={`More actions for ${branch.name}`}
                              aria-expanded={menuOpenId === branch.id}
                              className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuOpenId === branch.id && (
                              <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                                {branch.isMain ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openCreateBranch();
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground/90 transition-colors hover:bg-muted"
                                  >
                                    <Plus className="h-3.5 w-3.5" /> Create branch
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void openMerge(branch)}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground/90 transition-colors hover:bg-muted"
                                    >
                                      <GitBranch className="h-3.5 w-3.5" /> Merge into Main
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void toggleArchive(branch)}
                                      disabled={busy}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                      {branch.isArchived ? "Restore branch" : "Archive"}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Branch creation (§19.7) */}
      <ContextDrawer
        open={branchForm != null}
        onClose={() => setBranchForm(null)}
        title="Create branch"
        subtitle={`From Main · v${context?.currentVersion?.versionNumber ?? 1}`}
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
            The branch starts from an exact immutable version. After creation you edit its draft in the Agent tab by switching context.
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

/** "Sep 13, 7:49 PM" style dates for the Updated column. */
function formatBranchDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
