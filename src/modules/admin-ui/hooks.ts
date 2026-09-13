"use client";
/**
 * src/modules/admin-ui/hooks.ts
 * React hooks for admin data fetching and mutations.
 * Simple useState + useEffect — no external state library needed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import type {
  CurrentUser, Org, Project, KnowledgeBase, KbDocument, AssistantConfig, OrgMember,
  ConfigSnapshot, KbAnalytics, ScrapeSession, ScrapeUrl, ScrapeProgress, ScrapeSessionStatus,
  DiscoverProgress, OrgAISettings, KBAIOverrides, ScrapeStreamSnapshot,
  CreateWorkspaceInput, CreateWorkspaceResult,
  Agent, AgentStatus, AgentWithProjects, AgentProjectAssignment, CreateAgentInput, UpdateAgentInput,
  PlatformAssistantDefaults,
} from "./api";

export type {
  CurrentUser, Org, Project, KnowledgeBase, KbDocument, AssistantConfig, OrgMember,
  ConfigSnapshot, KbAnalytics, ScrapeSession, ScrapeUrl, ScrapeProgress, ScrapeSessionStatus,
  DiscoverProgress, OrgAISettings, KBAIOverrides, ScrapeStreamSnapshot,
  CreateWorkspaceInput, CreateWorkspaceResult,
  Agent, AgentStatus, AgentWithProjects, AgentProjectAssignment, CreateAgentInput, UpdateAgentInput,
  PlatformAssistantDefaults,
};

// ── Generic async state helper ────────────────────────────────────────────────

type AsyncState<T> = { data: T | null; loading: boolean; error: string | null };

function useAsync<T>(
  fn: () => Promise<T>,
  key: string,
  options?: { enabled?: boolean },
): AsyncState<T> & { refetch: () => void } {
  const enabled = options?.enabled ?? true;
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const load = useCallback(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e: Error) => setState({ data: null, loading: false, error: e.message }));
  }, [enabled]);

  useEffect(() => {
    load();
  }, [key, load]);

  return { ...state, refetch: load };
}

// ── Auth hook ─────────────────────────────────────────────────────────────────

export function useAuth() {
  const [user, setUser]               = useState<CurrentUser | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  // primaryOrgId: the first org the current user belongs to.
  // Null for super-admins (they see all orgs) or when not yet loaded.
  const [primaryOrgId, setPrimaryOrgId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await api.fetchMe();
        setUser(u);
        if (!u.isSuperAdmin) {
          try {
            const orgs = await api.fetchOrgs();
            setPrimaryOrgId(orgs[0]?.id ?? null);
          } catch { /* non-critical */ }
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null);
    try {
      const u = await api.login(email, password);
      setUser(u);
      if (!u.isSuperAdmin) {
        try {
          const orgs = await api.fetchOrgs();
          setPrimaryOrgId(orgs[0]?.id ?? null);
        } catch { /* non-critical */ }
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setPrimaryOrgId(null);
  }, []);

  return { user, loading, error, login, logout, primaryOrgId };
}

// ── Orgs ──────────────────────────────────────────────────────────────────────

export function useOrgs() {
  const { data, loading, error, refetch } = useAsync(api.fetchOrgs, "orgs");
  const orgs = data ?? [];
  const create = useCallback(async (name: string) => { const org = await api.createOrg(name); refetch(); return org; }, [refetch]);
  const remove = useCallback(async (orgId: string) => { await api.deleteOrg(orgId); refetch(); }, [refetch]);
  return { orgs, loading, error, create, remove, refetch };
}

export function useOrg(orgId?: string | null) {
  return useAsync(() => api.fetchOrg(orgId!), `org:${orgId ?? "none"}`, {
    enabled: Boolean(orgId),
  });
}

