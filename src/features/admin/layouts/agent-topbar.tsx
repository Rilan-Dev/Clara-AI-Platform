"use client";

/**
 * src/features/admin/layouts/agent-topbar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent workspace status in the GLOBAL topbar (the bar that also carries the
 * theme toggle and the profile avatar).
 *
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ Clara · Agent       Main v8 · Draft changes · Published v8 ·            │
 *   │ (context label)     Draft saved 18 min ago · Preview · Publish update  │
 *   │                                                 [theme] [avatar]      │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * · TopbarContextLabel — the LEFT slot: agent name + open section while an
 *   agent is open; a neutral page label everywhere else (the username was
 *   removed from the navbar — identity lives in the avatar menu).
 * · AgentTopbarCluster — the RIGHT slot next to the profile avatar: the
 *   branch/version cluster (Main · vN), a "Draft changes" pill that opens the
 *   pending-changes diff drawer (draft ↔ current version), a "Published vN"
 *   pill that opens the published-URL controls, the live "Draft saved …" age,
 *   and the Preview / Publish update actions (one-click publish).
 * · Both slots share ONE workspace-context fetch through AgentTopbarProvider
 *   (the 60s client cache + the agent-workspace:refresh event for forced
 *   refreshes after publish / restore).
 *
 * The sidebar carries the agent SECTION navigation (Agents > Overview / Main /
 * FAQ / Knowledge / Tools / Branches / Publish) — see admin-shell.tsx.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  FileDiff,
  GitBranch,
  Rocket,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchAgentDiff,
  fetchAgentWorkspaceContext,
  publishAgentVersion,
  saveAgentVersion,
  type AgentWorkspaceContextDTO,
  type SemanticDiffDTO,
} from "@/modules/admin-ui/ai-platform-api";
import {
  fetchAgentWorkspaceContextCached,
  updateAgentWorkspaceContextCache,
} from "@/features/admin/screens/agent-workspace/context-cache";
import { DiffViewer, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";

// ── Agent route detection ────────────────────────────────────────────────────

/** Matches /orgs/:orgId/agents/:agentId/… — same pattern the sidebar uses. */
function useAgentRoute(): { orgId: string | null; agentId: string | null } {
  const pathname = usePathname();
  const match = pathname.match(/^\/orgs\/([^/]+)\/agents\/([^/]+)/);
  return { orgId: match?.[1] ?? null, agentId: match?.[2] ?? null };
}

/** Short label of the open agent section (sidebar tab name). */
const SECTION_SEGMENTS: Record<string, string> = {
  config: "Agent",
  faq: "FAQ",
  knowledge: "Knowledge",
  tools: "Tools",
  versions: "Branches",
  publish: "Publish",
};

function agentSectionLabel(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean); // orgs / :id / agents / :agentId / section?
  const section = segs.length >= 5 ? segs[4] : null;
  return (section && SECTION_SEGMENTS[section]) || "Overview";
}

// ── Shared workspace context (one fetch for both topbar slots) ───────────────

type AgentTopbarValue = {
  orgId: string | null;
  agentId: string | null;
  context: AgentWorkspaceContextDTO | null;
  loading: boolean;
};

const AgentTopbarCtx = createContext<AgentTopbarValue | null>(null);

function useAgentTopbar(): AgentTopbarValue {
  const value = useContext(AgentTopbarCtx);
  if (!value) throw new Error("useAgentTopbar must be used inside <AgentTopbarProvider>");
  return value;
}

/**
 * Wraps the topbar: resolves the open agent's workspace context once (cached)
 * and refreshes it — bypassing the cache — whenever any workspace surface
 * publishes, saves a draft or restores a version (agent-workspace:refresh).
 */
