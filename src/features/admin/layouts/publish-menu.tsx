"use client";

/**
 * src/features/admin/layouts/publish-menu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The dropdown attached to the topbar "Publish update" button
 * (AgentTopbarCluster). The primary button keeps its one-click publish; the
 * chevron opens the deployment menu:
 *
 *   with pending draft changes          without drafts
 *   ────────────────────────────        ────────────────────────────
 *   View pending changes                Publish to a new branch
 *   Publish to a new branch             Deploy traffic
 *   Deploy traffic                      View all branches
 *   View all branches                   Copy shareable link
 *   Copy shareable link                 Copy version permalink
 *   Copy version permalink
 *   Discard changes
 *
 * · "View pending changes" opens the Review Changes modal (see
 *   publish-review-dialog.tsx) — passed in via onViewPendingChanges.
 * · "Publish to a new branch" → Branches page with the create-branch drawer
 *   pre-opened (/versions?create=1).
 * · "Deploy traffic" → modal that routes production to any saved version
 *     (publish/rollback semantics, access mode preserved).
 * · "Copy shareable link" copies the hosted published page directly — no
 *   detour through the Publish tab's "Generate explore link" flow (which
 *   mints a rotating embed key). The public page URL is stable and serves
 *   whatever version is live.
 * · "Copy version permalink" copies the published page pinned to the exact
 *   version that is live right now (?v=N).
 * · "Discard changes" resets the draft to the current version's
 *   configuration, then reloads so open editors drop their stale state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  GitBranch,
  GitFork,
  Loader2,
  Pin,
  Share2,
  Split,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchAgentVersion,
  fetchAgentVersions,
  publishAgentVersion,
  putAgentDraft,
  type AgentVersionDTO,
  type AgentWorkspaceContextDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";

// ── Clipboard helper (navigator.clipboard + execCommand fallback) ────────────

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure contexts / embedded iframes.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

// ── The dropdown ─────────────────────────────────────────────────────────────

export function PublishMenu({
  agentId,
  orgId,
  context,
  hasPendingChanges,
  onViewPendingChanges,
}: {
  agentId: string;
  orgId: string | null;
  context: AgentWorkspaceContextDTO | null;
  /** Draft edits exist that are not in a version yet. */
  hasPendingChanges: boolean;
  /** Opens the Review Changes modal (owned by the topbar cluster). */
  onViewPendingChanges: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const deployment = context?.deployment ?? null;
  const currentVersion = context?.currentVersion ?? null;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const versionsHref = orgId ? `/orgs/${orgId}/agents/${agentId}/versions` : null;
  const goVersions = useCallback(
    (create: boolean) => {
      setOpen(false);
      if (!versionsHref) return;
      router.push(create ? `${versionsHref}?create=1` : versionsHref);
    },
    [versionsHref, router],
  );

  const copyShareableLink = useCallback(async () => {
    if (!deployment) return;
    setOpen(false);
    const url = `${window.location.origin}/agents/${agentId}`;
    const ok = await copyText(url);
    if (ok) {
      toast.success("Shareable link copied", {
        description: url,
        action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") },
      });
    } else {
      toast.error("Copy failed", { description: url });
    }
  }, [deployment, agentId]);

  const copyVersionPermalink = useCallback(async () => {
    if (!deployment) return;
    setOpen(false);
    const url = `${window.location.origin}/agents/${agentId}?v=${deployment.versionNumber}`;
    const ok = await copyText(url);
    if (ok) {
      toast.success("Version permalink copied", {
        description: `${url} — ${deployment.branchName} · v${deployment.versionNumber} as published`,
        action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") },
      });
    } else {
      toast.error("Copy failed", { description: url });
    }
  }, [deployment, agentId]);

  return (
    <div ref={ref} className="relative inline-flex">
      {/* Chevron segment — visually attached to the primary Publish button. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Publish actions menu"
        title="Publish actions — view pending changes, branches, share links"
        disabled={!context}
        className="inline-flex items-center rounded-lg rounded-l-none border-l border-primary-foreground/25 bg-primary px-1.5 py-1.5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Publish actions"
          className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {hasPendingChanges && (
            <MenuItem
              icon={<span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-amber-600/40 bg-amber-500/10 text-[9px] font-bold text-amber-600">±</span>}
              onClick={() => {
                setOpen(false);
                onViewPendingChanges();
              }}
            >
              View pending changes
            </MenuItem>
          )}
          <MenuItem
            icon={<GitFork className="h-3.5 w-3.5" />}
            onClick={() => goVersions(true)}
            disabled={!currentVersion}
            title={currentVersion ? "Fork a new branch from the current version" : "Save a version first"}
          >
            Publish to a new branch
          </MenuItem>
          <MenuItem
            icon={<Split className="h-3.5 w-3.5" />}
            onClick={() => {
              setOpen(false);
              setTrafficOpen(true);
            }}
            disabled={!currentVersion}
            title={currentVersion ? "Route production traffic to a saved version" : "No versions to route yet"}
          >
            Deploy traffic
          </MenuItem>
          <MenuItem
            icon={<GitBranch className="h-3.5 w-3.5" />}
            onClick={() => goVersions(false)}
            disabled={!versionsHref}
          >
            View all branches
          </MenuItem>
          <MenuItem
            icon={<Share2 className="h-3.5 w-3.5" />}
            onClick={() => void copyShareableLink()}
            disabled={!deployment}
            title={deployment ? "Copy the hosted published page URL" : "Publish first — nothing is live yet"}
          >
            Copy shareable link
          </MenuItem>
          <MenuItem
            icon={<Pin className="h-3.5 w-3.5" />}
            onClick={() => void copyVersionPermalink()}
            disabled={!deployment}
            title={deployment ? `Copy the published page pinned to ${deployment.branchName} · v${deployment.versionNumber}` : "Publish first — nothing is live yet"}
          >
            Copy version permalink
          </MenuItem>

          {hasPendingChanges && (
            <>
              <div className="my-1 border-t border-border/70" />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                danger
                onClick={() => {
                  setOpen(false);
                  setDiscardOpen(true);
                }}
              >
                Discard changes
              </MenuItem>
            </>
          )}
        </div>
      )}

      <DeployTrafficDialog
        agentId={agentId}
        context={context}
        open={trafficOpen}
        onClose={() => setTrafficOpen(false)}
      />
      <DiscardChangesDialog
        agentId={agentId}
        context={context}
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
      />
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground/90 hover:bg-muted",
      )}
    >
      <span className={cn("shrink-0", danger ? "text-destructive/80" : "text-muted-foreground")}>{icon}</span>
      {children}
    </button>
  );
}

// ── Deploy traffic modal ─────────────────────────────────────────────────────

function DeployTrafficDialog({
  agentId,
  context,
  open,
  onClose,
}: {
  agentId: string;
  context: AgentWorkspaceContextDTO | null;
  open: boolean;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<AgentVersionDTO[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deployment = context?.deployment ?? null;

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setSelected(null);
    setError(null);
    let cancelled = false;
    fetchAgentVersions(agentId)
      .then((result) => !cancelled && setVersions(result.versions))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  async function routeTraffic() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await publishAgentVersion(agentId, selected, deployment?.publicAccess ?? true);
      toast.success("Traffic routed", {
        description: `Production now serves ${result.deployment.branchName} · v${result.deployment.versionNumber}.`,
      });
      onClose();
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
    } catch (err) {
      toast.error("Failed to route traffic", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Deploy traffic">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => !busy && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Deploy traffic</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {deployment
                  ? `Currently serving ${deployment.branchName} · v${deployment.versionNumber} — 100% of traffic`
                  : "Nothing is live yet — pick the version to route traffic to"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close deploy traffic"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Production serves ONE exact immutable version — routing traffic re-publishes the selected version
              instantly (rollback included). Drafts never go live.
            </p>
            {error && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {!versions && !error && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
                ))}
              </div>
            )}
            {versions && versions.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground/70">
                No versions yet — save the draft as a version first.
              </p>
            )}
            <ul className="space-y-1.5">
              {(versions ?? []).map((version) => {
                const isLive = deployment?.versionId === version.id;
                return (
                  <li key={version.id}>
                    <button
                      type="button"
                      disabled={isLive}
                      onClick={() => setSelected(version.id)}
                      aria-pressed={selected === version.id}
                      className={cn(
                        "w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        isLive
                          ? "cursor-default border-emerald-600/30 bg-emerald-500/5 opacity-80"
                          : selected === version.id
                            ? "border-primary/40 bg-primary/10"
                            : "border-border bg-card hover:border-primary/25 hover:bg-muted/40",
                      )}
                    >
                      <p className="flex items-center gap-2 text-xs font-medium text-foreground/90">
                        {version.branchName} · v{version.versionNumber}
                        {isLive && (
                          <span className="inline-flex items-center rounded-full border border-emerald-600/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                            Live · 100%
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                        {version.changeSummary ?? "No commit message"}
                        {" · "}
                        {version.createdByName ?? "System"} · {timeAgo(version.createdAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
            <WorkspaceButton onClick={onClose} disabled={busy}>
              Cancel
            </WorkspaceButton>
            <WorkspaceButton
              variant="primary"
              onClick={() => void routeTraffic()}
              disabled={busy || !selected}
              title="Re-publish the selected version so production serves it"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Split className="h-3.5 w-3.5" />}
              {busy ? "Routing…" : "Route traffic here"}
            </WorkspaceButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Discard changes modal ────────────────────────────────────────────────────

function DiscardChangesDialog({
  agentId,
  context,
  open,
  onClose,
}: {
  agentId: string;
  context: AgentWorkspaceContextDTO | null;
  open: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const currentVersion = context?.currentVersion ?? null;

  useEffect(() => {
    if (open) return;
    setBusy(false);
    setDone(false);
  }, [open]);

  async function discard() {
    if (!currentVersion || busy || done) return;
    setBusy(true);
    try {
      // Reset the draft to the current version's exact configuration —
      // pending edits that were never versioned are dropped.
      const version = await fetchAgentVersion(agentId, currentVersion.id);
      const saved = await putAgentDraft(agentId, version.configuration);
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
      window.dispatchEvent(new CustomEvent("agent-workspace:draft-updated", {
        detail: { agentId, draftUpdatedAt: saved.updatedAt },
      }));
      setDone(true);
      // Open editors keep their local state — a reload guarantees they drop
      // the discarded edits instead of re-saving them on the next keystroke.
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      toast.error("Discard failed", { description: (err as Error).message });
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Discard changes">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => !busy && !done && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <h2 className="text-sm font-semibold text-foreground">Discard changes?</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {currentVersion
              ? `Draft edits not saved in ${currentVersion.branchName} · v${currentVersion.versionNumber} yet are reset to that version. This cannot be undone.`
              : "The draft is reset to its last saved state. This cannot be undone."}
          </p>
          {done ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-500/5 px-3.5 py-2.5 text-xs text-emerald-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Changes discarded — reloading the workspace…
            </p>
          ) : (
            <div className="mt-4 flex items-center justify-end gap-2.5">
              <WorkspaceButton onClick={onClose} disabled={busy}>
                Cancel
              </WorkspaceButton>
              <WorkspaceButton variant="danger" onClick={() => void discard()} disabled={busy || !currentVersion}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {busy ? "Discarding…" : "Discard changes"}
              </WorkspaceButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
