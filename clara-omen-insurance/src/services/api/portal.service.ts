import type { AxiosProgressEvent } from "axios";
import { streamJsonLineEvents } from "@clara/api-client";
import { ENDPOINTS } from "@/services/api/endpoints";
import http from "@/services/api/http.client";
import type {
  AnalyticsData,
  AssistantConfig,
  DocumentRecord,
  KnowledgeBase,
  OrgUsage,
  Subscription,
} from "@/services/api/portal.types";

export const portalService = {
  async getKnowledgeBases(orgId: string) {
    const { data } = await http.get<{ kbs: KnowledgeBase[] }>(ENDPOINTS.knowledgeBases.listForOrg(orgId));
    return data.kbs ?? [];
  },

  async getDocuments(kbId: string) {
    const { data } = await http.get<DocumentRecord[]>(ENDPOINTS.knowledgeBases.documents(kbId));
    return data ?? [];
  },

  async uploadDocument(kbId: string, file: File, onProgress?: (percent: number) => void) {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await http.post<DocumentRecord>(ENDPOINTS.knowledgeBases.documents(kbId), formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });

    return data;
  },

  async getSubscription(orgId: string) {
    const { data } = await http.get<{ subscription: Subscription; usage: OrgUsage }>(ENDPOINTS.organisations.subscription(orgId));
    return data;
  },

  async getAnalytics(kbId: string, range = "30d") {
    const { data } = await http.get<{
      totalQueries: number;
      queriesPerDay: { date: string; count: number }[];
      avgLatencyMs: number | null;
      topQueries: { queryText: string; count: number }[];
    }>(ENDPOINTS.knowledgeBases.analytics(kbId, range));

    const analytics: AnalyticsData = {
      total: data.totalQueries ?? 0,
      daily: data.queriesPerDay ?? [],
      avg_latency: data.avgLatencyMs ?? null,
      top_queries: (data.topQueries ?? []).map((query: { queryText: string; count: number }) => ({
        query: query.queryText,
        count: query.count,
      })),
    };

    return analytics;
  },

  async getAssistantConfig(kbId: string) {
    const { data } = await http.get<AssistantConfig>(ENDPOINTS.knowledgeBases.config(kbId));
    return data;
  },

  async updateAssistantConfig(kbId: string, payload: Partial<AssistantConfig>) {
    const { data } = await http.patch<AssistantConfig>(ENDPOINTS.knowledgeBases.config(kbId), payload);
    return data;
  },

  async *streamChat(kbId: string, message: string, history: { role: string; content: string }[]) {
    const response = await fetch(ENDPOINTS.assistant.chat, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ kbId, messages: [...history, { role: "user", content: message }] }),
    });

    if (!response.ok || !response.body) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error ?? `Chat request failed (${response.status})`);
    }

    for await (const event of streamJsonLineEvents(response)) {
      if (event.type === "token" && event.payload) {
        yield event.payload;
      }
      if (event.type === "error") {
        throw new Error(event.payload ?? "Stream error");
      }
    }
  },
};
