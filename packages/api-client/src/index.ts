// ─────────────────────────────────────────────────────────────────────────────
// @clara/api-client — HTTP client for calling Clara-AI-RAG backend
// ─────────────────────────────────────────────────────────────────────────────
import type {
  KbWithStats,
  KbAnalytics,
  Document,
  AssistantConfig,
  ApiKey,
  OrgWithSubscription,
  PlanId,
} from "@clara/types";

export class ClaraApiClient {
  private baseUrl: string;
  private orgId: string;
  private headers: Record<string, string>;

  constructor(opts: { baseUrl: string; orgId: string; adminToken?: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.orgId = opts.orgId;
    this.headers = {
      "Content-Type": "application/json",
      ...(opts.adminToken ? { Authorization: `Bearer ${opts.adminToken}` } : {}),
    };
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.headers, ...(options?.headers ?? {}) },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "Unknown error");
      throw new Error(`Clara API ${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Organisation ──────────────────────────────────────────────────────────

  async getOrg(): Promise<OrgWithSubscription> {
    return this.request(`/api/orgs/${this.orgId}`);
  }

  // ── Knowledge Bases ───────────────────────────────────────────────────────

  async listKbs(): Promise<{ kbs: KbWithStats[] }> {
    return this.request(`/api/kbs/all?orgId=${this.orgId}`);
  }

  async getKb(kbId: string): Promise<KbWithStats> {
    return this.request(`/api/kbs/${kbId}`);
  }

  async createKb(data: { name: string; description?: string; projectId: string }) {
    return this.request(`/api/kbs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async listDocuments(kbId: string): Promise<{ documents: Document[] }> {
    return this.request(`/api/kbs/${kbId}/documents`);
  }

  async uploadDocument(kbId: string, file: File, title?: string) {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    const res = await fetch(`${this.baseUrl}/api/kbs/${kbId}/documents/upload`, {
      method: "POST",
      headers: { Authorization: this.headers.Authorization ?? "" },
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  }

  async deleteDocument(kbId: string, docId: string) {
    return this.request(`/api/kbs/${kbId}/documents/${docId}`, {
      method: "DELETE",
    });
  }

  // ── Assistant Config ──────────────────────────────────────────────────────

  async getAssistantConfig(kbId: string): Promise<AssistantConfig> {
    return this.request(`/api/kbs/${kbId}/assistant-config`);
  }

  async updateAssistantConfig(kbId: string, data: Partial<AssistantConfig>) {
    return this.request(`/api/kbs/${kbId}/assistant-config`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  async listApiKeys(kbId: string): Promise<{ keys: ApiKey[] }> {
    return this.request(`/api/kbs/${kbId}/api-keys`);
  }

  async createApiKey(kbId: string, data: {
    name: string;
    allowedOrigins?: string[];
    rateLimitPerHour?: number;
  }): Promise<{ key: ApiKey; rawKey: string }> {
    return this.request(`/api/kbs/${kbId}/api-keys`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokeApiKey(kbId: string, keyId: string) {
    return this.request(`/api/kbs/${kbId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getKbAnalytics(kbId: string): Promise<KbAnalytics> {
    return this.request(`/api/kbs/${kbId}/analytics`);
  }

  // ── Chat (streaming) ──────────────────────────────────────────────────────

  streamChat(opts: {
    kbId: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    sessionId?: string;
    onToken: (token: string) => void;
    onSources: (sources: unknown[]) => void;
    onDone: () => void;
    onError: (err: string) => void;
  }): AbortController {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({
            kbId: opts.kbId,
            messages: opts.messages,
            sessionId: opts.sessionId,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Chat ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as { type: string; payload: unknown };
              if (ev.type === "token") opts.onToken(ev.payload as string);
              if (ev.type === "sources") opts.onSources(ev.payload as unknown[]);
              if (ev.type === "done") opts.onDone();
              if (ev.type === "error") opts.onError(ev.payload as string);
            } catch {}
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") opts.onError((e as Error).message);
      }
    })();
    return ctrl;
  }
}

// Singleton factory for use in Next.js server components / route handlers
export function createClaraClient(orgId: string): ClaraApiClient {
  return new ClaraApiClient({
    baseUrl: process.env.CLARA_BACKEND_URL ?? "http://localhost:3010",
    orgId,
    adminToken: process.env.CLARA_ADMIN_TOKEN,
  });
}