export function useCreateWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCallback(async (input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.createWorkspace(input);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  return { create, loading, error };
}

export function useProject(projectId?: string | null) {
  return useAsync(() => api.fetchProject(projectId!), `project:${projectId ?? "none"}`, {
    enabled: Boolean(projectId),
  });
}

export function useOrgAISettings(orgId?: string | null) {
  const { data: settings, loading, error, refetch } = useAsync(
    () => api.fetchOrgAISettings(orgId!),
    `org-ai-settings:${orgId ?? "none"}`,
    { enabled: Boolean(orgId) },
  );

  const save = useCallback(
    async (data: Partial<Omit<OrgAISettings, "id" | "orgId" | "createdAt" | "updatedAt">>) => {
      const updated = await api.patchOrgAISettings(orgId!, data);
      refetch();
      return updated;
    },
    [orgId, refetch],
  );

  return { settings, loading, error, save, refetch };
}

// ── Platform assistant defaults ───────────────────────────────────────────────
// Super-admin only (Settings -> AI Configuration). Seeded onto newly created
// projects / KBs / agents; existing rows keep their own values.

export function usePlatformAssistantDefaults() {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchPlatformAssistantDefaults(),
    "platform-assistant-defaults",
  );

  const save = useCallback(
    async (data: Partial<Omit<PlatformAssistantDefaults, "id" | "updatedAt">>) => {
      const updated = await api.patchPlatformAssistantDefaults(data);
      refetch();
      return updated;
    },
    [refetch],
  );

  return { defaults: data, loading, error, save, refetch };
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects(orgId: string) {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchProjects(orgId),
    `projects:${orgId}`,
  );
  const projects = data ?? [];
  const create = useCallback(async (name: string, description?: string) => { const p = await api.createProject(orgId, name, description); refetch(); return p; }, [orgId, refetch]);
  const remove = useCallback(async (projectId: string) => { await api.deleteProject(projectId); refetch(); }, [refetch]);
  return { projects, loading, error, create, remove, refetch };
}

// ── Knowledge Bases ───────────────────────────────────────────────────────────

export function useKbs(projectId: string) {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchKbs(projectId),
    `kbs:${projectId}`,
  );
  const kbs = data ?? [];
  const create = useCallback(async (name: string, description?: string) => { const kb = await api.createKb(projectId, name, description); refetch(); return kb; }, [projectId, refetch]);
  const remove = useCallback(async (kbId: string) => { await api.deleteKb(kbId); refetch(); }, [refetch]);
  return { kbs, loading, error, create, remove, refetch };
}

export function useKb(kbId: string) {
  return useAsync(() => api.fetchKb(kbId), `kb:${kbId}`);
}

// ── Documents ─────────────────────────────────────────────────────────────────

export function useDocuments(kbId: string, pollIntervalMs = 4000) {
  const [docs, setDocs]     = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    api.fetchDocuments(kbId).then(setDocs).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [kbId]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => {
      setDocs((prev) => { const hasPending = prev.some((d) => d.status === "pending" || d.status === "processing"); if (hasPending) load(); return prev; });
    }, pollIntervalMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, pollIntervalMs]);

  const upload = useCallback(async (files: File[]) => { const r = await api.uploadDocuments(kbId, files); load(); return r; }, [kbId, load]);
  const remove = useCallback(async (docId: string) => { await api.deleteDocument(kbId, docId); setDocs((p) => p.filter((d) => d.id !== docId)); }, [kbId]);
  const reprocess = useCallback(async (docId: string) => { await api.reprocessDocument(kbId, docId); load(); }, [kbId, load]);

  return { docs, loading, error, upload, remove, reprocess, refetch: load };
}

// ── Config ────────────────────────────────────────────────────────────────────

export function useConfig(kbId: string) {
  const { data: config, loading, error, refetch } = useAsync(
    () => api.fetchConfig(kbId),
    `kb-config:${kbId}`,
  );
  const save = useCallback(async (data: Partial<Omit<AssistantConfig, "id" | "kbId" | "createdAt" | "updatedAt">>) => {
    const updated = await api.patchConfig(kbId, data); refetch(); return updated;
  }, [kbId, refetch]);
  return { config, loading, error, save, refetch };
}

export function useKBAIOverrides(kbId: string) {
  const { data: overrides, loading, error, refetch } = useAsync(
    () => api.fetchKBAIOverrides(kbId),
    `kb-ai-overrides:${kbId}`,
  );

  const save = useCallback(
    async (data: Partial<Omit<KBAIOverrides, "id" | "kbId" | "createdAt" | "updatedAt">>) => {
      const updated = await api.patchKBAIOverrides(kbId, data);
      refetch();
      return updated;
    },
    [kbId, refetch],
  );

  return { overrides, loading, error, save, refetch };
}

