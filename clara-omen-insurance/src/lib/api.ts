/**
 * lib/api.ts
 *
 * All backend calls route through /api/proxy/* (same-origin).
 * The proxy route (app/api/proxy/[...path]/route.ts) reads the
 * httpOnly clara_token cookie server-side and forwards it as
 * Authorization: Bearer to clara-backend.
 */

// Same-origin proxy prefix — works on both client and server
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

export type AssistantConfig = {
  id: string; kb_id: string; assistant_name: string; avatar_url: string | null;
  system_prompt: string; voice_id: string | null; voice_enabled: boolean;
  primary_colour: string; secondary_colour: string; welcome_message: string;
  temperature: number; max_tokens: number;
};

export type Subscription = {
  id: string; org_id: string; plan_id: string; status: string;
  max_kbs: number; max_docs_per_kb: number; max_req_day: number;
  voice_enabled: boolean; api_access: boolean; features: string[];
};

export type OrgUsage = {
  kb_count: number; requests_today: number; storage_bytes: number;
};

export type AnalyticsPoint = { date: string; count: number };

export type ApiKey = {
  id: string; key_prefix: string; name: string;
  allowed_origins: string | null; rate_limit_per_hour: number;
  is_active: boolean; total_uses: number; created_at: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    // Only logout if it's a session/auth error, not a permission error
    const isSessionError = 
      data.error === "Session expired or invalid" || 
      data.error === "Authentication required" ||
      data.error === "token not valid" || // Added per user report
      data.message?.toLowerCase().includes("auth token") ||
      data.message?.toLowerCase().includes("session");

    if (isSessionError && typeof window !== "undefined") {
      // Clear the httpOnly cookie via the logout endpoint before redirecting
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      window.location.href = "/login";
    }
    throw new Error(data.error ?? "Session expired");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── exports ──────────────────────────────────────────────────────────────────

export async function getKbsForOrg(orgId: string): Promise<KnowledgeBase[]> {
  const data = await api<{ kbs: KnowledgeBase[] }>(`/kbs/all?orgId=${orgId}`);
  return data.kbs;
}

export async function getDocuments(kbId: string): Promise<Document[]> {
  const data = await api<Document[]>(`/kbs/${kbId}/documents`);
  return data ?? [];
}

export async function getAssistantConfig(kbId: string): Promise<AssistantConfig> {
  return api<AssistantConfig>(`/kbs/${kbId}/config`);
}

export async function getOrgSubscription(orgId: string): Promise<{ subscription: Subscription; usage: OrgUsage }> {
  return api(`/orgs/subscription?orgId=${orgId}`);
}

export type AnalyticsData = {
  total: number;
  daily: AnalyticsPoint[];
  avg_latency: number | null;
  top_queries: { query: string; count: number }[];
};

export async function getAnalytics(kbId: string, range = "30d"): Promise<AnalyticsData> {
  const raw = await api<{
    totalQueries: number;
    queriesPerDay: AnalyticsPoint[];
    avgLatencyMs: number | null;
    topQueries: { queryText: string; count: number }[];
  }>(`/kbs/${kbId}/analytics?range=${range}`);

  // Normalise API response field names → frontend field names
  return {
    total:       raw.totalQueries ?? 0,
    daily:       raw.queriesPerDay ?? [],
    avg_latency: raw.avgLatencyMs ?? null,
    top_queries: (raw.topQueries ?? []).map(q => ({ query: q.queryText, count: q.count })),
  };
}

export async function getApiKeys(kbId: string): Promise<ApiKey[]> {
  const data = await api<{ keys: ApiKey[] }>(`/kbs/${kbId}/api-keys`);
  return data.keys ?? [];
}

export async function getMe() {
  return api<{ user: { id: string; email: string; full_name: string }; org: { id: string; name: string; slug: string } }>("/auth/me");
}

/** Stream chat — returns an async generator of text chunks */
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
