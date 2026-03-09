/**
 * lib/api.ts — Omen Insurance Portal API layer
 *
 * All data-fetching functions use the shared `http` Axios instance which:
 *   • routes through same-origin /api/proxy/* (server injects Bearer token)
 *   • normalises errors into ApiError
 *   • redirects to /login on 401
 *
 * NOTE: `streamChat` is intentionally kept on the native Fetch API.
 * Axios does not support ReadableStream in browser environments,
 * and the streaming endpoint requires line-by-line chunk processing.
 */

import http from "./http";
import { withAuthHeaders } from "./auth";

// ─── Domain types ─────────────────────────────────────────────────────────────

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
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantConfig = {
  id: string;
  kbId: string;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  defaultLanguage: string;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;
  primaryColour: string;
  accentColour: string;
  voiceId: string | null;
  speed: number;
};

export type Subscription = {
  id: string;
  org_id: string;
  plan_id: string;
  status: string;
  max_kbs: number;
  max_docs_per_kb: number;
  max_req_day: number;
  voice_enabled: boolean;
  api_access: boolean;
  features: string[];
};

export type OrgUsage = {
  kb_count: number;
  requests_today: number;
  storage_bytes: number;
};

export type AnalyticsData = {
  total: number;
  daily: { date: string; count: number }[];
  avg_latency: number | null;
  top_queries: { query: string; count: number }[];
};

export type ApiKey = {
  id: string;
  key_prefix: string;
  name: string;
  allowed_origins: string | null;
  rate_limit_per_hour: number;
  is_active: boolean;
  total_uses: number;
  created_at: string;
};

export type Me = {
  user: { id: string; email: string; full_name: string };
  org: { id: string; name: string; slug: string };
};

// ─── Knowledge Base endpoints ─────────────────────────────────────────────────

export async function getKbsForOrg(orgId: string): Promise<KnowledgeBase[]> {
  const { data } = await http.get<{ kbs: KnowledgeBase[] }>(
    `/kbs/all?orgId=${encodeURIComponent(orgId)}`
  );
  return data.kbs ?? [];
}

export async function getDocuments(kbId: string): Promise<Document[]> {
  const { data } = await http.get<Document[]>(`/kbs/${kbId}/documents`);
  return data ?? [];
}

export async function uploadDocument(
  kbId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<Document> {
  const fd = new FormData();
  fd.append("file", file);

  const { data } = await http.post<Document>(
    `/kbs/${kbId}/documents`,
    fd,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    }
  );
  return data;
}

export async function deleteDocument(kbId: string, docId: string): Promise<void> {
  await http.delete(`/kbs/${kbId}/documents/${docId}`);
}

// ─── Assistant config endpoints ───────────────────────────────────────────────

export async function getAssistantConfig(kbId: string): Promise<AssistantConfig> {
  const { data } = await http.get<AssistantConfig>(`/kbs/${kbId}/config`);
  return data;
}

export async function updateAssistantConfig(
  kbId: string,
  patch: Partial<AssistantConfig>
): Promise<AssistantConfig> {
  const { data } = await http.put<AssistantConfig>(`/kbs/${kbId}/config`, patch);
  return data;
}

// ─── Org / Subscription endpoints ────────────────────────────────────────────

export async function getOrgSubscription(
  orgId: string
): Promise<{ subscription: Subscription; usage: OrgUsage }> {
  const { data } = await http.get<{ subscription: Subscription; usage: OrgUsage }>(
    `/orgs/subscription?orgId=${encodeURIComponent(orgId)}`
  );
  return data;
}

// ─── Analytics endpoints ──────────────────────────────────────────────────────

export async function getAnalytics(
  kbId: string,
  range = "30d"
): Promise<AnalyticsData> {
  const { data } = await http.get<{
    totalQueries: number;
    queriesPerDay: { date: string; count: number }[];
    avgLatencyMs: number | null;
    topQueries: { queryText: string; count: number }[];
  }>(`/kbs/${kbId}/analytics?range=${range}`);

  return {
    total:       data.totalQueries ?? 0,
    daily:       data.queriesPerDay ?? [],
    avg_latency: data.avgLatencyMs ?? null,
    top_queries: (data.topQueries ?? []).map((q) => ({
      query: q.queryText,
      count: q.count,
    })),
  };
}

// ─── API Keys endpoints ───────────────────────────────────────────────────────

export async function getApiKeys(kbId: string): Promise<ApiKey[]> {
  const { data } = await http.get<{ keys: ApiKey[] }>(`/kbs/${kbId}/api-keys`);
  return data.keys ?? [];
}

// ─── Auth / session endpoints ─────────────────────────────────────────────────

export async function getMe(): Promise<Me> {
  const { data } = await http.get<Me>("/auth/me");
  return data;
}

// ─── Streaming chat ───────────────────────────────────────────────────────────
// NOTE: Intentionally uses native fetch — Axios cannot process
// ReadableStream chunks in browser environments.

export async function* streamChat(
  kbId: string,
  message: string,
  history: { role: string; content: string }[]
): AsyncGenerator<string> {
  const messages = [...history, { role: "user", content: message }];

  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: withAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ kbId, messages }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err.error ?? `Chat request failed (${res.status})`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed) as { type: string; payload?: string };
        if (evt.type === "token" && evt.payload) yield evt.payload;
        if (evt.type === "error") throw new Error(evt.payload ?? "Stream error");
      } catch {
        // ignore malformed lines
      }
    }
  }
}
