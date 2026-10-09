"use client";

/**
 * src/features/admin/layouts/publish-review-dialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Review Changes" modal — opened from the topbar Publish menu ("View pending
 * changes") and the "Draft changes" pill. Reviews draft changes before
 * publishing with TWO complementary views:
 *
 *   ┌ Review Changes ──────────────────────────────────────────── [X] ┐
 *   │ Review draft changes before publishing                          │
 *   │ Publishing to   Support agent / Main                            │
 *   │ Commit message  [ Rename agent to Clara AI ______________ ]      │
 *   │ [Overview · updated] [Raw JSON · updated]                       │
 *   │   Overview → semantic diff (strikeouts, split view for long      │
 *   │              values)                                            │
 *   │   Raw JSON → side-by-side line diff with Expand-N-lines          │
 *   │                        [Cancel] [Publish changes]               │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * · The semantic diff comes from the versioning API (`draft ↔ version`);
 *   the raw JSON comparison is computed client-side (json-diff.ts).
 * · Publishing saves the draft as a version (with the commit message) and
 *   points production at it — identical to the one-click topbar publish,
 *   plus the change summary.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Rocket, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchAgentDiff,
  fetchAgentDraft,
  fetchAgentVersion,
  publishAgentVersion,
  saveAgentVersion,
  type AgentWorkspaceContextDTO,
  type SemanticDiffDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { WorkspaceButton } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";
import {
  buildSideBySideRows,
  collapseUnchangedRuns,
  stringifyForDiff,
  type JsonDiffRow,
} from "./json-diff";

/** Values at least this long render side-by-side instead of stacked. */
const SPLIT_VALUE_THRESHOLD = 100;

/** Small "updated" chip shown next to a tab when that view has changes. */
function UpdatedChip() {
  return (
    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
      updated
    </span>
  );
}