// ── Config Snapshots ──────────────────────────────────────────────────────────

export function useSnapshots(kbId: string) {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchSnapshots(kbId),
    `kb-snapshots:${kbId}`,
  );
  const snapshots = data ?? [];
  const saveSnapshot = useCallback(async (label?: string) => { const s = await api.createSnapshot(kbId, label); refetch(); return s; }, [kbId, refetch]);
  const restore = useCallback(async (snapshotId: string) => { const r = await api.restoreSnapshot(kbId, snapshotId); refetch(); return r; }, [kbId, refetch]);
  return { snapshots, loading, error, saveSnapshot, restore, refetch };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function useAnalytics(kbId: string) {
  return useAsync(() => api.fetchAnalytics(kbId), `kb-analytics:${kbId}`);
}

// ── Agents ────────────────────────────────────────────────────────────────────

export function useAgents(orgId?: string | null) {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchAgents(orgId ?? undefined),
    `agents:${orgId ?? "all"}`,
    { enabled: orgId !== undefined },
  );
  const agents = data ?? [];
  const create = useCallback(
    async (input: CreateAgentInput) => {
      const agent = await api.createAgent(input);
      refetch();
      return agent;
    },
    [refetch],
  );
  const remove = useCallback(
    async (agentId: string) => {
      await api.deleteAgent(agentId);
      refetch();
    },
    [refetch],
  );
  return { agents, loading, error, create, remove, refetch };
}

export function useAgent(agentId?: string | null) {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchAgent(agentId!),
    `agent:${agentId ?? "none"}`,
    { enabled: Boolean(agentId) },
  );
  const save = useCallback(
    async (input: UpdateAgentInput) => {
      const updated = await api.updateAgent(agentId!, input);
      refetch();
      return updated;
    },
    [agentId, refetch],
  );
  return { agent: data, loading, error, save, refetch };
}

export function useProjectAgent(projectId?: string | null) {
  const { data, loading, error, refetch } = useAsync(
    () => api.fetchProjectAgent(projectId!),
    `project-agent:${projectId ?? "none"}`,
    { enabled: Boolean(projectId) },
  );
  const assign = useCallback(
    async (agentId: string | null) => {
      await api.assignProjectAgent(projectId!, agentId);
      refetch();
    },
    [projectId, refetch],
  );
  return { agent: data, loading, error, assign, refetch };
}

// ── Scrape Wizard ─────────────────────────────────────────────────────────────
/**
 * Full state machine for the web-scrape wizard.
 *
 * Phases:
 *   idle                → user fills in URL form
 *   discovering         → POST /discover in flight (spinner)
 *   awaiting_confirmation → URL checklist shown (user include/exclude + Start)
 *   scraping            → polling /progress every 2 s (progress bar)
 *   completed           → success summary
 *   failed              → error with reset button
 */

type WizardPhase =
  | "idle"
  | "discovering"
  | "awaiting_confirmation"
  | "scraping"
  | "ingesting"
  | "completed"
  | "failed";

export type ScrapeWizardState = {
  phase:           WizardPhase;
  session:         ScrapeSession | null;
  progress:        ScrapeProgress | null;
  discoverProgress: DiscoverProgress | null;
  error:           string | null;
  canceling:       boolean;
  /** Optimistic local override map: urlId → included */
  localToggles:    Record<string, boolean>;
};

