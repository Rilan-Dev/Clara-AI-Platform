function queryString(params?: Record<string, string | number | undefined>) {
  if (!params) {
    return "";
  }

  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");

  if (!values.length) {
    return "";
  }

  return `?${new URLSearchParams(values.map(([key, value]) => [key, String(value)])).toString()}`;
}

const API_BASE = "/api";
const PROXY_BASE = `${API_BASE}/proxy`;

export const ENDPOINTS = {
  auth: {
    login: `${API_BASE}/auth/login`,
    logout: `${API_BASE}/auth/logout`,
    session: `${API_BASE}/auth`,
    me: `${PROXY_BASE}/auth/me`,
  },
  knowledgeBases: {
    listForOrg: (orgId: string) => `${PROXY_BASE}/kbs/all${queryString({ orgId })}`,
    documents: (kbId: string) => `${PROXY_BASE}/kbs/${kbId}/documents`,
    document: (kbId: string, documentId: string) => `${PROXY_BASE}/kbs/${kbId}/documents/${documentId}`,
    config: (kbId: string) => `${PROXY_BASE}/kbs/${kbId}/config`,
    analytics: (kbId: string, range = "30d") => `${PROXY_BASE}/kbs/${kbId}/analytics${queryString({ range })}`,
  },
  organisations: {
    subscription: (orgId: string) => `${PROXY_BASE}/orgs/subscription${queryString({ orgId })}`,
  },
  assistant: {
    chat: `${PROXY_BASE}/chat`,
    realtimeSession: `${PROXY_BASE}/realtime/session`,
  },
  external: {
    openAIRealtime: (model: string) => `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
  },
} as const;
