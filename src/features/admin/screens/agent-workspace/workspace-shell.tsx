"use client";

/**
 * src/features/admin/screens/agent-workspace/workspace-shell.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Agents workspace shell for /orgs/[id]/agents/* (ElevenLabs layout).
 *
 *   ┌─ org sidebar ─┬───────────────────────────────────────────────┐
 *   │  (admin-shell │  Navbar: agent · version ·                    │
 *   │   owns this)  │  [Preview][Publish] (agent selected)          │
 *   ├───────────────┼───────────────────────────────────────────────┤
 *   │  Agents list  │  content (children)                           │
 *   │  / identity + │                                               │
 *   │  agent tabs   │  + Branch History canvas (?history=1)         │
 *   └───────────────┴───────────────────────────────────────────────┘
 *
 * · Navigation lives in the EXISTING organisation sidebar (admin-shell):
 *   agents list on the index, agent identity + tab groups when an agent
 *   is open. This shell adds no second rail — content keeps full width.
 * · The navbar carries Preview / Publish only once an agent is selected.
 *   Preview opens the DEDICATED published preview page (/preview/agents/:id,
 *   new tab, session-authenticated — never the embed/Deploy API key).
 *   Publish is ONE CLICK: draft edits are versioned automatically and the
 *   result goes live immediately; the button is disabled while production
 *   is already up to date. Deep history lives in Versions/branches — there
 *   is no History button in this public bar.
 *
 * All data is shared through AgentsWorkspaceProvider so the screens
 * underneath consume a single fetch instead of re-querying.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ExternalLink,
  GitBranch,
  History,
  Plus,
  Rocket,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useAgents, useAuth } from "@/modules/admin-ui/hooks";
import { fetchKbs, type Agent, type KnowledgeBase } from "@/modules/admin-ui/api";
import {
  checkAgentDefaultUpdate,
  fetchAgentBranches,
  fetchAgentDiff,
  fetchAgentVersions,
  fetchAgentWorkspaceContext,
  publishAgentVersion,
  restoreAgentVersion,
  saveAgentVersion,
  type AgentVersionDTO,
  type AgentWorkspaceContextDTO,
  type SemanticDiffDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { fetchAgentWorkspaceContextCached } from "@/features/admin/screens/agent-workspace/context-cache";
import { DiffViewer, VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";

// ── Types & navigation model ─────────────────────────────────────────────────

export type AgentWorkspaceTab =
  | "overview"
  | "assistant"
  | "knowledge"
  | "tools"
  | "versions"
  | "publish";

const TAB_SEGMENTS: Record<string, AgentWorkspaceTab> = {
  config: "assistant",
  knowledge: "knowledge",
  tools: "tools",
  versions: "versions",
  publish: "publish",
};

/** Navigation is rendered by the existing organisation sidebar.
 * The agent workspace shell intentionally does not create another rail. */
/** Knowledge base entry attributed to its owning agent. */
export type OrgKbEntry = {
  kb: KnowledgeBase;
  agentId: string;
  agentName: string;
};

// ── Shared workspace context ─────────────────────────────────────────────────

type AgentsWorkspaceValue = {
  orgId: string;
  /** Agent selected via the URL (null on /orgs/[id]/agents). */
  agentId: string | null;
  /** Active workspace tab (only meaningful when agentId is set). */
  tab: AgentWorkspaceTab;
  agents: Agent[];
  agentsLoading: boolean;
  kbs: OrgKbEntry[];
  kbsLoading: boolean;
  create: (name: string, description?: string) => Promise<Agent>;
  remove: (agentId: string) => Promise<void>;
  refetchAgents: () => void;
  /** Workspace context of the selected agent (null while loading/none). */
  context: AgentWorkspaceContextDTO | null;
  contextLoading: boolean;
  contextError: string | null;
  refetchContext: () => void;
  openCreate: () => void;
};

const AgentsWorkspaceCtx = createContext<AgentsWorkspaceValue | null>(null);

export function useAgentsWorkspace(): AgentsWorkspaceValue {
  const value = useContext(AgentsWorkspaceCtx);
  if (!value) throw new Error("useAgentsWorkspace must be used inside <AgentsWorkspaceShell>");
  return value;
}