export function useScrapeWizard(kbId: string) {
  const [state, setState] = useState<ScrapeWizardState>({
    phase: "idle", session: null, progress: null, discoverProgress: null,
    error: null, canceling: false, localToggles: {},
  });

  const streamRef = useRef<EventSource | null>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const stopStreaming = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);
  useEffect(() => () => stopStreaming(), [stopStreaming]);

  const applyStreamSnapshot = useCallback(async (snapshot: ScrapeStreamSnapshot) => {
    const progress: ScrapeProgress = {
      sessionId: snapshot.sessionId,
      status: snapshot.status,
      totalUrls: snapshot.totalUrls,
      selectedUrls: snapshot.selectedUrls,
      scrapedUrls: snapshot.scrapedUrls,
      failedUrls: snapshot.failedUrls,
      pendingUrls: snapshot.pendingUrls,
      scrapingUrls: snapshot.scrapingUrls,
      ingestTotalDocs: snapshot.ingestTotalDocs,
      ingestPendingDocs: snapshot.ingestPendingDocs,
      ingestProcessingDocs: snapshot.ingestProcessingDocs,
      ingestReadyDocs: snapshot.ingestReadyDocs,
      ingestFailedDocs: snapshot.ingestFailedDocs,
      errorMessage: snapshot.errorMessage,
    };

    if (snapshot.status === "awaiting_confirmation") {
      stopStreaming();
      const full = await api.getScrapeSession(kbId, snapshot.sessionId);
      setState((s) => ({
        ...s,
        phase: "awaiting_confirmation",
        session: full,
        progress: null,
        discoverProgress: null,
        localToggles: {},
        error: null,
        canceling: snapshot.cancelRequested,
      }));
      return;
    }

    const mergedSession = (session: ScrapeSession | null): ScrapeSession | null => {
      if (!session || session.id !== snapshot.sessionId) return session;
      return {
        ...session,
        rootUrl: snapshot.rootUrl,
        status: snapshot.status,
        totalUrls: snapshot.totalUrls,
        selectedUrls: snapshot.selectedUrls,
        scrapedUrls: snapshot.scrapedUrls,
        failedUrls: snapshot.failedUrls,
        errorMessage: snapshot.errorMessage,
      };
    };

    if (snapshot.status === "discovering") {
      const discoverProgress: DiscoverProgress = {
        status: snapshot.status,
        jobProgress: snapshot.jobProgress,
        urlsFound: snapshot.urlsFound,
        elapsedMs: snapshot.elapsedMs,
      };
      setState((s) => ({
        ...s,
        phase: "discovering",
        session: mergedSession(s.session),
        discoverProgress,
        progress: null,
        error: null,
        canceling: snapshot.cancelRequested,
      }));
      return;
    }

    const phase: WizardPhase =
      snapshot.status === "scraping"  ? "scraping" :
      snapshot.status === "ingesting" ? "ingesting" :
      snapshot.status === "completed" ? "completed" : "failed";

    if (snapshot.status === "completed" || snapshot.status === "failed") {
      stopStreaming();
    }

    setState((s) => ({
      ...s,
      phase,
      session: mergedSession(s.session),
      progress,
      discoverProgress: null,
      error: snapshot.status === "failed" ? (snapshot.errorMessage ?? "Scrape failed") : null,
      canceling: snapshot.cancelRequested,
    }));
  }, [kbId, stopStreaming]);

  const resumeStreamingForSession = useCallback((sessionId: string) => {
    stopStreaming();
    const source = api.openScrapeProgressStream(kbId, sessionId);
    streamRef.current = source;

    source.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as ScrapeStreamSnapshot;
        void applyStreamSnapshot(snapshot);
      } catch {}
    };
  }, [applyStreamSnapshot, kbId, stopStreaming]);

  // ── Auto-resume on mount — pick up any in-flight session ─────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await api.getActiveSession(kbId);
        if (cancelled || !active) return;
        const phase: WizardPhase =
          active.status === "discovering"           ? "discovering" :
          active.status === "awaiting_confirmation" ? "awaiting_confirmation" :
          active.status === "scraping"              ? "scraping" :
          active.status === "ingesting"             ? "ingesting" : "idle";
        if (phase === "idle") return;

        setState((s) => ({
          ...s, phase, session: active,
          discoverProgress: null, canceling: false, localToggles: {},
        }));
        if (phase === "discovering" || phase === "scraping" || phase === "ingesting") {
          resumeStreamingForSession(active.id);
        }
      } catch { /* not critical */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);

  // ── Discover ──────────────────────────────────────────────────────────────
  const discover = useCallback(async (
    url: string,
    opts: { maxDepth?: number; maxUrls?: number; scopeToInputPath?: boolean } = {}
  ) => {
    setState((s) => ({ ...s, phase: "discovering", error: null, discoverProgress: null, canceling: false }));
    try {
      const session = await api.discoverScrapeUrls(kbId, url, opts);
      setState((s) => ({ ...s, session }));
      if (session.status === "awaiting_confirmation") {
        const full = await api.getScrapeSession(kbId, session.id);
        setState((s) => ({ ...s, phase: "awaiting_confirmation", session: full, localToggles: {} }));
        return;
      }
      if (session.status === "failed") throw new Error(session.errorMessage ?? "Discovery failed");
      resumeStreamingForSession(session.id);
    } catch (e) {
      stopStreaming();
      setState((s) => ({ ...s, phase: "failed", error: (e as Error).message, canceling: false }));
    }
  }, [kbId, resumeStreamingForSession, stopStreaming]);

  const cancelCurrent = useCallback(async () => {
    const sessionId = stateRef.current.session?.id;
    const phase = stateRef.current.phase;
    if (!sessionId || phase === "idle" || stateRef.current.canceling) return;

    setState((s) => ({ ...s, canceling: true, error: null }));

    try {
      const result = await api.cancelScrapeSession(kbId, sessionId);

      if (result.rolledBackTo === "idle") {
        stopStreaming();
        setState({
          phase: "idle",
          session: null,
          progress: null,
          discoverProgress: null,
          error: null,
          canceling: false,
          localToggles: {},
        });
        return;
      }

      if (result.session) {
        stopStreaming();
        setState((s) => ({
          ...s,
          phase: "awaiting_confirmation",
          session: result.session ?? null,
          progress: null,
          discoverProgress: null,
          error: null,
          canceling: false,
          localToggles: {},
        }));
        return;
      }

      if (!result.cancelling) {
        setState((s) => ({ ...s, canceling: false }));
      }
    } catch (e) {
      setState((s) => ({ ...s, canceling: false, error: (e as Error).message }));
    }
  }, [kbId, stopStreaming]);

  // ── Toggle a single URL (optimistic) ─────────────────────────────────────
  const toggleUrl = useCallback(async (urlId: string, included: boolean) => {
    setState((s) => ({ ...s, localToggles: { ...s.localToggles, [urlId]: included } }));
    try {
      await api.toggleScrapeUrl(kbId, urlId, included);
      if (stateRef.current.session) {
        const fresh = await api.getScrapeSession(kbId, stateRef.current.session.id);
        setState((s) => ({ ...s, session: fresh }));
      }
    } catch (e) {
      setState((s) => {
        const next = { ...s.localToggles };
        delete next[urlId];
        return { ...s, localToggles: next, error: (e as Error).message };
      });
    }
  }, [kbId]);

  // ── Select all / deselect all ─────────────────────────────────────────────
  const selectAll = useCallback(async (included: boolean) => {
    const sessionId = stateRef.current.session?.id;
    if (!sessionId) return;
    setState((s) => {
      const toggled: Record<string, boolean> = {};
      s.session?.urls?.forEach((u) => { toggled[u.id] = included; });
      return { ...s, localToggles: toggled };
    });
    try {
      await api.batchToggleScrapeUrls(kbId, { sessionId, selectAll: included });
      const fresh = await api.getScrapeSession(kbId, sessionId);
      setState((s) => ({ ...s, session: fresh, localToggles: {} }));
    } catch (e) {
      setState((s) => ({ ...s, localToggles: {}, error: (e as Error).message }));
    }
  }, [kbId]);

  // ── Start scraping ────────────────────────────────────────────────────────
  const startScrape = useCallback(async () => {
    const sessionId = stateRef.current.session?.id;
    if (!sessionId) return;
    setState((s) => ({ ...s, phase: "scraping", error: null, canceling: false }));
    try {
      await api.startScrapeSession(kbId, sessionId);
      resumeStreamingForSession(sessionId);
    } catch (e) {
      setState((s) => ({ ...s, phase: "failed", error: (e as Error).message, canceling: false }));
    }
  }, [kbId, resumeStreamingForSession]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopStreaming();
    setState({
      phase: "idle", session: null, progress: null, discoverProgress: null,
      error: null, canceling: false, localToggles: {},
    });
  }, [stopStreaming]);

  return { state, discover, toggleUrl, selectAll, startScrape, cancelCurrent, reset };
}