export function AgentTopbarProvider({ children }: { children: ReactNode }) {
  const { orgId, agentId } = useAgentRoute();
  const [context, setContext] = useState<AgentWorkspaceContextDTO | null>(null);
  const [loading, setLoading] = useState(false);

  // Initial load — shared client cache (dedupes with the sidebar identity).
  useEffect(() => {
    if (!agentId) {
      setContext(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAgentWorkspaceContextCached(agentId)
      .then((data) => !cancelled && setContext(data))
      .catch(() => !cancelled && setContext(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Forced refresh after mutations — bypasses the cache and writes the fresh
  // snapshot back so the sidebar identity and this cluster stay in sync.
  useEffect(() => {
    const refresh = () => {
      if (!agentId) return;
      fetchAgentWorkspaceContext(agentId)
        .then((data) => {
          setContext(data);
          updateAgentWorkspaceContextCache(agentId, data);
        })
        .catch(() => undefined);
    };
    const contextUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string; context?: AgentWorkspaceContextDTO }>).detail;
      if (!agentId || detail?.agentId !== agentId || !detail.context) return;
      setContext(detail.context);
      updateAgentWorkspaceContextCache(agentId, detail.context);
    };
    const draftUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string; draftUpdatedAt?: string }>).detail;
      if (!agentId || detail?.agentId !== agentId || !detail.draftUpdatedAt) return;
      setContext((current) => current ? { ...current, draftUpdatedAt: detail.draftUpdatedAt } : current);
    };

    window.addEventListener("agent-workspace:refresh", refresh);
    window.addEventListener("agent-workspace:context-updated", contextUpdated);
    window.addEventListener("agent-workspace:draft-updated", draftUpdated);
    return () => {
      window.removeEventListener("agent-workspace:refresh", refresh);
      window.removeEventListener("agent-workspace:context-updated", contextUpdated);
      window.removeEventListener("agent-workspace:draft-updated", draftUpdated);
    };
  }, [agentId]);

  const value = useMemo<AgentTopbarValue>(
    () => ({ orgId, agentId, context, loading }),
    [orgId, agentId, context, loading],
  );

  return <AgentTopbarCtx.Provider value={value}>{children}</AgentTopbarCtx.Provider>;
}

// ── Left slot: context label (agent name + section, else page label) ─────────

/** Neutral page label for non-agent routes (username intentionally absent). */
function pageLabel(pathname: string, isAdmin: boolean): { title: string; subtitle: string } {
  const segs = pathname.split("/").filter(Boolean);

  if (!isAdmin) {
    // /orgs/:id → Dashboard; /orgs/:id/{members|billing|…} → that section.
    if (segs[0] === "orgs") {
      if (segs.length <= 2) return { title: "Dashboard", subtitle: "Clara AI workspace" };
      const section = segs[2] === "agents" ? "Agents" : segs[2] ?? "Dashboard";
      const pretty = section.charAt(0).toUpperCase() + section.slice(1);
      return { title: pretty, subtitle: "Clara AI workspace" };
    }
    if (segs[0] === "kbs") return { title: "Knowledge bases", subtitle: "Clara AI workspace" };
    if (segs[0] === "settings") return { title: "Settings", subtitle: "Clara AI workspace" };
    return { title: "Clara AI workspace", subtitle: "Clara AI workspace" };
  }

  const admin: Array<[string, string]> = [
    ["/dashboard", "Dashboard"],
    ["/subscriptions", "Subscriptions"],
    ["/analytics", "Analytics"],
    ["/system-status", "System Status"],
    ["/settings", "Settings"],
    ["/orgs", "Organisations"],
    ["/kbs", "Knowledge bases"],
  ];
  const hit = admin.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
  return { title: "Platform Console", subtitle: hit ? hit[1] : "Clara AI administration" };
}

