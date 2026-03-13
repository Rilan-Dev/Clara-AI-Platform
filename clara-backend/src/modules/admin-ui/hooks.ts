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
  OrgAISettings, KBAIOverrides,
} from "./api";

export type {
  CurrentUser, Org, Project, KnowledgeBase, KbDocument, AssistantConfig, OrgMember,
  ConfigSnapshot, KbAnalytics, ScrapeSession, ScrapeUrl, ScrapeProgress, ScrapeSessionStatus,
  OrgAISettings, KBAIOverrides,
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
  const [user, setUser]       = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.fetchMe().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null);
    try { const u = await api.login(email, password); setUser(u); }
    catch (e) { setError((e as Error).message); throw e; }
    finally { setLoading(false); }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return { user, loading, error, login, logout };
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

export function useProject(projectId?: string | null) {
  return useAsync(() => api.fetchProject(projectId!), `project:${projectId ?? "none"}`, {
    enabled: Boolean(projectId),
  });
}

export function useOrgAISettings(orgId: string) {
  const { data: settings, loading, error, refetch } = useAsync(
    () => api.fetchOrgAISettings(orgId),
    `org-ai-settings:${orgId}`,
  );

  const save = useCallback(
    async (data: Partial<Omit<OrgAISettings, "id" | "orgId" | "createdAt" | "updatedAt">>) => {
      const updated = await api.patchOrgAISettings(orgId, data);
      refetch();
      return updated;
    },
    [orgId, refetch],
  );

  return { settings, loading, error, save, refetch };
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
  | "completed"
  | "failed";

export type ScrapeWizardState = {
  phase:    WizardPhase;
  session:  ScrapeSession | null;
  progress: ScrapeProgress | null;
  error:    string | null;
  /** Optimistic local override map: urlId → included */
  localToggles: Record<string, boolean>;
};

export function useScrapeWizard(kbId: string) {
  const [state, setState] = useState<ScrapeWizardState>({
    phase: "idle", session: null, progress: null, error: null, localToggles: {},
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stop polling helper ─────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Discover ────────────────────────────────────────────────────────────────
  // POST /discover returns 202 immediately (session status='discovering').
  // BullMQ worker runs crawlWebsite() in background. We poll every 2s until
  // status transitions to 'awaiting_confirmation' (or 'failed').
  const discover = useCallback(async (
    url: string,
    opts: { maxDepth?: number; maxUrls?: number; scopeToInputPath?: boolean } = {}
  ) => {
    setState((s) => ({ ...s, phase: "discovering", error: null }));
    let discoveryPoll: ReturnType<typeof setInterval> | null = null;
    try {
      const session = await api.discoverScrapeUrls(kbId, url, opts);
      setState((s) => ({ ...s, session }));

      // Fast-path: already completed (safety valve)
      if (session.status === "awaiting_confirmation") {
        setState((s) => ({ ...s, phase: "awaiting_confirmation", localToggles: {} }));
        return;
      }
      if (session.status === "failed") {
        throw new Error(session.errorMessage ?? "Discovery failed");
      }

      // Poll until BullMQ worker finishes the crawl
      await new Promise<void>((resolve, reject) => {
        discoveryPoll = setInterval(async () => {
          try {
            const fresh = await api.getScrapeSession(kbId, session.id);
            setState((s) => ({ ...s, session: fresh }));
            if (fresh.status === "awaiting_confirmation") {
              clearInterval(discoveryPoll!);
              discoveryPoll = null;
              setState((s) => ({ ...s, phase: "awaiting_confirmation", localToggles: {} }));
              resolve();
            } else if (fresh.status === "failed") {
              clearInterval(discoveryPoll!);
              discoveryPoll = null;
              reject(new Error(fresh.errorMessage ?? "Discovery failed"));
            }
          } catch { /* keep polling on transient errors */ }
        }, 2_000);
      });
    } catch (e) {
      if (discoveryPoll) { clearInterval(discoveryPoll); discoveryPoll = null; }
      setState((s) => ({ ...s, phase: "failed", error: (e as Error).message }));
    }
  }, [kbId]);

  // ── Toggle a single URL (optimistic) ────────────────────────────────────────
  const toggleUrl = useCallback(async (urlId: string, included: boolean) => {
    // Apply optimistic update immediately
    setState((s) => ({
      ...s,
      localToggles: { ...s.localToggles, [urlId]: included },
    }));
    try {
      await api.toggleScrapeUrl(kbId, urlId, included);
      // Refresh session to sync server counts
      if (state.session) {
        const fresh = await api.getScrapeSession(kbId, state.session.id);
        setState((s) => ({ ...s, session: fresh }));
      }
    } catch (e) {
      // Roll back optimistic update on failure
      setState((s) => {
        const next = { ...s.localToggles };
        delete next[urlId];
        return { ...s, localToggles: next, error: (e as Error).message };
      });
    }
  }, [kbId, state.session]);

  // ── Select all / deselect all ────────────────────────────────────────────────
  const selectAll = useCallback(async (included: boolean) => {
    if (!state.session) return;
    const sessionId = state.session.id;
    // Optimistic: mark all URLs in local state
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
  }, [kbId, state.session]);

  // ── Start scraping ───────────────────────────────────────────────────────────
  const startScrape = useCallback(async () => {
    if (!state.session) return;
    const sessionId = state.session.id;
    setState((s) => ({ ...s, phase: "scraping", error: null }));
    try {
      await api.startScrapeSession(kbId, sessionId);
      // Begin polling
      const poll = async () => {
        try {
          const progress = await api.getScrapeProgress(kbId, sessionId);
          setState((s) => ({ ...s, progress }));
          if (progress.status === "completed" || progress.status === "failed") {
            stopPolling();
            setState((s) => ({
              ...s,
              phase: progress.status === "completed" ? "completed" : "failed",
              error: progress.status === "failed" ? (progress.errorMessage ?? "Scrape failed") : null,
            }));
          }
        } catch { /* keep polling */ }
      };
      poll(); // immediate first tick
      pollRef.current = setInterval(poll, 2000);
    } catch (e) {
      setState((s) => ({ ...s, phase: "failed", error: (e as Error).message }));
    }
  }, [kbId, state.session, stopPolling]);

  // ── Reset wizard ─────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopPolling();
    setState({ phase: "idle", session: null, progress: null, error: null, localToggles: {} });
  }, [stopPolling]);

  return { state, discover, toggleUrl, selectAll, startScrape, reset };
}
