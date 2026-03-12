/**
 * src/modules/admin-ui/api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed API client for the Admin UI.
 * All calls use relative URLs and rely on the HttpOnly session cookie set by
 * POST /api/auth/login (no need to manually pass tokens).
 */

import { clearStoredToken, setStoredToken, withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = withAuthHeaders(options.headers ?? {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(url), {
    headers,
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body?.error ?? `HTTP ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  status: string;
};

export async function fetchMe(): Promise<CurrentUser> {
  const data = await apiFetch<{ user: CurrentUser }>("/api/auth/me");
  return data.user;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const data = await apiFetch<{ user: CurrentUser; token?: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.token) setStoredToken(data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
  clearStoredToken();
}

// ── Orgs ──────────────────────────────────────────────────────────────────────

export type Org = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
};

export type AIProvider = "openai" | "gemini";
export type ProviderScopedList = Partial<Record<AIProvider, string[]>>;

export type OrgAISettings = {
  id: string;
  orgId: string;
  defaultProvider: AIProvider | null;
  allowedProviders: AIProvider[];
  allowedChatModels: ProviderScopedList;
  allowedEmbeddingModels: ProviderScopedList;
  allowedRealtimeModels: ProviderScopedList;
  allowedVoices: ProviderScopedList;
  defaultChatModel: string | null;
  defaultEmbeddingModel: string | null;
  defaultRealtimeModel: string | null;
  defaultTranscriptionModel: string | null;
  maxChatTokens: number | null;
  maxRealtimeTokens: number | null;
  maxTemperature: number | null;
  enablePublicEmbed: boolean;
  enableVoice: boolean;
  enableRealtime: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KBAIOverrides = {
  id: string;
  kbId: string;
  provider: AIProvider | null;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  disableVoice: boolean;
  disablePublicEmbed: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function fetchOrgs(): Promise<Org[]> { return apiFetch<Org[]>("/api/orgs"); }
export async function fetchOrg(orgId: string): Promise<Org> { return apiFetch<Org>(`/api/orgs/${orgId}`); }
export async function createOrg(name: string): Promise<Org> {
  return apiFetch<Org>("/api/orgs", { method: "POST", body: JSON.stringify({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) }) });
}
export async function updateOrg(orgId: string, name: string): Promise<Org> {
  return apiFetch<Org>(`/api/orgs/${orgId}`, { method: "PATCH", body: JSON.stringify({ name }) });
}
export async function deleteOrg(orgId: string): Promise<void> { await apiFetch(`/api/orgs/${orgId}`, { method: "DELETE" }); }
export async function fetchOrgAISettings(orgId: string): Promise<OrgAISettings> {
  return apiFetch<OrgAISettings>(`/api/orgs/${orgId}/ai-settings`);
}
export async function patchOrgAISettings(
  orgId: string,
  data: Partial<Omit<OrgAISettings, "id" | "orgId" | "createdAt" | "updatedAt">>,
): Promise<OrgAISettings> {
  return apiFetch<OrgAISettings>(`/api/orgs/${orgId}/ai-settings`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Org Members ───────────────────────────────────────────────────────────────

export type OrgMember = { id: string; userId: string; orgId: string; roleName: string; joinedAt: string };

export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> { return apiFetch<OrgMember[]>(`/api/orgs/${orgId}/members`); }
export async function inviteOrgMember(orgId: string, userId: string, role: string): Promise<OrgMember> {
  return apiFetch<OrgMember>(`/api/orgs/${orgId}/members`, { method: "POST", body: JSON.stringify({ userId, role }) });
}
export async function removeOrgMember(orgId: string, userId: string): Promise<void> { await apiFetch(`/api/orgs/${orgId}/members/${userId}`, { method: "DELETE" }); }

// ── Projects ──────────────────────────────────────────────────────────────────

export type Project = { id: string; orgId: string; name: string; description: string | null; createdAt: string };

export async function fetchProjects(orgId: string): Promise<Project[]> { return apiFetch<Project[]>(`/api/orgs/${orgId}/projects`); }
export async function fetchProject(projectId: string): Promise<Project> { return apiFetch<Project>(`/api/projects/${projectId}`); }
export async function createProject(orgId: string, name: string, description?: string): Promise<Project> {
  return apiFetch<Project>(`/api/orgs/${orgId}/projects`, { method: "POST", body: JSON.stringify({ name, description }) });
}
export async function updateProject(projectId: string, name: string, description?: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name, description }) });
}
export async function deleteProject(projectId: string): Promise<void> { await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" }); }

// ── Knowledge Bases ───────────────────────────────────────────────────────────

export type KnowledgeBase = {
  id: string; projectId: string; name: string; description: string | null;
  qdrantCollection: string; status: "active" | "archived"; createdAt: string; updatedAt: string;
};

export async function fetchKbs(projectId: string): Promise<KnowledgeBase[]> { return apiFetch<KnowledgeBase[]>(`/api/projects/${projectId}/kbs`); }
export async function fetchKb(kbId: string): Promise<KnowledgeBase> { return apiFetch<KnowledgeBase>(`/api/kbs/${kbId}`); }
export async function createKb(projectId: string, name: string, description?: string): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>(`/api/projects/${projectId}/kbs`, { method: "POST", body: JSON.stringify({ name, description }) });
}
export async function updateKb(kbId: string, data: Partial<Pick<KnowledgeBase, "name" | "description" | "status">>): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>(`/api/kbs/${kbId}`, { method: "PATCH", body: JSON.stringify(data) });
}
export async function deleteKb(kbId: string): Promise<void> { await apiFetch(`/api/kbs/${kbId}`, { method: "DELETE" }); }

// ── Documents ─────────────────────────────────────────────────────────────────

export type KbDocument = {
  id: string; kbId: string; title: string; originalFilename: string; mimeType: string | null;
  fileSize: number | null; chunkCount: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null; createdAt: string; updatedAt: string;
};

export type BulkReprocessResult = {
  total: number;
  queued: number;
  skipped: number;
  failed: number;
  details: Array<{
    documentId: string;
    title: string;
    status: "queued" | "skipped" | "failed";
    error?: string;
  }>;
};

export async function fetchDocuments(kbId: string): Promise<KbDocument[]> { return apiFetch<KbDocument[]>(`/api/kbs/${kbId}/documents`); }
export async function fetchDocument(kbId: string, docId: string): Promise<KbDocument> { return apiFetch<KbDocument>(`/api/kbs/${kbId}/documents/${docId}`); }
export async function uploadDocuments(kbId: string, files: File[]): Promise<{ queued: KbDocument[]; errors: { filename: string; error: string }[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const authHeaders = withAuthHeaders({});
  const headers: Record<string, string> = {};
  authHeaders.forEach((value, key) => { if (key.toLowerCase() !== "content-type") headers[key] = value; });
  const res = await fetch(apiUrl(`/api/kbs/${kbId}/documents`), { method: "POST", headers, body: form });
  if (!res.ok) { const body = await res.json().catch(() => ({})) as { error?: string }; throw new Error(body?.error ?? `Upload failed: HTTP ${res.status}`); }
  return res.json();
}
export async function deleteDocument(kbId: string, docId: string): Promise<void> { await apiFetch(`/api/kbs/${kbId}/documents/${docId}`, { method: "DELETE" }); }
export async function reprocessDocument(kbId: string, docId: string): Promise<void> { await apiFetch(`/api/kbs/${kbId}/documents/${docId}/reprocess`, { method: "POST" }); }
export async function reprocessAllDocuments(kbId: string): Promise<BulkReprocessResult> {
  return apiFetch<BulkReprocessResult>(`/api/kbs/${kbId}/documents/reprocess-all`, { method: "POST" });
}

// ── Assistant Config ──────────────────────────────────────────────────────────

export type AssistantConfig = {
  id: string; kbId: string; assistantName: string; avatarUrl: string | null;
  systemPrompt: string; welcomeMessage: string; outOfScopeReply: string; rules: string[];
  defaultLanguage: string; allowedLanguages: string[]; alwaysRespondIn: string | null;
  voiceId: string; speed: number; temperature: number; maxTokens: number;
  citeSources: boolean; strictMode: boolean; primaryColour: string; accentColour: string;
  createdAt: string; updatedAt: string;
};

export async function fetchConfig(kbId: string): Promise<AssistantConfig> { return apiFetch<AssistantConfig>(`/api/kbs/${kbId}/config`); }
export async function patchConfig(kbId: string, data: Partial<Omit<AssistantConfig, "id" | "kbId" | "createdAt" | "updatedAt">>): Promise<AssistantConfig> {
  return apiFetch<AssistantConfig>(`/api/kbs/${kbId}/config`, { method: "PATCH", body: JSON.stringify(data) });
}
export async function fetchKBAIOverrides(kbId: string): Promise<KBAIOverrides | null> {
  return apiFetch<KBAIOverrides | null>(`/api/kbs/${kbId}/ai-overrides`);
}
export async function patchKBAIOverrides(
  kbId: string,
  data: Partial<Omit<KBAIOverrides, "id" | "kbId" | "createdAt" | "updatedAt">>,
): Promise<KBAIOverrides> {
  return apiFetch<KBAIOverrides>(`/api/kbs/${kbId}/ai-overrides`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Config Snapshots ──────────────────────────────────────────────────────────

export type ConfigSnapshot = { id: string; kbId: string; label: string | null; snapshot: AssistantConfig; createdBy: string | null; createdAt: string };

export async function fetchSnapshots(kbId: string): Promise<ConfigSnapshot[]> { return apiFetch<ConfigSnapshot[]>(`/api/kbs/${kbId}/config/snapshots`); }
export async function createSnapshot(kbId: string, label?: string): Promise<ConfigSnapshot> {
  return apiFetch<ConfigSnapshot>(`/api/kbs/${kbId}/config/snapshots`, { method: "POST", body: JSON.stringify({ label }) });
}
export async function restoreSnapshot(kbId: string, snapshotId: string): Promise<{ restored: boolean; config: AssistantConfig }> {
  return apiFetch(`/api/kbs/${kbId}/config/snapshots/${snapshotId}/restore`, { method: "POST", body: "{}" });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export type KbAnalytics = {
  totalQueries: number; queriesThisWeek: number;
  queriesPerDay: { date: string; count: number }[];
  topQueries: { queryText: string; count: number }[];
  avgLatencyMs: number | null; avgSourceCount: number | null;
};

export async function fetchAnalytics(kbId: string): Promise<KbAnalytics> { return apiFetch<KbAnalytics>(`/api/kbs/${kbId}/analytics`); }

// ── Web Scrape Sessions ───────────────────────────────────────────────────────

export type ScrapeSessionStatus =
  "discovering" | "awaiting_confirmation" | "scraping" | "completed" | "failed";

export type ScrapeUrlStatus = "pending" | "scraping" | "completed" | "failed" | "excluded";

export type ScrapeUrl = {
  id: string; sessionId: string; url: string; title: string;
  depth: number; parentUrl: string | null; included: boolean;
  status: ScrapeUrlStatus; documentId: string | null;
  contentLength: number; errorMessage: string | null; createdAt: string;
};

export type ScrapeSession = {
  id: string; kbId: string; rootUrl: string; status: ScrapeSessionStatus;
  maxDepth: number; totalUrls: number; selectedUrls: number;
  scrapedUrls: number; failedUrls: number; errorMessage: string | null;
  createdBy: string | null; createdAt: string; updatedAt: string;
  urls?: ScrapeUrl[];
};

export type ScrapeProgress = {
  sessionId: string; status: ScrapeSessionStatus;
  totalUrls: number; selectedUrls: number; scrapedUrls: number;
  failedUrls: number; pendingUrls: number; scrapingUrls: number;
  errorMessage: string | null;
};

export async function discoverScrapeUrls(
  kbId: string, url: string,
  opts: { maxDepth?: number; maxUrls?: number; scopeToInputPath?: boolean }
): Promise<ScrapeSession> {
  return apiFetch<ScrapeSession>(`/api/kbs/${kbId}/scrape/discover`, {
    method: "POST", body: JSON.stringify({ url, ...opts }),
  });
}

export async function listScrapeSessions(kbId: string): Promise<ScrapeSession[]> {
  return apiFetch<ScrapeSession[]>(`/api/kbs/${kbId}/scrape/sessions`);
}

export async function getScrapeSession(kbId: string, sessionId: string): Promise<ScrapeSession> {
  return apiFetch<ScrapeSession>(`/api/kbs/${kbId}/scrape/sessions/${sessionId}`);
}

export async function toggleScrapeUrl(kbId: string, urlId: string, included: boolean): Promise<ScrapeUrl> {
  return apiFetch<ScrapeUrl>(`/api/kbs/${kbId}/scrape/urls/${urlId}`, {
    method: "PATCH", body: JSON.stringify({ included }),
  });
}

export async function batchToggleScrapeUrls(
  kbId: string,
  payload: { urlIds: string[]; included: boolean } | { sessionId: string; selectAll: boolean }
): Promise<{ updated: boolean; updatedCount?: number }> {
  return apiFetch(`/api/kbs/${kbId}/scrape/urls/batch`, {
    method: "PATCH", body: JSON.stringify(payload),
  });
}

export async function startScrapeSession(kbId: string, sessionId: string): Promise<{ started: boolean }> {
  return apiFetch(`/api/kbs/${kbId}/scrape/sessions/${sessionId}/start`, { method: "POST", body: "{}" });
}

export async function getScrapeProgress(kbId: string, sessionId: string): Promise<ScrapeProgress> {
  return apiFetch<ScrapeProgress>(`/api/kbs/${kbId}/scrape/sessions/${sessionId}/progress`);
}
