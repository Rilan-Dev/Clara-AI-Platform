const BACKEND = process.env.CLARA_BACKEND_URL || "http://localhost:3010";

export type KnowledgeBase = {
  id: string; name: string; description: string | null;
  qdrant_collection: string; status: string;
  created_at: string; updated_at: string;
  project_id: string; org_id: string; org_name: string; project_name: string;
  doc_count: number; ready_count: number; pending_count: number; total_chunks: number;
};

export type Document = {
  id: string; kb_id: string; title: string; file_name: string;
  file_size: number; file_type: string; status: string;
  error_message: string | null; chunk_count: number;
  created_at: string; updated_at: string;
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
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── exports ──────────────────────────────────────────────────────────────────

export async function getKbsForOrg(orgId: string): Promise<KnowledgeBase[]> {
  const data = await api<{ kbs: KnowledgeBase[] }>(`/api/kbs/all?orgId=${orgId}`);
  return data.kbs;
}

export async function getDocuments(kbId: string): Promise<Document[]> {
  const data = await api<{ documents: Document[] }>(`/api/kbs/${kbId}/documents`);
  return data.documents ?? [];
}

export async function getAssistantConfig(kbId: string): Promise<AssistantConfig> {
  return api<AssistantConfig>(`/api/kbs/${kbId}/config`);
}

export async function getOrgSubscription(orgId: string): Promise<{ subscription: Subscription; usage: OrgUsage }> {
  return api(`/api/orgs/subscription?orgId=${orgId}`);
}

export async function getAnalytics(kbId: string, range = "30d") {
  return api<{ daily: AnalyticsPoint[]; total: number; avg_latency: number; top_queries: { query: string; count: number }[] }>(
    `/api/kbs/${kbId}/analytics?range=${range}`
  );
}

export async function getApiKeys(kbId: string): Promise<ApiKey[]> {
  const data = await api<{ keys: ApiKey[] }>(`/api/kbs/${kbId}/api-keys`);
  return data.keys ?? [];
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: { id: string; email: string; full_name: string } }> {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return api<{ user: { id: string; email: string; full_name: string }; org: { id: string; name: string; slug: string } }>("/api/auth/me");
}

/** Stream chat — returns an async generator of text chunks */
export async function* streamChat(kbId: string, message: string, history: { role: string; content: string }[]) {
  const res = await fetch(`${BACKEND}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kbId, message, history }),
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
        if (evt.type === "text" && evt.payload) yield evt.payload as string;
        if (evt.type === "error") throw new Error(evt.payload);
      } catch {
        // ignore malformed lines
      }
    }
  }
}
