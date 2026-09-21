"use client";

/**
 * src/features/admin/screens/agent-workspace/workspace-shell.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs-style agents workspace shell for /orgs/[id]/agents/*.
 *
 *   ┌──────────────┬──────────────────────────────────────────────┐
 *   │  Sidebar     │  Navbar: agent · version · [Versions][Publish]│
 *   │              ├──────────────────────────────────────────────┤
 *   │  (no agent)  │  content (children)                          │
 *   │  AGENTS  [+] │                                              │
 *   │  · agent     │                                              │
 *   │  KNOWLEDGE   │                                              │
 *   │  · kb        │  (agent selected)                            │
 *   │              │  ← Back to agents                            │
 *   │              │  [context card: agent · Main · v#]           │
 *   │              │  OVERVIEW / CONFIGURE / DEPLOY groups        │
 *   └──────────────┴──────────────────────────────────────────────┘
 *
 * · No agent selected  → sidebar lists the org's agents and knowledge
 *   bases; navbar shows the Agents title (no publish controls).
 * · Agent selected     → sidebar switches to that agent's workspace
 *   tabs; the navbar exposes Versions/Publish (only in this state).
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
  Bot,
  GitBranch,
  History,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { useAgents, useAuth } from "@/modules/admin-ui/hooks";
import { fetchKbs, type Agent, type KnowledgeBase } from "@/modules/admin-ui/api";
import {
  checkAgentDefaultUpdate,
  fetchAgentWorkspaceContext,
  fetchAgentBranches,
  fetchAgentVersions,
  type AgentBranchDTO,
  type AgentVersionDTO,
  type AgentWorkspaceContextDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";

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
    refetchContext();
  }, [agentId, refetchContext]);

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

        {/* History opens the branch/version history as a half-canvas,
            matching the version-control interaction used by ElevenLabs. */}
        <div className="flex shrink-0 items-center gap-2">
          <WorkspaceButton
            variant="secondary"
            onClick={() => agentId && router.push(`/orgs/${orgId}/agents/${agentId}/versions?history=1`)}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">History</span>
          </WorkspaceButton>
          <WorkspaceButton
            variant={deployment ? "secondary" : "primary"}
            onClick={() => agentId && router.push(`/orgs/${orgId}/agents/${agentId}/publish`)}
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{deployment ? "Publish update" : "Publish"}</span>
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
  const { agentId, orgId } = useAgentsWorkspace();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const historyOpen = searchParams.get("history") === "1";

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
          versionsHref={`/orgs/${orgId}/agents/${agentId}/versions`}
        />
      )}
    </div>
  );
}

function AgentHistoryDrawer({
  agentId,
  open,
  onClose,
  versionsHref,
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
  versionsHref: string;
}) {
  const [branches, setBranches] = useState<AgentBranchDTO[]>([]);
  const [versions, setVersions] = useState<AgentVersionDTO[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAgentBranches(agentId)
      .then((result) => {
        if (cancelled) return;
        setBranches(result.branches);
        const main = result.branches.find((branch) => branch.isMain) ?? result.branches[0] ?? null;
        setSelectedBranchId((current) => current ?? main?.id ?? null);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [agentId, open]);

  useEffect(() => {
    if (!open || !selectedBranchId) return;
    let cancelled = false;
    setVersionsLoading(true);
    fetchAgentVersions(agentId, selectedBranchId)
      .then((result) => !cancelled && setVersions(result.versions))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setVersionsLoading(false));
    return () => { cancelled = true; };
  }, [agentId, open, selectedBranchId]);

  if (!open) return null;

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Agent history">
      <button
        type="button"
        aria-label="Close history"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col border-l border-border bg-background shadow-2xl sm:w-[50vw]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              Agent versioning
            </p>
            <h2 className="text-base font-semibold text-foreground">History</h2>
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

        <div className="flex min-h-0 flex-1">
          {/* Branch rail — deliberately compact, matching a source-control
              browser rather than adding another permanent sidebar. */}
          <div className="w-[38%] min-w-[190px] shrink-0 overflow-y-auto border-r border-border bg-muted/10 p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <div>
                <p className="text-xs font-semibold text-foreground">Branches</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">Lines of development</p>
              </div>
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-muted/60" />)}
              </div>
            ) : (
              <div className="space-y-1">
                {branches.map((branch) => {
                  const active = branch.id === selectedBranchId;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => setSelectedBranchId(branch.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-primary/25 bg-primary/10"
                          : "border-transparent hover:border-border hover:bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${branch.isMain ? "bg-primary" : "bg-muted-foreground/50"}`} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{branch.name}</span>
                        {branch.isMain && <VersionBadge tone="primary">Main</VersionBadge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/60">
                        <span>v{branch.latestVersionNumber ?? 1}</span>
                        {branch.draftUpdatedAt && <span>Draft</span>}
                        {branch.isArchived && <span>Archived</span>}
                      </div>
                    </button>
                  );
                })}
                {branches.length === 0 && !error && (
                  <p className="px-2 py-6 text-xs text-muted-foreground/70">No branches yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Branch history */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {selectedBranch?.name ?? "Branch"}
                </h3>
                {selectedBranch?.isMain && <VersionBadge tone="primary">Main</VersionBadge>}
                {selectedBranch?.isArchived && <VersionBadge tone="muted">Archived</VersionBadge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {selectedBranch?.description || "Immutable configuration history for this branch."}
              </p>
            </div>

            {error && (
              <p className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            {versionsLoading ? (
              <div className="space-y-2 p-5">
                {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted/50" />)}
              </div>
            ) : (
              <ol className="relative p-5">
                {versions.map((version, index) => (
                  <li key={version.id} className="relative pl-7 pb-5 last:pb-0">
                    {index < versions.length - 1 && (
                      <span className="absolute left-[7px] top-3 h-full w-px bg-border" aria-hidden />
                    )}
                    <span className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-background bg-primary ring-1 ring-border" aria-hidden />
                    <div className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">v{version.versionNumber}</span>
                        {version.publishedAt && <VersionBadge tone="success">Published</VersionBadge>}
                        {version.source === "restore" && <VersionBadge tone="muted">Restore</VersionBadge>}
                        {version.source === "merge" && <VersionBadge tone="muted">Merge</VersionBadge>}
                      </div>
                      <p className="mt-1 text-xs text-foreground/80">
                        {version.changeSummary || "Configuration updated"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">
                        {version.createdByName || "System"} · {timeAgo(version.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
                {versions.length === 0 && (
                  <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground/70">
                    No committed versions on this branch yet.
                  </li>
                )}
              </ol>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted-foreground/60">
            Drafts stay separate from immutable versions until you save a version.
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