export function TopbarContextLabel({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { agentId, context } = useAgentTopbar();

  const fallback = pageLabel(pathname, isAdmin);
  if (!agentId) {
    return (
      <div className="min-w-0 hidden sm:block">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">{fallback.title}</p>
        <p className="text-[11px] text-muted-foreground truncate leading-tight">{fallback.subtitle}</p>
      </div>
    );
  }

  const agentName = context?.agent.name ?? "Agent";
  return (
    <div className="min-w-0 hidden sm:block">
      <p className="text-sm font-semibold text-foreground truncate leading-tight" title={agentName}>
        {agentName}
      </p>
      <p className="text-[11px] text-muted-foreground truncate leading-tight">
        Agents <span className="mx-0.5 text-muted-foreground/50">·</span> {agentSectionLabel(pathname)}
      </p>
    </div>
  );
}

// ── Right slot: version cluster + deploy actions ─────────────────────────────

export function AgentTopbarCluster() {
  const { agentId, context, loading } = useAgentTopbar();
  const [publishing, setPublishing] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  const currentVersion = context?.currentVersion ?? null;
  const deployment = context?.deployment ?? null;
  const draftEditedSinceVersion =
    context?.draftUpdatedAt != null &&
    currentVersion != null &&
    new Date(context.draftUpdatedAt).getTime() > new Date(currentVersion.createdAt).getTime();

  // Publish is enabled ONLY when there is something to publish: draft edits
  // not in a version yet, a saved version production is not running, or the
  // agent has never been published.
  const productionUpToDate =
    !!deployment &&
    !!currentVersion &&
    deployment.versionNumber === currentVersion.versionNumber &&
    !draftEditedSinceVersion;
  const canPublish = !loading && !!context && !productionUpToDate && !!currentVersion;

  // One-click publish: draft edits are versioned automatically, then the
  // resulting (or already-saved) version is published live.
  const publishNow = useCallback(async () => {
    if (!context || publishing) return;
    setPublishing(true);
    try {
      let versionId = currentVersion?.id ?? null;
      if (draftEditedSinceVersion) {
        const version = await saveAgentVersion(agentId ?? "", null);
        versionId = version.id;
      }
      if (!versionId) {
        toast.error("Nothing to publish yet", {
          description: "Save your assistant configuration first — a version is created from the draft.",
        });
        return;
      }
      const result = await publishAgentVersion(agentId ?? "", versionId, deployment?.publicAccess ?? true);
      toast.success("Agent published", {
        description: `Production is now running ${result.deployment.branchName} · v${result.deployment.versionNumber}.`,
      });
      setDiffOpen(false);
      // Do not refresh the Next.js route tree here. The workspace context/cache
      // event updates only the affected agent surfaces and keeps the sidebar,
      // navigation state, and local editor state mounted.
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
    } catch (err) {
      toast.error("Publish failed", { description: (err as Error).message });
    } finally {
      setPublishing(false);
    }
  }, [context, publishing, currentVersion, draftEditedSinceVersion, agentId, deployment?.publicAccess]);

  if (!agentId) return null;

  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Branch / version cluster (desktop+ — mobile keeps the actions only) */}
        {context && (
          <span className="hidden items-center gap-1.5 md:inline-flex">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {currentVersion?.branchName ?? context.main.name ?? "Main"}
              <span className="text-foreground/70">v{currentVersion?.versionNumber ?? 1}</span>
            </span>

            {draftEditedSinceVersion && (
              <button
                type="button"
                onClick={() => setDiffOpen(true)}
                title="View pending changes — what publishing will put live"
                className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20"
              >
                <FileDiff className="h-3 w-3" />
                Draft changes
              </button>
            )}

            {deployment ? (
              <PublishedUrlControl agentId={agentId} deployment={deployment} />
            ) : (
              <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
                Not published
              </span>
            )}
          </span>
        )}

        {/* Live draft age — re-renders on a slow tick so the label ages naturally. */}
        <DraftSavedIndicator draftUpdatedAt={context?.draftUpdatedAt ?? null} />

        {/* Deploy actions */}
        <WorkspaceButton
          variant="secondary"
          onClick={() => window.open(`/preview/agents/${agentId}`, "_blank", "noopener")}
          disabled={!deployment}
          title={deployment ? "Open the draft preview in a new tab" : "Publish first — the preview shows the live version"}
          className="px-2.5 py-1.5 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Preview</span>
        </WorkspaceButton>
        <WorkspaceButton
          variant="primary"
          onClick={() => void publishNow()}
          disabled={!canPublish || publishing}
          title={
            productionUpToDate
              ? "Production is up to date — edit the draft to enable publishing"
              : draftEditedSinceVersion
                ? "Saves the draft as a version and publishes it"
                : `Publish v${currentVersion?.versionNumber ?? "1"} to production`
          }
          className="px-2.5 py-1.5 text-xs"
        >
          <Rocket className={cn("h-3.5 w-3.5", publishing && "animate-pulse")} />
          <span className="hidden sm:inline">
            {publishing ? "Publishing…" : deployment ? "Publish update" : "Publish"}
          </span>
        </WorkspaceButton>
      </div>

      {/* Pending-changes diff drawer (Draft changes → view pending changes) */}
      <DraftChangesDrawer
        agentId={agentId}
        context={context}
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        canPublish={canPublish && draftEditedSinceVersion}
        publishing={publishing}
        onPublish={() => void publishNow()}
      />
    </>
  );
}

