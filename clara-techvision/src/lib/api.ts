/**
 * lib/api.ts
 *
 * All backend calls route through /api/proxy/* (same-origin).
 * The proxy route reads the httpOnly clara_token cookie server-side
 * and forwards it as Authorization: Bearer to clara-backend.
 */

const PROXY = "/api/proxy";

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  qdrantCollection: string;
  project: { id: string; name: string };
  org: { id: string; name: string };
  assistant: {
    name: string;
    avatarUrl: string | null;
    welcomeMessage: string;
    primaryColour: string;
    accentColour: string;
  };
  docCount: number;
  readyCount: number;
};

export type Document = {
  id: string;
  kbId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  fileSize: number;
  chunkCount: number;
  status: string;
  errorMessage: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string; org_id: string; plan_id: string; status: string;
  max_kbs: number; max_docs_per_kb: number; max_req_day: number;
  voice_enabled: boolean; api_access: boolean; features: string[];
};

export type OrgUsage = {
  kb_count: number; requests_today: number; storage_bytes: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    // Session expired
    if (typeof window !== "undefined") {
      // Clear the httpOnly cookie via the logout endpoint before redirecting
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getKbsForOrg(orgId: string): Promise<KnowledgeBase[]> {
  const d = await api<{ kbs: KnowledgeBase[] }>(`/kbs/all?orgId=${orgId}`);
  return d.kbs;
}

export async function getDocuments(kbId: string): Promise<Document[]> {
  const d = await api<Document[]>(`/kbs/${kbId}/documents`);
  return d ?? [];
}

export async function getOrgSubscription(orgId: string): Promise<{ subscription: Subscription; usage: OrgUsage }> {
  return api(`/orgs/subscription?orgId=${orgId}`);
}

export type AnalyticsData = {
  total: number;
  daily: { date: string; count: number }[];
  avg_latency: number | null;
  top_queries: { query: string; count: number }[];
};

export async function getAnalytics(kbId: string, range = "30d"): Promise<AnalyticsData> {
  const raw = await api<{
    totalQueries: number;
    queriesPerDay: { date: string; count: number }[];
    avgLatencyMs: number | null;
    topQueries: { queryText: string; count: number }[];
  }>(`/kbs/${kbId}/analytics?range=${range}`);

  return {
    total:       raw.totalQueries ?? 0,
    daily:       raw.queriesPerDay ?? [],
    avg_latency: raw.avgLatencyMs ?? null,
    top_queries: (raw.topQueries ?? []).map(q => ({ query: q.queryText, count: q.count })),
  };
}

export async function* streamChat(kbId: string, message: string, history: { role: string; content: string }[]) {
  // Backend expects a `messages` array: history + current user message
  const messages = [
    ...history,
    { role: "user", content: message },
  ];

  const res = await fetch(`${PROXY}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kbId, messages }),
  });
  if (!res.ok || !res.body) throw new Error("Chat request failed");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      try {
        const evt = JSON.parse(l);
        if (evt.type === "token" && evt.payload) yield evt.payload as string;
        if (evt.type === "error") throw new Error(evt.payload);
      } catch {
        // ignore malformed lines
      }
    }
  }
}