export function ReviewChangesDialog({
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
  const currentVersion = context?.currentVersion ?? null;
  const deployment = context?.deployment ?? null;

  const [tab, setTab] = useState<"overview" | "raw">("overview");
  const [semantic, setSemantic] = useState<SemanticDiffDTO | null>(null);
  const [publishedJson, setPublishedJson] = useState<string | null>(null);
  const [draftJson, setDraftJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitTouched, setCommitTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch the semantic diff + both raw configurations when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTab("overview");
    setSemantic(null);
    setPublishedJson(null);
    setDraftJson(null);
    setError(null);
    setCommitMessage("");
    setCommitTouched(false);
    if (!currentVersion) {
      setError("No versions yet — publishing will create v1 from this draft.");
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchAgentDiff(agentId, currentVersion.id, "draft"),
      fetchAgentVersion(agentId, currentVersion.id),
      fetchAgentDraft(agentId),
    ])
      .then(([diff, version, draft]) => {
        if (cancelled) return;
        setSemantic(diff);
        setPublishedJson(stringifyForDiff(version.configuration));
        setDraftJson(stringifyForDiff(draft.configuration));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, agentId, currentVersion]);

  // A sensible default commit message derived from the changed fields — the
  // user can always edit it before publishing.
  const suggestedCommitMessage = useMemo(() => {
    if (!semantic?.hasChanges) return "";
    const labels = semantic.sections
      .flatMap((s) => s.changes)
      .slice(0, 3)
      .map((c) => c.label.toLowerCase());
    return labels.length === 0 ? "" : `Update ${labels.join(", ")}`;
  }, [semantic]);

  const effectiveCommitMessage = commitTouched ? commitMessage : suggestedCommitMessage;

  // Raw JSON diff rows + collapsible segments (computed once per payload).
  const jsonRows = useMemo<JsonDiffRow[] | null>(() => {
    if (publishedJson == null || draftJson == null) return null;
    return buildSideBySideRows(publishedJson.split("\n"), draftJson.split("\n"));
  }, [publishedJson, draftJson]);
  const jsonSegments = useMemo(
    () => (jsonRows ? collapseUnchangedRuns(jsonRows) : []),
    [jsonRows],
  );
  const jsonHasChanges = !!jsonRows?.some((r) => r.kind !== "same");
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set());
  useEffect(() => {
    setExpandedSegments(new Set());
  }, [jsonSegments]);

  // Publish: draft → version (with commit message) → production.
  async function publishChanges() {
    if (busy) return;
    setBusy(true);
    try {
      const version = await saveAgentVersion(agentId, effectiveCommitMessage.trim() || null);
      const result = await publishAgentVersion(agentId, version.id, deployment?.publicAccess ?? true);
      toast.success("Agent published", {
        description: `Production is now running ${result.deployment.branchName} · v${result.deployment.versionNumber}.`,
      });
      onClose();
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
    } catch (err) {
      toast.error("Publish failed", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const agentName = context?.agent.name ?? "Agent";
  const branchName = currentVersion?.branchName ?? context?.main.name ?? "Main";
  const updated = semantic?.hasChanges ?? jsonHasChanges;

  // Portal to <body>: the topbar header uses backdrop-blur, which creates a
  // containing block for fixed-position descendants — a fixed overlay rendered
  // inside the header would be confined to the 63px header strip instead of
  // covering the viewport. Portaling escapes that containing block.
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Review changes">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Centered modal — wide enough for the side-by-side Raw JSON view. */}
      <div className="absolute inset-0 flex min-w-0 items-center justify-center overflow-y-auto p-2 sm:p-6">
        <div className="flex max-h-full w-full min-w-0 max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 [overflow-wrap:anywhere]">
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Review Changes</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Review draft changes before publishing</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review changes"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Publishing target + commit message */}
          <div className="shrink-0 space-y-3 border-b border-border bg-muted/20 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
              <span className="font-medium text-foreground/80">Publishing to</span>
              <span className="rounded-lg border border-border bg-card px-2 py-1 font-medium text-foreground">
                {agentName}
              </span>
              <span className="text-muted-foreground/60" aria-hidden>/</span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-2 py-1 font-medium text-primary">
                {branchName}
              </span>
              <span className="text-muted-foreground/70">
                {currentVersion
                  ? `· draft changes become v${currentVersion.versionNumber + 1} when published`
                  : "· first publication creates v1"}
              </span>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-foreground/80">Commit message</span>
              <input
                value={effectiveCommitMessage}
                onChange={(e) => {
                  setCommitTouched(true);
                  setCommitMessage(e.target.value);
                }}
                placeholder="e.g. Rename agent to Clara AI"
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/40"
              />
            </label>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-5 py-2">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "overview"}
              onClick={() => setTab("overview")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "overview"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              Overview
              {updated && <UpdatedChip />}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "raw"}
              onClick={() => setTab("raw")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "raw"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              Raw JSON
              {jsonHasChanges && <UpdatedChip />}
            </button>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground/80">
                {error}
              </p>
            ) : tab === "overview" ? (
              <SemanticDiffOverview diff={semantic} />
            ) : (
              <RawJsonDiff
                segments={jsonSegments}
                expandedSegments={expandedSegments}
                onExpand={(idx) =>
                  setExpandedSegments((prev) => new Set(prev).add(idx))
                }
                publishedLabel={`Published version · ${branchName} v${currentVersion?.versionNumber ?? "—"}`}
                draftLabel="Current changes · Draft"
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-3.5">
            <p className="hidden text-[11px] text-muted-foreground/70 sm:block">
              Publishing saves the draft as an immutable version, then routes production to it.
            </p>
            <div className="ml-auto flex items-center gap-2.5">
              <WorkspaceButton onClick={onClose} disabled={busy}>
                Cancel
              </WorkspaceButton>
              <WorkspaceButton
                variant="primary"
                onClick={() => void publishChanges()}
                disabled={busy}
                title="Saves the draft as a version (with the commit message) and publishes it"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                {busy ? "Publishing…" : "Publish changes"}
              </WorkspaceButton>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Overview tab: semantic diff (§19.6 field-aware view) ─────────────────────

function SemanticDiffOverview({ diff }: { diff: SemanticDiffDTO | null }) {
  if (!diff) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }
  const changed = diff.sections.filter((s) => s.changes.length > 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          <span className="text-foreground/80">{diff.from.label}</span>
          <span className="mx-2 text-muted-foreground/80">→</span>
          <span className="text-foreground/80">{diff.to.label}</span>
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          {diff.changeCount} {diff.changeCount === 1 ? "change" : "changes"}
        </span>
      </div>

      {changed.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground/70">
          No pending changes — the draft matches the published version.
        </p>
      )}

      {changed.map((section) => (
        <section key={section.key} className="overflow-hidden rounded-xl border border-border bg-card">
          <h4 className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
            {section.title}
            <span className="font-medium normal-case text-muted-foreground/60">
              {section.changes.length} updated
            </span>
          </h4>
          <ul className="divide-y divide-border/60">
            {section.changes.map((change) => (
              <li key={change.field} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-xs font-medium text-foreground/90">{change.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground/60">{change.field}</p>
                </div>
                <ChangeValue change={change} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One changed field: toggles, short values (strikeout → new) and long values
 *  (side-by-side split view), plus added/removed list items. */
function ChangeValue({
  change,
}: {
  change: SemanticDiffDTO["sections"][number]["changes"][number];
}) {
  const longBefore = (change.before ?? "").length >= SPLIT_VALUE_THRESHOLD;
  const longAfter = (change.after ?? "").length >= SPLIT_VALUE_THRESHOLD;

  if (change.kind === "toggled_on" || change.kind === "toggled_off") {
    return (
      <p className={cn("mt-1.5 text-xs", change.kind === "toggled_on" ? "text-emerald-600" : "text-amber-600")}>
        <span className="mr-1.5 text-muted-foreground/80 line-through decoration-muted-foreground/40">
          {change.kind === "toggled_on" ? "Off" : "On"}
        </span>
        →<span className="ml-1.5 font-medium">{change.kind === "toggled_on" ? "On" : "Off"}</span>
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed">
      {(longBefore || longAfter) && change.kind !== "removed" ? (
        // Split view — long values side-by-side (Published | Current).
        <div className="grid gap-2 lg:grid-cols-2">
          {change.before != null && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.04] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500/80">Published version</p>
              <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground line-through decoration-rose-400/40">
                {change.before}
              </p>
            </div>
          )}
          {change.after != null && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/80">Current changes</p>
              <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] font-medium leading-relaxed text-foreground">
                {change.after}
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {change.before != null && (
            <p className="text-muted-foreground/80 line-through decoration-muted-foreground/40">{change.before}</p>
          )}
          {change.kind !== "removed" && change.after != null && (
            <p className="font-medium text-foreground">{change.after}</p>
          )}
        </>
      )}
      {change.addedItems && change.addedItems.length > 0 && (
        <p className="text-emerald-600">+ {change.addedItems.join(", ")}</p>
      )}
      {change.removedItems && change.removedItems.length > 0 && (
        <p className="text-rose-500">− {change.removedItems.join(", ")}</p>
      )}
      {change.kind === "removed" && <p className="text-xs italic text-muted-foreground/80">Removed</p>}
    </div>
  );
}

// ── Raw JSON tab: side-by-side line diff with collapsible runs ───────────────

function RawJsonDiff({
  segments,
  expandedSegments,
  onExpand,
  publishedLabel,
  draftLabel,
}: {
  segments: ReturnType<typeof collapseUnchangedRuns>;
  expandedSegments: Set<number>;
  onExpand: (index: number) => void;
  publishedLabel: string;
  draftLabel: string;
}) {
  if (segments.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Pane headers */}
      <div className="grid grid-cols-2 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <p className="border-r border-border px-3 py-2">{publishedLabel}</p>
        <p className="px-3 py-2">{draftLabel}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-[11px] leading-5 font-mono">
          <tbody>
            {segments.map((segment, idx) =>
              segment.kind === "collapsed" && !expandedSegments.has(idx) ? (
                <tr key={idx}>
                  <td colSpan={4} className="border-y border-dashed border-border/70 bg-muted/20 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onExpand(idx)}
                      className="w-full text-center text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      Expand {segment.count} line{segment.count === 1 ? "" : "s"} …
                    </button>
                  </td>
                </tr>
              ) : (
                segment.rows.map((row, r) => (
                  <tr key={`${idx}-${r}`} className={cn(row.kind !== "same" && "align-top")}>
                    {/* Left pane: published side */}
                    <td className="w-8 select-none border-r border-border/40 bg-muted/10 px-1.5 text-right text-muted-foreground/50">
                      {row.left?.num ?? ""}
                    </td>
                    <td
                      className={cn(
                        "whitespace-pre border-r border-border/40 px-2.5",
                        row.kind === "changed" || row.kind === "removed"
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.left?.text ?? ""}
                    </td>
                    {/* Right pane: current/draft side */}
                    <td className="w-8 select-none bg-muted/10 px-1.5 text-right text-muted-foreground/50">
                      {row.right?.num ?? ""}
                    </td>
                    <td
                      className={cn(
                        "whitespace-pre px-2.5",
                        row.kind === "changed" || row.kind === "added"
                          ? "bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.right?.text ?? ""}
                    </td>
                  </tr>
                ))
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