/**
 * Provider-aware workspace context hook. Screens under the shell share a
 * single fetch; used outside the shell (or with a foreign agentId) it falls
 * back to an independent fetch, preserving the old hook contract:
 *   { context, loading, error, refetch }
 */
export function useAgentWorkspaceContext(agentId: string) {
  const ws = useContext(AgentsWorkspaceCtx);
  const covered = Boolean(ws && agentId && ws.agentId === agentId);

  // Independent fallback (disabled when the provider already covers it).
  const [state, setState] = useState<{
    data: AgentWorkspaceContextDTO | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (covered || !agentId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchAgentWorkspaceContext(agentId)
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((e: Error) => !cancelled && setState({ data: null, loading: false, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [agentId, covered]);

  const refetchIndependent = useCallback(() => {
    if (!agentId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchAgentWorkspaceContext(agentId)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e: Error) => setState({ data: null, loading: false, error: e.message }));
  }, [agentId]);

  if (covered && ws) {
    return {
      context: ws.context,
      loading: ws.contextLoading,
      error: ws.contextError,
      refetch: ws.refetchContext,
    };
  }
  return { context: state.data, loading: state.loading, error: state.error, refetch: refetchIndependent };
}

// ── URL parsing ──────────────────────────────────────────────────────────────

function parseAgentsPath(pathname: string): { agentId: string | null; tab: AgentWorkspaceTab } {
  const segs = pathname.split("/").filter(Boolean); // orgs / {id} / agents / …
  if (segs.length < 4 || segs[0] !== "orgs" || segs[2] !== "agents") {
    return { agentId: null, tab: "overview" };
  }
  const agentId = segs[3];
  const tab = segs.length >= 5 ? (TAB_SEGMENTS[segs[4]] ?? "overview") : "overview";
  return { agentId, tab };
}

// ── Provider ─────────────────────────────────────────────────────────────────

function AgentsWorkspaceProvider({ orgId, agentId, children }: {
  orgId: string;
  agentId: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tab = parseAgentsPath(pathname).tab;
  const { agents, loading: agentsLoading, create, remove, refetch } = useAgents(orgId);

  // "New agent" dialog — owned here so both the sidebar header, the navbar
  // button and the empty-state CTA can open it.
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = useCallback(() => setCreateOpen(true), []);

  // Org-wide knowledge bases (KBs belong to agents → fan out per agent).
  const [kbs, setKbs] = useState<OrgKbEntry[]>([]);
  const [kbsLoading, setKbsLoading] = useState(true);

  useEffect(() => {
    if (agentsLoading) return;
    let cancelled = false;
    setKbsLoading(true);
    Promise.all(
      agents.map((a) =>
        fetchKbs(a.id).catch(() => [] as KnowledgeBase[]),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        setKbs(
          lists.flatMap((list, i) =>
            list.map((kb) => ({ kb, agentId: agents[i].id, agentName: agents[i].name })),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setKbsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agents, agentsLoading]);

  // Workspace context for the selected agent.
  const [context, setContext] = useState<AgentWorkspaceContextDTO | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const refetchContext = useCallback(() => {
    if (!agentId) {
      setContext(null);
      return;
    }
    setContextLoading(true);
    setContextError(null);
    fetchAgentWorkspaceContext(agentId)
      .then((data) => setContext(data))
      .catch((e: Error) => setContextError(e.message))
      .finally(() => setContextLoading(false));
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      setContext(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }
    // Initial load goes through the shared cache (the organisation sidebar's
    // identity block reads the same entry); explicit refetches below bypass it.
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    fetchAgentWorkspaceContextCached(agentId)
      .then((data) => !cancelled && setContext(data))
      .catch((e: Error) => !cancelled && setContextError(e.message))
      .finally(() => !cancelled && setContextLoading(false));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Event bridge — the organisation sidebar's agents-list "+" opens the same
  // create-agent dialog this provider owns (single source of truth).
  useEffect(() => {
    const open = () => setCreateOpen(true);
    window.addEventListener("clara:open-create-agent", open);
    return () => window.removeEventListener("clara:open-create-agent", open);
  }, []);

  // Cross-screen refresh: one-click publish (navbar, Overview, publish screen)
  // fires this event so every mounted workspace surface re-reads its context.
  useEffect(() => {
    const refresh = () => refetchContext();
    window.addEventListener("agent-workspace:refresh", refresh);
    return () => window.removeEventListener("agent-workspace:refresh", refresh);
  }, [refetchContext]);

  const value = useMemo<AgentsWorkspaceValue>(
    () => ({
      orgId,
      agentId,
      tab,
      agents,
      agentsLoading,
      kbs,
      kbsLoading,
      create: async (name, description) => {
        const created = (await create(name, description)) as Agent;
        return created;
      },
      remove,
      refetchAgents: refetch,
      context,
      contextLoading,
      contextError,
      refetchContext,
      openCreate,
    }),
    [orgId, agentId, tab, agents, agentsLoading, kbs, kbsLoading, create, remove, refetch,
      context, contextLoading, contextError, refetchContext, openCreate],
  );

  return (
    <AgentsWorkspaceCtx.Provider value={value}>
      {children}
      {createOpen && <CreateAgentDialog onClose={() => setCreateOpen(false)} />}
    </AgentsWorkspaceCtx.Provider>
  );
}

// ── Navbar ───────────────────────────────────────────────────────────────────

function WorkspaceNavbar() {
  const { agentId, context, contextLoading, openCreate } = useAgentsWorkspace();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;

  if (!agentId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          {isAdmin && (
            <p className="text-[11px] text-muted-foreground/70">
              <Link href="/orgs" className="hover:text-foreground">Organisations</Link>
              <span className="mx-1">/</span>Agents
            </p>
          )}
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Agents</h1>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
            Each agent groups knowledge bases and carries its own assistant configuration — select one on the left.
          </p>
        </div>
        <WorkspaceButton variant="primary" onClick={openCreate} className="shrink-0">
          <Plus className="h-3.5 w-3.5" /> New Agent
        </WorkspaceButton>
      </div>
    );
  }

  return <AgentNavbar context={context} loading={contextLoading} />;
}

function AgentNavbar({ context, loading }: {
  context: AgentWorkspaceContextDTO | null;
  loading: boolean;
}) {
  const { agentId, agents, orgId, remove } = useAgentsWorkspace();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [defaultUpdate, setDefaultUpdate] = useState<{
    agentDefaultVersion: number | null;
    currentPlatformVersion: number | null;
  } | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!context?.defaultAssistantUpdate?.updateAvailable) {
      setDefaultUpdate(null);
      return;
    }
    void checkAgentDefaultUpdate(agentId ?? "")
      .then((r) =>
        setDefaultUpdate(
          r.updateAvailable
            ? { agentDefaultVersion: r.agentDefaultVersion, currentPlatformVersion: r.currentPlatformVersion }
            : null,
        ),
      )
      .catch(() => setDefaultUpdate(null));
  }, [agentId, context?.defaultAssistantUpdate?.updateAvailable]);

  const agent = context?.agent;
  const name = agent?.name ?? agents.find((a) => a.id === agentId)?.name ?? (loading ? "…" : "Agent");
  const deployment = context?.deployment ?? null;
  const currentVersion = context?.currentVersion;
  const draftEditedSinceVersion =
    context?.draftUpdatedAt != null &&
    currentVersion != null &&
    new Date(context.draftUpdatedAt).getTime() > new Date(currentVersion.createdAt).getTime();

  // Publish is enabled ONLY when there is something to publish:
  //   • draft edits that are not in a version yet, OR
  //   • a saved version that production is not running, OR
  //   • the agent has never been published.
  const productionUpToDate =
    !!deployment &&
    !!currentVersion &&
    deployment.versionNumber === currentVersion.versionNumber &&
    !draftEditedSinceVersion;
  const canPublish = !loading && !!context && !productionUpToDate && !!currentVersion;

  // One-click publish: draft edits are versioned automatically, then the
  // resulting (or already-saved) version is published. No version picking,
  // no review screens — just a notification when it is live.
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
      router.refresh();
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
    } catch (err) {
      toast.error("Publish failed", { description: (err as Error).message });
    } finally {
      setPublishing(false);
    }
  }, [context, publishing, currentVersion, draftEditedSinceVersion, agentId, deployment?.publicAccess, router]);

  async function handleDelete() {
    if (!agentId) return;
    if (!confirm("Delete this agent and every knowledge base inside it?")) return;
    setDeleting(true);
    try {
      await remove(agentId);
      router.push(`/orgs/${orgId}/agents`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{name}</h1>
            {context && (
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-medium">
                  <GitBranch className="h-3 w-3" /> Main
                </span>
                <span className="font-medium text-foreground/80">v{currentVersion?.versionNumber ?? 1}</span>
                {draftEditedSinceVersion && <VersionBadge tone="warning">Draft changes</VersionBadge>}
                {deployment ? (
                  <VersionBadge tone="success">Published v{deployment.versionNumber}</VersionBadge>
                ) : (
                  <VersionBadge tone="muted">Not published</VersionBadge>
                )}
              </span>
            )}
          </div>
          {context?.draftUpdatedAt && (
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              Draft saved {timeAgo(context.draftUpdatedAt)}
              {deployment && currentVersion && deployment.versionNumber !== currentVersion.versionNumber
                ? " · production runs an earlier version"
                : ""}
            </p>
          )}
        </div>

        {/* One-click deploy actions. Preview opens the DEDICATED published
            preview page in a new tab (session-authenticated — no embed /
            Deploy API key involved). Publish stays disabled while production
            is up to date. Deep history lives in Versions/branches, so there
            is no History button in this public bar. */}
        <div className="flex shrink-0 items-center gap-2">
          <WorkspaceButton
            variant="secondary"
            onClick={() => window.open(`/preview/agents/${agentId}`, "_blank", "noopener")}
            disabled={!deployment}
            title={deployment ? "Open the published preview in a new tab" : "Publish first — the preview shows the live version"}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Preview
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
          >
            <Rocket className={`h-3.5 w-3.5 ${publishing ? "animate-pulse" : ""}`} />
            <span className="hidden sm:inline">{publishing ? "Publishing…" : deployment ? "Publish update" : "Publish"}</span>
            <span className="sm:hidden">{publishing ? "…" : deployment ? "Update" : "Publish"}</span>
          </WorkspaceButton>
          <span title="Delete agent">
            <WorkspaceButton
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
              aria-label={`Delete agent ${name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </WorkspaceButton>
          </span>
        </div>
      </div>

      {/* §22 — new platform default available (explicit review/apply, never silent) */}
      {defaultUpdate && !dismissing && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-primary">New platform default available.</span>{" "}
            Your agent was created from v{defaultUpdate.agentDefaultVersion ?? "?"}. Current platform default is
            v{defaultUpdate.currentPlatformVersion ?? "?"}.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/orgs/${orgId}/agents/${agentId}/versions`}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30"
            >
              Review changes
            </Link>
            <button
              type="button"
              onClick={() => setDismissing(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              Keep current
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create-agent dialog ──────────────────────────────────────────────────────

function CreateAgentDialog({ onClose }: { onClose: () => void }) {
  const { create } = useAgentsWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await create(name.trim(), description.trim() || undefined);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-agent-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 id="create-agent-title" className="text-base font-semibold text-foreground">New agent</h3>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Groups knowledge bases and carries its own assistant configuration.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-foreground/90">Agent name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer Support Agent"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-foreground/90">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <WorkspaceButton variant="secondary" onClick={onClose} disabled={creating}>
              Cancel
            </WorkspaceButton>
            <WorkspaceButton type="submit" variant="primary" disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create agent"}
            </WorkspaceButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shell frame ──────────────────────────────────────────────────────────────

function ShellFrame({ children }: { children: ReactNode }) {
  const { agentId, orgId, context, refetchContext } = useAgentsWorkspace();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const historyOpen = searchParams.get("history") === "1";
  // Branch context for the history canvas: the branches table's per-row
  // history icon targets a specific branch; anywhere else defaults to Main.
  const historyBranchId = searchParams.get("branch");
  const historyBranchName =
    (historyBranchId && context?.branches.find((b) => b.id === historyBranchId)?.name) || null;

  return (
    <div className="min-h-[calc(100dvh-3.5rem)]">
      {/* The organisation sidebar owns navigation. This shell only supplies
          the agent header and content, so the page keeps the full width that
          the old nested sidebar consumed. */}
      <header className="sticky top-14 z-20 border-b border-border bg-background/90 backdrop-blur-md md:top-16">
        <WorkspaceNavbar />
      </header>
      <main className="p-4 sm:p-6 lg:p-8">{children}</main>

      {agentId && (
        <AgentHistoryDrawer
          agentId={agentId}
          open={historyOpen}
          onClose={() => router.replace(pathname)}
          branchId={historyBranchId}
          branchName={historyBranchName}
          versionsHref={`/orgs/${orgId}/agents/${agentId}/versions`}
          onRestored={() => refetchContext()}
        />
      )}
    </div>
  );
}

function AgentHistoryDrawer({
  agentId,
  open,
  onClose,
  branchId,
  branchName,
  versionsHref,
  onRestored,
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
  /** Explicit branch target (from the branches table row); null → Main. */
  branchId: string | null;
  branchName: string | null;
  versionsHref: string;
  onRestored: () => void;
}) {
  const [resolvedBranchId, setResolvedBranchId] = useState<string | null>(branchId);
  const [resolvedBranchName, setResolvedBranchName] = useState<string | null>(branchName);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [versions, setVersions] = useState<AgentVersionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row interaction state.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, SemanticDiffDTO | null>>({});
  const [restoreTarget, setRestoreTarget] = useState<AgentVersionDTO | null>(null);
  const [busy, setBusy] = useState(false);

  // Branch context: explicit target wins; otherwise resolve Main once.
  useEffect(() => {
    if (!open) return;
    setResolvedBranchId(branchId);
    setResolvedBranchName(branchName);
    setExpandedId(null);
    setDiffs({});
    setRestoreTarget(null);
    if (branchId) return;
    let cancelled = false;
    fetchAgentBranches(agentId)
      .then((result) => {
        if (cancelled) return;
        const main = result.branches.find((b) => b.id === branchId) ?? result.branches.find((b) => b.isMain) ?? result.branches[0] ?? null;
        setResolvedBranchId(main?.id ?? null);
        setResolvedBranchName(main?.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, agentId, branchId, branchName]);

  // Agent display name for the drawer subtitle.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchAgentWorkspaceContextCached(agentId)
      .then((context) => !cancelled && setAgentName(context.agent.name))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  // Branch history — newest first, tags included.
  useEffect(() => {
    if (!open || !resolvedBranchId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAgentVersions(agentId, resolvedBranchId)
      .then((result) => !cancelled && setVersions(result.versions))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, agentId, resolvedBranchId]);

  if (!open) return null;

  const shownBranchName = resolvedBranchName ?? branchName ?? "Main";

  /** Eye icon — expand the row into its semantic diff against the parent. */
  async function toggleExpand(version: AgentVersionDTO) {
    if (expandedId === version.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(version.id);
    if (diffs[version.id] !== undefined) return;
    setDiffs((d) => ({ ...d, [version.id]: null }));
    try {
      if (!version.parentVersionId) {
        setDiffs((d) => ({ ...d, [version.id]: null }));
        return;
      }
      const diff = await fetchAgentDiff(agentId, version.parentVersionId, version.id);
      setDiffs((d) => ({ ...d, [version.id]: diff }));
    } catch {
      setDiffs((d) => {
        const next = { ...d };
        delete next[version.id];
        return next;
      });
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await restoreAgentVersion(agentId, restoreTarget.id);
      setRestoreTarget(null);
      onRestored();
      const refreshed = await fetchAgentVersions(agentId, resolvedBranchId ?? undefined);
      setVersions(refreshed.versions);
      setExpandedId(null);
      setDiffs({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Branch history">
      <button
        type="button"
        aria-label="Close branch history"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-background shadow-2xl sm:w-[540px]">
        {/* Header — history icon, agent + branch context, close. */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 shrink-0 text-primary" />
              <h2 className="truncate text-base font-semibold text-foreground">Branch History</h2>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{agentName ?? "Agent"}</span>
              <span aria-hidden>·</span>
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="font-medium text-foreground/80">{shownBranchName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Version entries — compact rows, newest first. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && (
            <p className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {loading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
              ))}
            </div>
          ) : (
            <ol className="divide-y divide-border/60">
              {versions.map((version) => {
                const live = version.publishedAt != null;
                const tags = version.changeTags ?? [];
                const expanded = expandedId === version.id;
                return (
                  <li key={version.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                          <span className="truncate">
                            {version.changeSummary || `v${version.versionNumber} configuration`}
                          </span>
                          {live && <VersionBadge tone="success">Live</VersionBadge>}
                          {version.source === "restore" && <VersionBadge tone="muted">Restore</VersionBadge>}
                          {version.source === "merge" && <VersionBadge tone="muted">Merge</VersionBadge>}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground/80">
                          <span className="font-medium text-foreground/70">v{version.versionNumber}</span>
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                          <span aria-hidden>·</span>
                          <span>{formatHistoryDate(version.createdAt)}</span>
                          {version.createdByName && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">{version.createdByName}</span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Row actions — view (diff) + restore. */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void toggleExpand(version)}
                          aria-label={expanded ? "Hide changes" : `View v${version.versionNumber} changes`}
                          title={expanded ? "Hide changes" : "View changes"}
                          className={`rounded-lg border p-1.5 transition-colors ${
                            expanded
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreTarget(version)}
                          aria-label={`Restore v${version.versionNumber}`}
                          title="Restore this version"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded — semantic diff against the parent version. */}
                    {expanded && (
                      <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                        {!version.parentVersionId ? (
                          <p className="py-2 text-center text-xs text-muted-foreground/70">
                            Initial version — no parent to compare against.
                          </p>
                        ) : (
                          <DiffViewer diff={diffs[version.id] ?? null} emptyLabel="No changes against the parent version." />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              {versions.length === 0 && !error && (
                <li className="px-5 py-12 text-center text-sm text-muted-foreground/70">
                  No versions on this branch yet — save a version from the Agent tab.
                </li>
              )}
            </ol>
          )}
        </div>

        {/* Restore confirmation — inline footer while a target is selected. */}
        {restoreTarget && (
          <div className="shrink-0 border-t border-border bg-muted/30 px-5 py-3.5">
            <p className="text-xs text-muted-foreground">
              Restore <span className="font-semibold text-foreground">v{restoreTarget.versionNumber}</span>? A new
              version will be created with its configuration — history is never deleted.
            </p>
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <WorkspaceButton variant="secondary" onClick={() => setRestoreTarget(null)} disabled={busy}>
                Cancel
              </WorkspaceButton>
              <WorkspaceButton variant="primary" onClick={() => void confirmRestore()} disabled={busy}>
                {busy ? "Restoring…" : "Restore as new version"}
              </WorkspaceButton>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted-foreground/60">
            Immutable history — restoring always creates a new version.
          </p>
          <Link
            href={versionsHref}
            onClick={onClose}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Manage branches
          </Link>
        </div>
      </aside>
    </div>
  );
}

/** "Sep 13, 7:49 PM" style dates for history rows. */
function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Public shell ─────────────────────────────────────────────────────────────

export default function AgentsWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { agentId } = parseAgentsPath(pathname);
  // orgId comes from the URL segment; useParams in this layout only carries
  // [id] (child segments are not visible to parent layouts).
  const segs = pathname.split("/").filter(Boolean);
  const orgId = segs[1] ?? "";

  return (
    <AgentsWorkspaceProvider orgId={orgId} agentId={agentId}>
      <ShellFrame>{children}</ShellFrame>
    </AgentsWorkspaceProvider>
  );
}
