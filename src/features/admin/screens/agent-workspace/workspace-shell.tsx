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
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  GitBranch,
  History,
  LayoutDashboard,
  Plus,
  Rocket,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useAgents, useAuth } from "@/modules/admin-ui/hooks";
import { fetchKbs, type Agent, type KnowledgeBase } from "@/modules/admin-ui/api";
import {
  checkAgentDefaultUpdate,
  fetchAgentWorkspaceContext,
  type AgentWorkspaceContextDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";

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

/** Sidebar groups shown when an agent is selected (ElevenLabs layout). */
const AGENT_NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    id: AgentWorkspaceTab;
    label: string;
    icon: typeof LayoutDashboard;
    href: (orgId: string, agentId: string) => string;
  }>;
}> = [
  {
    label: "Overview",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, href: (o, a) => `/orgs/${o}/agents/${a}` },
    ],
  },
  {
    label: "Configure",
    items: [
      { id: "assistant", label: "Assistant & AI", icon: Bot, href: (o, a) => `/orgs/${o}/agents/${a}/config` },
      { id: "knowledge", label: "Knowledge", icon: BookOpen, href: (o, a) => `/orgs/${o}/agents/${a}/knowledge` },
      { id: "tools", label: "Tools", icon: Wrench, href: (o, a) => `/orgs/${o}/agents/${a}/tools` },
    ],
  },
  {
    label: "Deploy",
    items: [
      { id: "versions", label: "Versions", icon: History, href: (o, a) => `/orgs/${o}/agents/${a}/versions` },
      { id: "publish", label: "Publish", icon: Rocket, href: (o, a) => `/orgs/${o}/agents/${a}/publish` },
    ],
  },
];

/** Flat tab list for the mobile strip. */
const AGENT_TABS: Array<{ id: AgentWorkspaceTab; label: string; href: (o: string, a: string) => string }> =
  AGENT_NAV_GROUPS.flatMap((g) => g.items.map(({ id, label, href }) => ({ id, label, href })));

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

// ── Sidebar: no agent selected ─────────────────────────────────────────────────

function AgentsListSidebar({ className }: { className?: string }) {
  const { orgId, agents, agentsLoading, kbs, kbsLoading, agentId, openCreate } = useAgentsWorkspace();

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Agents group */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Agents</p>
        <button
          type="button"
          onClick={openCreate}
          aria-label="New agent"
          title="New agent"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {agentsLoading ? (
        <div className="space-y-1 px-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/60" />)}
        </div>
      ) : agents.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground/70">
          No agents yet — create one to get started.
        </p>
      ) : (
        <ul className="px-2 pb-3 space-y-0.5">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/orgs/${orgId}/agents/${agent.id}`}
                aria-current={agentId === agent.id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  agentId === agent.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{agent.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Knowledge bases group */}
      <div className="mt-2 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2 px-4 pb-2">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground/70" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Knowledge Base
          </p>
        </div>
        {kbsLoading ? (
          <div className="space-y-1 px-2 pb-3">
            {[1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/60" />)}
          </div>
        ) : kbs.length === 0 ? (
          <p className="px-4 pb-3 text-xs text-muted-foreground/70">
            No knowledge bases yet — open an agent to create one.
          </p>
        ) : (
          <ul className="px-2 pb-4 space-y-0.5">
            {kbs.map(({ kb, agentName }) => (
              <li key={kb.id}>
                <Link
                  href={`/kbs/${kb.id}`}
                  title={`${kb.name} · ${agentName}`}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                    <BookOpen className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate leading-tight">{kb.name}</span>
                    <span className="block truncate text-[10px] leading-tight text-muted-foreground/60">
                      {agentName}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Sidebar: agent selected ──────────────────────────────────────────────────

function AgentContextCard() {
  const { orgId, agentId, context, contextLoading, agents } = useAgentsWorkspace();
  const name =
    context?.agent.name ??
    agents.find((a) => a.id === agentId)?.name ??
    (contextLoading ? "…" : "Agent");
  const currentVersion = context?.currentVersion;

  return (
    <Link
      href={`/orgs/${orgId}/agents/${agentId}/versions`}
      className="mx-2 mt-2 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/70"
      title="Agent · branch Main · current version — open version history"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
        <Bot className="h-4 w-4 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          Main · v{currentVersion?.versionNumber ?? 1}
        </span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}

function AgentNavSidebar({ className }: { className?: string }) {
  const { orgId, agentId, tab } = useAgentsWorkspace();
  if (!agentId) return null;

  return (
    <div className={cn("flex flex-col", className)}>
      <Link
        href={`/orgs/${orgId}/agents`}
        className="mx-2 mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to agents
      </Link>

      <AgentContextCard />

      <nav className="flex-1 px-2 py-3 space-y-4" aria-label="Agent workspace">
        {AGENT_NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = tab === item.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href(orgId, agentId)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

// ── Mobile strips (sidebar collapses to horizontal scroll rows) ─────────────

function MobileAgentsStrip() {
  const { orgId, agents, agentsLoading, agentId, openCreate } = useAgentsWorkspace();
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-3 py-2.5">
      <button
        type="button"
        onClick={openCreate}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30"
      >
        <Plus className="h-3 w-3" /> New
      </button>
      {agentsLoading
        ? [1, 2, 3].map((i) => <div key={i} className="h-7 w-24 shrink-0 animate-pulse rounded-full bg-muted/60" />)
        : agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/orgs/${orgId}/agents/${agent.id}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                agentId === agent.id
                  ? "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "border-border bg-card text-foreground/80 hover:text-foreground",
              )}
            >
              <Bot className="h-3 w-3" />
              <span className="max-w-32 truncate">{agent.name}</span>
            </Link>
          ))}
    </div>
  );
}

function MobileAgentTabsStrip() {
  const { orgId, agentId, tab } = useAgentsWorkspace();
  if (!agentId) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-3 py-2">
      <Link
        href={`/orgs/${orgId}/agents`}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Agents
      </Link>
      {AGENT_TABS.map((t) => {
        const active = tab === t.id;
        return (
          <Link
            key={t.id}
            href={t.href(orgId, agentId)}
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary font-medium"
                : "border-border bg-card text-foreground/80 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
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

        {/* Versions / publishing — only exist once an agent is selected. */}
        <div className="flex shrink-0 items-center gap-2">
          <WorkspaceButton
            variant="secondary"
            onClick={() => agentId && router.push(`/orgs/${orgId}/agents/${agentId}/versions`)}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Versions</span>
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
  const { agentId } = useAgentsWorkspace();

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:flex-row">
      {/* Sidebar — desktop: fixed column; mobile: horizontal strip on top */}
      <aside className="border-b border-border bg-muted/20 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="lg:hidden">{agentId ? <MobileAgentTabsStrip /> : <MobileAgentsStrip />}</div>
        <div className="hidden lg:block pb-6">
          {agentId ? <AgentNavSidebar className="min-h-full" /> : <AgentsListSidebar />}
        </div>
      </aside>

      {/* Main column — navbar + screen content */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-14 z-20 border-b border-border bg-background/85 backdrop-blur-md md:top-16">
          <WorkspaceNavbar />
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
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
