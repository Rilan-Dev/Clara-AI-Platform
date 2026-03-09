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
  ConfigSnapshot, KbAnalytics,
} from "./api";

export type { CurrentUser, Org, Project, KnowledgeBase, KbDocument, AssistantConfig, OrgMember, ConfigSnapshot, KbAnalytics };

// ── Generic async state helper ────────────────────────────────────────────────

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => setState({ data, loading: false, error: null }))
       .catch((e: Error) => setState({ data: null, loading: false, error: e.message }));
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { ...state, refetch: load };
}

// ── Auth hook ─────────────────────────────────────────────────────────────────

export function useAuth() {
  const [user, setUser]       = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const u = await api.login(email, password);
      setUser(u);
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
  }, []);

  return { user, loading, error, login, logout };
}

// ── Orgs ──────────────────────────────────────────────────────────────────────

export function useOrgs() {
  const { data, loading, error, refetch } = useAsync(api.fetchOrgs, []);
  const orgs = data ?? [];

  const create = useCallback(async (name: string) => {
    const org = await api.createOrg(name);
    refetch();
    return org;
  }, [refetch]);

  const remove = useCallback(async (orgId: string) => {
    await api.deleteOrg(orgId);
    refetch();
  }, [refetch]);

  return { orgs, loading, error, create, remove, refetch };
}

export function useOrg(orgId: string) {
  return useAsync(() => api.fetchOrg(orgId), [orgId]);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects(orgId: string) {
  const { data, loading, error, refetch } = useAsync(() => api.fetchProjects(orgId), [orgId]);
  const projects = data ?? [];

  const create = useCallback(async (name: string, description?: string) => {
    const proj = await api.createProject(orgId, name, description);
    refetch();
    return proj;
  }, [orgId, refetch]);

  const remove = useCallback(async (projectId: string) => {
    await api.deleteProject(projectId);
    refetch();
  }, [refetch]);

  return { projects, loading, error, create, remove, refetch };
}

// ── Knowledge Bases ───────────────────────────────────────────────────────────

export function useKbs(projectId: string) {
  const { data, loading, error, refetch } = useAsync(() => api.fetchKbs(projectId), [projectId]);
  const kbs = data ?? [];

  const create = useCallback(async (name: string, description?: string) => {
    const kb = await api.createKb(projectId, name, description);
    refetch();
    return kb;
  }, [projectId, refetch]);

  const remove = useCallback(async (kbId: string) => {
    await api.deleteKb(kbId);
    refetch();
  }, [refetch]);

  return { kbs, loading, error, create, remove, refetch };
}

export function useKb(kbId: string) {
  return useAsync(() => api.fetchKb(kbId), [kbId]);
}

// ── Documents ─────────────────────────────────────────────────────────────────

export function useDocuments(kbId: string, pollIntervalMs = 4000) {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    api.fetchDocuments(kbId)
      .then(setDocs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [kbId]);

  useEffect(() => {
    load();
    // Poll while any doc is pending/processing
    intervalRef.current = setInterval(() => {
      setDocs((prev) => {
        const hasPending = prev.some((d) => d.status === "pending" || d.status === "processing");
        if (hasPending) { load(); }
        return prev;
      });
    }, pollIntervalMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, pollIntervalMs]);

  const upload = useCallback(async (files: File[]) => {
    const result = await api.uploadDocuments(kbId, files);
    load();
    return result;
  }, [kbId, load]);

  const remove = useCallback(async (docId: string) => {
    await api.deleteDocument(kbId, docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  }, [kbId]);

  const reprocess = useCallback(async (docId: string) => {
    await api.reprocessDocument(kbId, docId);
    load();
  }, [kbId, load]);

  return { docs, loading, error, upload, remove, reprocess, refetch: load };
}

// ── Config ────────────────────────────────────────────────────────────────────

export function useConfig(kbId: string) {
  const { data: config, loading, error, refetch } = useAsync(() => api.fetchConfig(kbId), [kbId]);

  const save = useCallback(async (data: Partial<Omit<AssistantConfig, "id" | "kbId" | "createdAt" | "updatedAt">>) => {
    const updated = await api.patchConfig(kbId, data);
    refetch();
    return updated;
  }, [kbId, refetch]);

  return { config, loading, error, save, refetch };
}

// ── Config Snapshots ──────────────────────────────────────────────────────────

export function useSnapshots(kbId: string) {
  const { data, loading, error, refetch } = useAsync(() => api.fetchSnapshots(kbId), [kbId]);
  const snapshots = data ?? [];

  const saveSnapshot = useCallback(async (label?: string) => {
    const snap = await api.createSnapshot(kbId, label);
    refetch();
    return snap;
  }, [kbId, refetch]);

  const restore = useCallback(async (snapshotId: string) => {
    const result = await api.restoreSnapshot(kbId, snapshotId);
    refetch();
    return result;
  }, [kbId, refetch]);

  return { snapshots, loading, error, saveSnapshot, restore, refetch };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function useAnalytics(kbId: string) {
  return useAsync(() => api.fetchAnalytics(kbId), [kbId]);
}