/** "Draft saved 18 min ago" — muted age with a live slow tick. */
function DraftSavedIndicator({ draftUpdatedAt }: { draftUpdatedAt: string | null }) {
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);
  if (!draftUpdatedAt) return null;
  return (
    <span className="hidden items-center gap-1 text-[11px] text-muted-foreground/70 xl:inline-flex">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
      Draft saved {timeAgo(draftUpdatedAt)}
    </span>
  );
}

// ── Pending changes drawer (draft ↔ current version) ─────────────────────────

function DraftChangesDrawer({
  agentId,
  context,
  open,
  onClose,
  canPublish,
  publishing,
  onPublish,
}: {
  agentId: string;
  context: AgentWorkspaceContextDTO | null;
  open: boolean;
  onClose: () => void;
  canPublish: boolean;
  publishing: boolean;
  onPublish: () => void;
}) {
  const [diff, setDiff] = useState<SemanticDiffDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentVersion = context?.currentVersion ?? null;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch draft ↔ current-version diff each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setDiff(null);
    setError(null);
    if (!currentVersion) {
      setError("No versions yet — publishing will create v1 from this draft.");
      return;
    }
    let cancelled = false;
    fetchAgentDiff(agentId, currentVersion.id, "draft")
      .then((d) => !cancelled && setDiff(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, agentId, currentVersion]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Pending changes">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Pending changes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {currentVersion
                ? `Draft vs Main · v${currentVersion.versionNumber} — not live yet`
                : "Draft — nothing published yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pending changes"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground/80">
              {error}
            </p>
          ) : (
            <DiffViewer
              diff={diff}
              emptyLabel={
                currentVersion
                  ? `No pending changes — the draft matches v${currentVersion.versionNumber}.`
                  : "No pending changes."
              }
            />
          )}
        </div>

        {canPublish && (
          <div className="border-t border-border px-5 py-3">
            <WorkspaceButton
              variant="primary"
              onClick={onPublish}
              disabled={publishing}
              className="w-full"
              title="Saves the draft as a version and publishes it"
            >
              <Rocket className={cn("h-3.5 w-3.5", publishing && "animate-pulse")} />
              {publishing ? "Publishing…" : "Publish these changes"}
            </WorkspaceButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Published URL controls (badge → popover) ─────────────────────────────────

/** "Published vN" pill → popover with the hosted public page URL (copy /
 *  open) plus live/private status — the published-URL controls. */
function PublishedUrlControl({
  agentId,
  deployment,
}: {
  agentId: string;
  deployment: NonNullable<AgentWorkspaceContextDTO["deployment"]>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [publicPageUrl, setPublicPageUrl] = useState(`/agents/${agentId}`);
  const [copied, setCopied] = useState(false);

  // Same-origin absolute URL — copy-paste ready behind reverse proxies.
  useEffect(() => {
    setPublicPageUrl(`${window.location.origin}/agents/${agentId}`);
  }, [agentId]);

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

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicPageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the URL is still selectable text.
    }
  }

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Published URL controls"
        className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20"
      >
        Published v{deployment.versionNumber}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Published URL controls"
          className="absolute right-0 top-8 z-40 w-80 rounded-2xl border border-border bg-popover p-3.5 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600/80">
            Public page
          </p>
          <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground/90">
            {publicPageUrl}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={publicPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </div>
          <p className="mt-2.5 border-t border-border/70 pt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
            {deployment.publicAccess ? (
              <>
                The hosted public experience — chat and realtime voice from the published settings
                only. Live {timeAgo(deployment.publishedAt)}
                {deployment.publishedByName ? ` (by ${deployment.publishedByName})` : ""}.
              </>
            ) : (
              <>
                <span className="font-medium text-amber-600">Private.</span> Visitors are blocked
                until you publish with public access ON.
              </>
            )}
          </p>
        </div>
      )}
    </span>
  );
}
