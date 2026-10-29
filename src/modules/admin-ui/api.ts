/** Typed API client for the Admin UI. */
import {
  clearStoredToken,
  setStoredToken,
  withAuthHeaders,
} from "@/lib/client-auth";
import { apiUrl, fetchJsonShared } from "@/lib/runtime";
import type { FaqItem } from "@/modules/knowledge-bases/core/models";

export type { FaqItem };
async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = withAuthHeaders(options.headers ?? {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  // fetchJsonShared merges concurrent identical GETs into one round trip and
  // drops pending GET entries whenever a mutating request is issued.
  const { ok, status, statusText, body } = await fetchJsonShared(apiUrl(url), {
    ...options,
    headers,
  });
  if (!ok) {
    const b = (body ?? {}) as { error?: string };
    throw new Error(b?.error ?? `HTTP ${status} ${statusText}`);
  }
  return body as T;
}
export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  status: string;
};
export async function fetchMe(): Promise<CurrentUser> {
  return (await apiFetch<{ user: CurrentUser }>("/api/auth/me")).user;
}
export async function login(
  email: string,
  password: string,
): Promise<CurrentUser> {
  const d = await apiFetch<{ user: CurrentUser; token?: string }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
  if (d.token) setStoredToken(d.token);
  return d.user;
}
export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
  clearStoredToken();
}
export type Org = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt?: string;
  agentCount?: number;
  knowledgeBaseCount?: number;
  roleName?: "org_admin" | "project_manager" | "kb_editor" | "kb_viewer";
};
export type AIProvider = "openai" | "gemini" | "sarvam";
export type VoiceProvider = "openai" | "gemini" | "elevenlabs" | "sarvam";
export type ProviderScopedList = Partial<Record<AIProvider, string[]>>;
export type OrgAISettings = {
  id: string;
  orgId: string;
  defaultProvider: AIProvider | null;
  allowedProviders: AIProvider[];
  /** Voice-provider axis (ElevenLabs): NULL = inherit brain provider. */
  voiceProvider: VoiceProvider | null;
  allowedVoiceProviders: VoiceProvider[];
  /** Realtime voice-assistant purpose: NULL = inherit the voice-chat provider. */
  realtimeVoiceProvider: VoiceProvider | null;
  elevenlabsTtsModel: string | null;
  elevenlabsSttModel: string | null;
  defaultElevenlabsVoice: string | null;
  /** Sarvam voice defaults (migration 036). */
  sarvamTtsModel: string | null;
  sarvamSttModel: string | null;
  defaultSarvamSpeaker: string | null;
  translationMode: "off" | "query" | "query+answer";
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
  assistantName: string | null;
  avatarUrl: string | null;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  outOfScopeReply: string | null;
  rules: string[] | null;
  defaultLanguage: string | null;
  allowedLanguages: string[] | null;
  alwaysRespondIn: string | null;
  voiceId: string | null;
  voiceSpeed: number | null;
  createdAt: string;
  updatedAt: string;
};
export type KBAIOverrides = {
  id: string;
  kbId: string;
  provider: AIProvider | null;
  voiceProvider: VoiceProvider | null;
  realtimeVoiceProvider: VoiceProvider | null;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  disableVoice: boolean;
  disablePublicEmbed: boolean;
  createdAt: string;
  updatedAt: string;
};
export async function fetchOrgs(): Promise<Org[]> {
  return apiFetch<Org[]>("/api/orgs");
}
export async function fetchOrg(id: string): Promise<Org> {
  return apiFetch<Org>(`/api/orgs/${id}`);
}
export async function createOrg(name: string): Promise<Org> {
  return apiFetch<Org>("/api/orgs", {
    method: "POST",
    body: JSON.stringify({
      name,
      slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40),
    }),
  });
}
export async function updateOrg(
  id: string,
  name: string,
  logoUrl?: string,
): Promise<Org> {
  return apiFetch<Org>(`/api/orgs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, logoUrl }),
  });
}
export async function deleteOrg(id: string): Promise<void> {
  await apiFetch(`/api/orgs/${id}`, { method: "DELETE" });
}

export type CreateWorkspaceInput = {
  orgName: string;
  orgSlug?: string;
  adminEmail: string;
  adminFullName: string;
  adminPassword?: string;
  planId?: string;
  agentName?: string;
  agentDescription?: string;
  kbName?: string;
  kbDescription?: string;
  apiKeyName?: string;
  markAsDemo?: boolean;
};
export type CreateWorkspaceResult = {
  org: { id: string; name: string; slug: string };
  admin: {
    id: string;
    email: string;
    fullName: string;
    temporaryPassword: string | null;
  };
  agent: { id: string; name: string };
  kb: { id: string; name: string; qdrantCollection: string };
  apiKey: { id: string; rawKey: string; keyPrefix: string; name: string };
  planId: string;
  markedAsDemo: boolean;
};
export async function createWorkspace(
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  return apiFetch<CreateWorkspaceResult>("/api/platform/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function fetchOrgAISettings(id: string): Promise<OrgAISettings> {
  return apiFetch<OrgAISettings>(`/api/orgs/${id}/ai-settings`);
}
// patchOrgAISettings was REMOVED with the AI configuration migration — the
// server endpoint now returns an explicit 410 migration response.

// ── Platform assistant defaults (Identity / Behaviour / Language / Voice) ────
// Super-admin only. Seeded onto newly created projects / KBs / agents;
// existing organisation-owned values are never rewritten.

export type PlatformAssistantDefaults = {
  id: string;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  voiceId: string | null;
  voiceSpeed: number | null;
  updatedAt: string;
};

export async function fetchPlatformAssistantDefaults(): Promise<PlatformAssistantDefaults> {
  return apiFetch<PlatformAssistantDefaults>("/api/platform/assistant-defaults");
}

export async function patchPlatformAssistantDefaults(
  data: Partial<Omit<PlatformAssistantDefaults, "id" | "updatedAt">>,
): Promise<PlatformAssistantDefaults> {
  return apiFetch<PlatformAssistantDefaults>("/api/platform/assistant-defaults", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
export type OrgMember = {
  id: string;
  userId: string;
  orgId: string;
  roleName: string;
  joinedAt: string;
};
export async function fetchOrgMembers(id: string): Promise<OrgMember[]> {
  return apiFetch<OrgMember[]>(`/api/orgs/${id}/members`);
}
export async function inviteOrgMember(
  id: string,
  userId: string,
  role: string,
): Promise<OrgMember> {
  return apiFetch<OrgMember>(`/api/orgs/${id}/members`, {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
}
export async function removeOrgMember(
  id: string,
  userId: string,
): Promise<void> {
  await apiFetch(`/api/orgs/${id}/members/${userId}`, { method: "DELETE" });
}
// ── Agents (the former "projects" — one entity) ─────────────────────────
// The agent owns its knowledge bases and carries its assistant persona
// (Identity / Behaviour / Language / Voice / generation defaults).

export type AgentStatus = "draft" | "published" | "archived";

export type Agent = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: AgentStatus;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  voiceProvider: "openai" | "gemini" | null;
  voiceId: string | null;
  speed: number;
  chatModel: string | null;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function fetchAgents(orgId: string): Promise<Agent[]> {
  return apiFetch<Agent[]>(`/api/orgs/${orgId}/agents`);
}

export async function fetchAgent(id: string): Promise<Agent> {
  return apiFetch<Agent>(`/api/agents/${id}`);
}

export async function createAgent(
  orgId: string,
  name: string,
  description?: string,
): Promise<Agent> {
  return apiFetch<Agent>(`/api/orgs/${orgId}/agents`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function updateAgent(
  id: string,
  name: string,
  description?: string,
): Promise<Agent> {
  return apiFetch<Agent>(`/api/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  await apiFetch(`/api/agents/${id}`, { method: "DELETE" });
}
export type KnowledgeBase = {
  id: string;
  agentId: string;
  name: string;
  description: string | null;
  qdrantCollection: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};
export async function fetchKbs(agentId: string): Promise<KnowledgeBase[]> {
  return apiFetch<KnowledgeBase[]>(`/api/agents/${agentId}/kbs`);
}
export async function fetchKb(id: string): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>(`/api/kbs/${id}`);
}
export async function createKb(
  agentId: string,
  name: string,
  description?: string,
): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>(`/api/agents/${agentId}/kbs`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}
export async function updateKb(
  id: string,
  data: Partial<Pick<KnowledgeBase, "name" | "description" | "status">>,
): Promise<KnowledgeBase> {
  return apiFetch<KnowledgeBase>(`/api/kbs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
export async function deleteKb(id: string): Promise<void> {
  await apiFetch(`/api/kbs/${id}`, { method: "DELETE" });
}
export type KbDocument = {
  id: string;
  kbId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  sourceType: "upload" | "url" | "api";
  createdByScrapeSessionId: string | null;
  fileSize: number | null;
  chunkCount: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
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
export async function fetchDocuments(id: string): Promise<KbDocument[]> {
  return apiFetch<KbDocument[]>(`/api/kbs/${id}/documents`);
}
export async function fetchDocument(
  kbId: string,
  id: string,
): Promise<KbDocument> {
  return apiFetch<KbDocument>(`/api/kbs/${kbId}/documents/${id}`);
}
export async function uploadDocuments(
  kbId: string,
  files: File[],
): Promise<{
  queued: KbDocument[];
  errors: { filename: string; error: string }[];
}> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const ah = withAuthHeaders({});
  const headers: Record<string, string> = {};
  ah.forEach((v, k) => {
    if (k.toLowerCase() !== "content-type") headers[k] = v;
  });
  const res = await fetch(apiUrl(`/api/kbs/${kbId}/documents`), {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Upload failed: HTTP ${res.status}`);
  }
  return res.json();
}
export async function deleteDocument(kbId: string, id: string): Promise<void> {
  await apiFetch(`/api/kbs/${kbId}/documents/${id}`, { method: "DELETE" });
}
export async function reprocessDocument(
  kbId: string,
  id: string,
): Promise<void> {
  await apiFetch(`/api/kbs/${kbId}/documents/${id}/reprocess`, {
    method: "POST",
  });
}
export async function reprocessAllDocuments(
  kbId: string,
): Promise<BulkReprocessResult> {
  return apiFetch<BulkReprocessResult>(
    `/api/kbs/${kbId}/documents/reprocess-all`,
    { method: "POST" },
  );
}
export type AssistantConfig = {
  id: string;
  agentId: string;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  voiceGreeting: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  faqItems?: FaqItem[];
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  voiceId: string;
  speed: number;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;
  primaryColour: string;
  accentColour: string;
  launcherColour: string;
  createdAt: string;
  updatedAt: string;
};
export async function fetchConfig(agentId: string): Promise<AssistantConfig> {
  return apiFetch<AssistantConfig>(`/api/agents/${agentId}/config`);
}
export async function patchConfig(
  agentId: string,
  data: Partial<
    Omit<AssistantConfig, "id" | "agentId" | "createdAt" | "updatedAt">
  >,
): Promise<AssistantConfig> {
  return apiFetch<AssistantConfig>(`/api/agents/${agentId}/config`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
export async function fetchKBAIOverrides(
  id: string,
): Promise<KBAIOverrides | null> {
  return apiFetch<KBAIOverrides | null>(`/api/kbs/${id}/ai-overrides`);
}
export async function patchKBAIOverrides(
  id: string,
  data: Partial<Omit<KBAIOverrides, "id" | "kbId" | "createdAt" | "updatedAt">>,
  options?: {
    /**
     * WS-0.4: set when the caller re-processes the KB's documents in the
     * same action ("Save & Reprocess Docs"). The API refuses embedding-model
     * changes on embedded KBs without it (409 embedding_dimension_change).
     */
    allowEmbeddingReprocess?: boolean;
  },
): Promise<KBAIOverrides> {
  return apiFetch<KBAIOverrides>(`/api/kbs/${id}/ai-overrides`, {
    method: "PATCH",
    body: JSON.stringify({
      ...data,
      ...(options?.allowEmbeddingReprocess ? { allowEmbeddingReprocess: true } : {}),
    }),
  });
}
export type ConfigSnapshot = {
  id: string;
  agentId: string;
  label: string | null;
  snapshot: AssistantConfig;
  createdBy: string | null;
  createdAt: string;
};
export async function fetchSnapshots(agentId: string): Promise<ConfigSnapshot[]> {
  return apiFetch<ConfigSnapshot[]>(`/api/agents/${agentId}/config/snapshots`);
}
export async function createSnapshot(
  agentId: string,
  label?: string,
): Promise<ConfigSnapshot> {
  return apiFetch<ConfigSnapshot>(`/api/agents/${agentId}/config/snapshots`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}
export async function restoreSnapshot(
  agentId: string,
  snapshotId: string,
): Promise<{ restored: boolean; config: AssistantConfig }> {
  return apiFetch(`/api/agents/${agentId}/config/snapshots/${snapshotId}/restore`, {
    method: "POST",
    body: "{}",
  });
}
export type KbAnalytics = {
  totalQueries: number;
  queriesThisWeek: number;
  queriesPerDay: { date: string; count: number }[];
  topQueries: { queryText: string; count: number }[];
  avgLatencyMs: number | null;
  avgSourceCount: number | null;
};
export async function fetchAnalytics(id: string): Promise<KbAnalytics> {
  return apiFetch<KbAnalytics>(`/api/kbs/${id}/analytics`);
}
export type ScrapeSessionStatus =
  | "discovering"
  | "awaiting_confirmation"
  | "scraping"
  | "ingesting"
  | "completed"
  | "failed";
export type ScrapeUrlStatus =
  | "pending"
  | "scraping"
  | "completed"
  | "failed"
  | "excluded";
export type ScrapeUrl = {
  id: string;
  sessionId: string;
  url: string;
  title: string | null;
  depth: number;
  parentUrl: string | null;
  included: boolean;
  status: ScrapeUrlStatus;
  documentId: string | null;
  contentLength: number | null;
  errorMessage: string | null;
  createdAt: string;
};
export type ScrapeSession = {
  id: string;
  kbId: string;
  rootUrl: string;
  status: ScrapeSessionStatus;
  maxDepth: number;
  totalUrls: number;
  selectedUrls: number;
  scrapedUrls: number;
  failedUrls: number;
  errorMessage: string | null;
  jobId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  urls?: ScrapeUrl[];
};
export type ScrapeProgress = {
  sessionId: string;
  status: ScrapeSessionStatus;
  totalUrls: number;
  selectedUrls: number;
  scrapedUrls: number;
  failedUrls: number;
  pendingUrls: number;
  scrapingUrls: number;
  ingestTotalDocs: number;
  ingestPendingDocs: number;
  ingestProcessingDocs: number;
  ingestReadyDocs: number;
  ingestFailedDocs: number;
  errorMessage: string | null;
};
export type DiscoverProgress = {
  status: ScrapeSessionStatus;
  jobProgress: number;
  urlsFound: number;
  elapsedMs: number | null;
};
export type ScrapeStreamSnapshot = {
  sessionId: string;
  rootUrl: string;
  status: ScrapeSessionStatus;
  cancelRequested: boolean;
  totalUrls: number;
  selectedUrls: number;
  scrapedUrls: number;
  failedUrls: number;
  pendingUrls: number;
  scrapingUrls: number;
  jobProgress: number;
  urlsFound: number;
  elapsedMs: number | null;
  ingestTotalDocs: number;
  ingestPendingDocs: number;
  ingestProcessingDocs: number;
  ingestReadyDocs: number;
  ingestFailedDocs: number;
  errorMessage: string | null;
};
export type CancelScrapeSessionResult = {
  cancelling?: boolean;
  rolledBackTo: "idle" | "awaiting_confirmation";
  session?: ScrapeSession;
};
export async function discoverScrapeUrls(
  kbId: string,
  url: string,
  opts: {
    maxDepth?: number;
    maxUrls?: number;
    scopeToInputPath?: boolean;
  } = {},
): Promise<ScrapeSession> {
  return apiFetch<ScrapeSession>(`/api/kbs/${kbId}/scrape/discover`, {
    method: "POST",
    body: JSON.stringify({ url, ...opts }),
  });
}
export async function listScrapeSessions(
  kbId: string,
): Promise<ScrapeSession[]> {
  return apiFetch<ScrapeSession[]>(`/api/kbs/${kbId}/scrape/sessions`);
}
export async function getScrapeSession(
  kbId: string,
  id: string,
): Promise<ScrapeSession> {
  return apiFetch<ScrapeSession>(`/api/kbs/${kbId}/scrape/sessions/${id}`);
}
export async function toggleScrapeUrl(
  kbId: string,
  urlId: string,
  included: boolean,
): Promise<ScrapeUrl> {
  return apiFetch<ScrapeUrl>(`/api/kbs/${kbId}/scrape/urls/${urlId}`, {
    method: "PATCH",
    body: JSON.stringify({ included }),
  });
}
export async function batchToggleScrapeUrls(
  kbId: string,
  payload:
    | { urlIds: string[]; included: boolean }
    | { sessionId: string; selectAll: boolean },
): Promise<{ updated: boolean; updatedCount?: number }> {
  return apiFetch(`/api/kbs/${kbId}/scrape/urls/batch`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export async function startScrapeSession(
  kbId: string,
  id: string,
): Promise<{ started: boolean }> {
  return apiFetch(`/api/kbs/${kbId}/scrape/sessions/${id}/start`, {
    method: "POST",
    body: "{}",
  });
}
export async function cancelScrapeSession(
  kbId: string,
  id: string,
): Promise<CancelScrapeSessionResult> {
  return apiFetch<CancelScrapeSessionResult>(
    `/api/kbs/${kbId}/scrape/sessions/${id}/cancel`,
    { method: "POST", body: "{}" },
  );
}
export async function getScrapeProgress(
  kbId: string,
  id: string,
): Promise<ScrapeProgress> {
  return apiFetch<ScrapeProgress>(
    `/api/kbs/${kbId}/scrape/sessions/${id}/progress`,
  );
}
export async function getActiveSession(
  kbId: string,
): Promise<ScrapeSession | null> {
  return apiFetch<ScrapeSession | null>(
    `/api/kbs/${kbId}/scrape/active-session`,
  );
}
export async function getDiscoverProgress(
  kbId: string,
  id: string,
): Promise<DiscoverProgress> {
  return apiFetch<DiscoverProgress>(
    `/api/kbs/${kbId}/scrape/sessions/${id}/discover-progress`,
  );
}
export function openScrapeProgressStream(
  kbId: string,
  id: string,
): EventSource {
  return new EventSource(
    apiUrl(`/api/kbs/${kbId}/scrape/sessions/${id}/stream`),
    { withCredentials: true },
  );
}
export type UrlRetryStatus = "scheduled" | "running" | "succeeded" | "failed";
export type UrlRetryStatusOnUrl =
  | "scheduled"
  | "retrying"
  | "succeeded"
  | "permanently_failed";
export type UrlRetry = {
  id: string;
  scrapeUrlId: string;
  sessionId: string;
  kbId: string;
  url: string;
  attemptNumber: number;
  status: UrlRetryStatus;
  errorCode: string | null;
  errorMessage: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
  jobId: string | null;
  createdAt: string;
};
export type FailedUrlWithRetries = {
  id: string;
  sessionId: string;
  url: string;
  title: string | null;
  depth: number;
  errorMessage: string | null;
  retryCount: number;
  retryStatus: UrlRetryStatusOnUrl | null;
  nextRetryAt: string | null;
  retries: UrlRetry[];
};
export type RetryFailedUrlResult = {
  scheduled: boolean;
  reason?: string;
  attemptNumber?: number;
  nextRetryAt?: string;
};
export type KbChunk = {
  pointId: string;
  chunkIndex: number;
  chunk: string;
  uploadedAt: string;
  title: string;
  originalFilename: string;
  documentId: string;
  pageNumber?: number;
};

export type ChunkDebugSource = {
  schemaVersion: "clara.chunk-debug.v1";
  kbId: string;
  documentId: string;
  title: string;
  chunkCount: number;
  document: {
    id: string;
    title: string;
    originalFilename: string;
    mimeType: string | null;
    sourceType: string;
    status: string;
    reportedChunkCount: number | null;
  };
  collection: string;
  embedding: {
    index: string;
    provider: string;
    model: string;
    dimension: number;
  } | null;
  chunks: KbChunk[];
};
/** Full, authorized Qdrant chunk snapshot for debugging or the chunk viewer. */
export async function fetchDocumentChunkDebug(
  kbId: string,
  docId: string,
): Promise<ChunkDebugSource> {
  return apiFetch<ChunkDebugSource>(
    `/api/kbs/${kbId}/documents/${docId}/chunks`,
  );
}
export async function listDocumentChunks(
  kbId: string,
  docId: string,
): Promise<KbChunk[]> {
  return (await fetchDocumentChunkDebug(kbId, docId)).chunks;
}
export async function addDocumentChunk(
  kbId: string,
  docId: string,
  text: string,
  chunkIndex?: number,
): Promise<KbChunk> {
  return apiFetch<KbChunk>(`/api/kbs/${kbId}/documents/${docId}/chunks`, {
    method: "POST",
    body: JSON.stringify({ text, chunkIndex }),
  });
}
export async function updateDocumentChunk(
  kbId: string,
  docId: string,
  pointId: string,
  text: string,
  chunkIndex: number,
): Promise<void> {
  await apiFetch(`/api/kbs/${kbId}/documents/${docId}/chunks/${pointId}`, {
    method: "PATCH",
    body: JSON.stringify({ text, chunkIndex }),
  });
}
export async function deleteDocumentChunk(
  kbId: string,
  docId: string,
  pointId: string,
): Promise<void> {
  await apiFetch(`/api/kbs/${kbId}/documents/${docId}/chunks/${pointId}`, {
    method: "DELETE",
  });
}
export async function getFailedUrls(
  kbId: string,
  id: string,
): Promise<FailedUrlWithRetries[]> {
  return apiFetch<FailedUrlWithRetries[]>(
    `/api/kbs/${kbId}/scrape/sessions/${id}/failed-urls`,
  );
}
export async function retryFailedUrl(
  kbId: string,
  urlId: string,
): Promise<RetryFailedUrlResult> {
  return apiFetch<RetryFailedUrlResult>(
    `/api/kbs/${kbId}/scrape/urls/${urlId}`,
    { method: "POST", body: "{}" },
  );
}

// ── Org usage limits (profile menu meters) ───────────────────────────────────

/** Live org usage vs effective plan limits (GET /api/orgs/:id/usage-limits). */
export type OrgUsageLimits = {
  plan_id: string;
  plan_name: string;
  status: string;
  downgraded: boolean;
  usage: {
    kb_count: number;
    doc_count: number;
    max_docs_in_kb: number;
    storage_bytes: number;
    requests_today: number;
    requests_24h: number;
    api_keys_active: number;
  };
  limits: {
    max_kbs: number;
    max_docs_per_kb: number;
    max_req_day: number;
    max_storage_mb: number;
    voice_enabled: boolean;
    api_access: boolean;
    custom_branding: boolean;
    sso_enabled: boolean;
    max_tts_chars_day: number;
    max_stt_audio_sec_day: number;
    max_translation_chars_day: number;
  };
};

export async function fetchOrgUsageLimits(orgId: string): Promise<OrgUsageLimits> {
  return apiFetch<OrgUsageLimits>(`/api/orgs/${orgId}/usage-limits`);
}
