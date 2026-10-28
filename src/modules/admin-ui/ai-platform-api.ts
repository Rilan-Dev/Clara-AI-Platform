/**
 * src/modules/admin-ui/ai-platform-api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed client for the AI Platform governance + agent version-control APIs.
 * Kept separate from admin-ui/api.ts (which is at capacity) — imported by the
 * AI Platform settings workspace and the agent workspace screens.
 */

import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl, fetchJsonShared } from "@/lib/runtime";

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = withAuthHeaders(options.headers ?? {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  // fetchJsonShared merges concurrent identical GETs into one round trip and
  // drops pending GET entries whenever a mutating request is issued.
  const { ok, status, statusText, body } = await fetchJsonShared(apiUrl(url), {
    ...options,
    headers,
  });
  if (!ok) {
    const b = (body ?? {}) as { error?: string; code?: string };
    const err = new Error(b?.error ?? `HTTP ${status} ${statusText}`) as Error & { code?: string };
    err.code = b?.code;
    throw err;
  }
  return body as T;
}

// ─── Platform provider governance ─────────────────────────────────────────────

export type AICapability = "chat" | "voice_chat" | "realtime_voice";
export type ProviderHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export type PlatformAIProviderDTO = {
  providerId: string;
  displayName: string;
  description: string | null;
  /** EFFECTIVE enablement (admin switch AND operational kill-switch). */
  enabled: boolean;
  realtimeEnabled: boolean;
  /** "kill_switch" when the admin switch is on but an env flag is off. */
  disabledReason: "kill_switch" | null;
  configured: boolean;
  capabilities: Array<{ capability: AICapability; supported: boolean }>;
  health: {
    providerId: string;
    status: ProviderHealthStatus;
    latencyMs: number | null;
    errorMessage: string | null;
    checkedAt: string | null;
    checkedBy: string | null;
  } | null;
  monthlyBudgetUsd: number | null;
  warningThresholdPct: number;
  credential: {
    providerId: string;
    envKey: string;
    baseUrlEnvKey: string | null;
    maskedHint: string | null;
    configured: boolean;
    updatedAt: string | null;
  } | null;
  modelCounts: Partial<Record<AICapability, number>>;
};

export type ProviderModelDTO = {
  id: string;
  providerId: string;
  capability: AICapability;
  kind: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  metadata: Record<string, unknown>;
};

export type CapabilityDefaultDTO = {
  capability: AICapability;
  providerId: string | null;
  modelId: string | null;
};

export type EmbeddingDefaultDTO = {
  providerId: "openai" | "gemini" | "qwen";
  modelId: string;
  updatedAt: string | null;
};

export type ProviderUsageReportDTO = {
  providerId: string;
  periodStart: string;
  requests: number;
  costUsd: number;
  monthlyBudgetUsd: number | null;
  usagePct: number | null;
  rechargeWarning: boolean;
};

export async function fetchAIProviders(): Promise<{ providers: PlatformAIProviderDTO[]; defaults: CapabilityDefaultDTO[]; embeddingDefault: EmbeddingDefaultDTO | null }> {
  return apiFetch("/api/platform/ai/providers");
}

export async function fetchProviderWorkspace(providerId: string): Promise<{
  provider: PlatformAIProviderDTO;
  models: ProviderModelDTO[];
  healthHistory: Array<{ status: ProviderHealthStatus; latencyMs: number | null; errorMessage: string | null; checkedAt: string; checkedBy: string | null }>;
  usage: ProviderUsageReportDTO | null;
}> {
  return apiFetch(`/api/platform/ai/providers/${providerId}?usage=1`);
}

export async function patchProvider(
  providerId: string,
  input: { enabled?: boolean; realtimeEnabled?: boolean; monthlyBudgetUsd?: number | null; warningThresholdPct?: number },
): Promise<{ provider: PlatformAIProviderDTO | null }> {
  return apiFetch(`/api/platform/ai/providers/${providerId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function putProviderCredential(
  providerId: string,
  input: { apiKey?: string; baseUrl?: string },
): Promise<{ credential: PlatformAIProviderDTO["credential"] }> {
  return apiFetch(`/api/platform/ai/providers/${providerId}/credentials`, { method: "PUT", body: JSON.stringify(input) });
}

export async function testProvider(providerId: string): Promise<{
  health: { status: ProviderHealthStatus; latencyMs: number | null; errorMessage: string | null; checkedAt: string };
}> {
  return apiFetch(`/api/platform/ai/providers/${providerId}/test`, { method: "POST" });
}

export async function patchProviderModel(
  providerId: string,
  input: { capability: AICapability; kind: string; modelId: string; enabled?: boolean; isDefault?: boolean },
): Promise<{ models: ProviderModelDTO[] }> {
  return apiFetch(`/api/platform/ai/providers/${providerId}/models`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function fetchEmbeddingDefault(): Promise<{ embeddingDefault: EmbeddingDefaultDTO | null }> {
  return apiFetch("/api/platform/ai/embedding-default");
}

export async function putEmbeddingDefault(
  providerId: "openai" | "gemini" | "qwen",
  modelId: string,
): Promise<{ embeddingDefault: EmbeddingDefaultDTO }> {
  return apiFetch("/api/platform/ai/embedding-default", {
    method: "PUT",
    body: JSON.stringify({ providerId, modelId }),
  });
}

export async function putCapabilityDefault(
  capability: AICapability,
  providerId: string | null,
  modelId: string | null,
): Promise<{ defaults: CapabilityDefaultDTO[] }> {
  return apiFetch("/api/platform/ai/defaults", { method: "PUT", body: JSON.stringify({ capability, providerId, modelId }) });
}

export async function fetchProviderUsage(): Promise<{ reports: ProviderUsageReportDTO[] }> {
  return apiFetch("/api/platform/ai/usage");
}

// ─── Default Assistant versioning ─────────────────────────────────────────────

export type DefaultAssistantPersona = {
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  // Generation (migration 042) — optional so pre-042 versions keep parsing.
  temperature?: number;
  maxTokens?: number;
  citeSources?: boolean;
  strictMode?: boolean;
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  voiceId: string | null;
  voiceSpeed: number | null;
  // Branding (migration 042)
  primaryColour?: string;
  accentColour?: string;
  launcherColour?: string | null;
};

export type DefaultAssistantVersionDTO = {
  versionNumber: number;
  configuration: { assistant: DefaultAssistantPersona };
  parentVersionNumber: number | null;
  changeSummary: string | null;
  createdByName: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type DefaultAssistantStateDTO = {
  defaults: { assistantName: string; voiceId: string | null; defaultLanguage: string; updatedAt: string } & DefaultAssistantPersona & { id: string; updatedAt: string };
  currentVersion: number | null;
  current: DefaultAssistantVersionDTO | null;
  draft: { assistant: DefaultAssistantPersona } | null;
  draftUpdatedAt: string | null;
};

export async function fetchDefaultAssistantState(): Promise<DefaultAssistantStateDTO> {
  return apiFetch("/api/platform/assistant-defaults/draft");
}

export async function putDefaultAssistantDraft(persona: DefaultAssistantPersona): Promise<DefaultAssistantStateDTO> {
  return apiFetch("/api/platform/assistant-defaults/draft", {
    method: "PUT",
    body: JSON.stringify({ configuration: { assistant: persona } }),
  });
}

export async function saveDefaultAssistantVersion(changeSummary: string | null): Promise<DefaultAssistantVersionDTO> {
  return apiFetch("/api/platform/assistant-defaults/versions", { method: "POST", body: JSON.stringify({ changeSummary }) });
}

export async function fetchDefaultAssistantVersions(): Promise<{ versions: DefaultAssistantVersionDTO[] }> {
  return apiFetch("/api/platform/assistant-defaults/versions");
}

export async function restoreDefaultAssistantVersion(versionNumber: number): Promise<DefaultAssistantVersionDTO> {
  return apiFetch(`/api/platform/assistant-defaults/versions/${versionNumber}`, { method: "POST" });
}

// ─── Semantic diff (shared shape for default assistant + agent diffs) ─────────

export type DiffFieldChangeDTO = {
  field: string;
  label: string;
  kind: "added" | "removed" | "changed" | "toggled_on" | "toggled_off";
  before: string | null;
  after: string | null;
  addedItems?: string[];
  removedItems?: string[];
};

export type SemanticDiffDTO = {
  from: { versionNumber: number | null; label: string };
  to: { versionNumber: number | null; label: string };
  sections: Array<{ key: string; title: string; changes: DiffFieldChangeDTO[] }>;
  changeCount: number;
  hasChanges: boolean;
};

export async function fetchDefaultAssistantDiff(a: string, b: string): Promise<SemanticDiffDTO> {
  return apiFetch(`/api/platform/assistant-defaults/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
}

// ─── Agent versioning workspace ───────────────────────────────────────────────

export type AgentVersionConfigDTO = {
  assistant: Record<string, unknown>;
  ai: {
    provider: string | null;
    chatModel: string | null;
    embeddingModel: string | null;
    realtimeModel: string | null;
    transcriptionModel: string | null;
    voiceProvider: string | null;
    voiceChatSttModel: string | null;
    voiceChatTtsModel: string | null;
    voiceChatVoiceId: string | null;
    realtimeVoiceProvider: string | null;
    realtimeLlmModel: string | null;
    realtimeSttModel: string | null;
    realtimeTtsModel: string | null;
    realtimeVoiceId: string | null;
  } | null;
  runtime: { enableVoice: boolean; enableRealtime: boolean; enablePublicEmbed: boolean } | null;
  knowledge?: { kbIds: string[] };
};

export type AgentBranchDTO = {
  id: string;
  name: string;
  description: string | null;
  isMain: boolean;
  isArchived: boolean;
  forkedFromVersionId: string | null;
  forkedFromVersionNumber: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  latestVersionNumber: number | null;
  draftUpdatedAt: string | null;
};

export type AgentVersionDTO = {
  id: string;
  branchId: string;
  branchName: string;
  versionNumber: number;
  parentVersionId: string | null;
  changeSummary: string | null;
  source: string;
  /** Short change-area pills for branch-history rows ("System prompt", "Voice"…). */
  changeTags?: string[];
  createdByName: string | null;
  createdAt: string;
  publishedAt: string | null;
  configuration?: AgentVersionConfigDTO;
};

export type AgentDraftDTO = {
  id: string;
  branchId: string;
  branchName: string;
  configuration: AgentVersionConfigDTO;
  parentVersionId: string | null;
  parentVersionNumber: number | null;
  updatedAt: string;
};

export type AgentDeploymentDTO = {
  id: string;
  branchId: string;
  branchName: string;
  versionId: string;
  versionNumber: number;
  environment: string;
  status: string;
  publicAccess: boolean;
  publishedByName: string | null;
  publishedAt: string;
  changeSummary: string | null;
};

export type AgentWorkspaceContextDTO = {
  agent: { id: string; name: string; orgId: string; status: string };
  branches: AgentBranchDTO[];
  main: AgentBranchDTO;
  currentVersion: AgentVersionDTO | null;
  draftUpdatedAt: string | null;
  deployment: AgentDeploymentDTO | null;
  defaultAssistantUpdate: {
    updateAvailable: boolean;
    agentDefaultVersion: number | null;
    currentPlatformVersion: number | null;
  } | null;
};

export type MergeReviewDTO = {
  sourceBranch: { id: string; name: string };
  targetBranch: { id: string; name: string };
  baseVersionNumber: number | null;
  sourceVersionNumber: number | null;
  targetVersionNumber: number | null;
  incoming: Array<{ key: string; title: string; changes: DiffFieldChangeDTO[] }>;
  conflicts: Array<{
    section: string;
    sectionTitle: string;
    field: DiffFieldChangeDTO & { ours: string | null; theirs: string | null };
  }>;
  compatibleChangeCount: number;
  conflictCount: number;
};

export type PublishReviewDTO = {
  version: AgentVersionDTO & { configuration: AgentVersionConfigDTO };
  deployment: AgentDeploymentDTO | null;
  changesSinceDeployment: SemanticDiffDTO | null;
  validation: {
    ok: boolean;
    checks: Array<{ key: string; label: string; passed: boolean; detail: string | null }>;
  };
};

export async function fetchAgentWorkspaceContext(agentId: string): Promise<AgentWorkspaceContextDTO> {
  return apiFetch(`/api/agents/${agentId}/workspace`);
}

export async function fetchAgentDraft(agentId: string, branchId?: string): Promise<AgentDraftDTO> {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiFetch(`/api/agents/${agentId}/draft${qs}`);
}

export async function putAgentDraft(agentId: string, configuration: AgentVersionConfigDTO, branchId?: string): Promise<AgentDraftDTO> {
  return apiFetch(`/api/agents/${agentId}/draft`, {
    method: "PUT",
    body: JSON.stringify({ configuration, branchId }),
  });
}

export async function fetchAgentVersions(agentId: string, branchId?: string): Promise<{ versions: AgentVersionDTO[] }> {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiFetch(`/api/agents/${agentId}/versions${qs}`);
}

export async function fetchAgentVersion(agentId: string, versionId: string): Promise<AgentVersionDTO & { configuration: AgentVersionConfigDTO }> {
  return apiFetch(`/api/agents/${agentId}/versions/${versionId}`);
}

export async function saveAgentVersion(agentId: string, changeSummary: string | null, branchId?: string): Promise<AgentVersionDTO & { configuration: AgentVersionConfigDTO }> {
  return apiFetch(`/api/agents/${agentId}/versions`, {
    method: "POST",
    body: JSON.stringify({ changeSummary, branchId }),
  });
}

export async function restoreAgentVersion(agentId: string, versionId: string): Promise<AgentVersionDTO & { configuration: AgentVersionConfigDTO }> {
  return apiFetch(`/api/agents/${agentId}/versions/${versionId}/restore`, { method: "POST" });
}

export async function fetchAgentDiff(agentId: string, a: string, b: string, branchId?: string): Promise<SemanticDiffDTO> {
  const qs = new URLSearchParams({ a, b });
  if (branchId) qs.set("branchId", branchId);
  return apiFetch(`/api/agents/${agentId}/versions/diff?${qs.toString()}`);
}

export async function fetchAgentBranches(agentId: string): Promise<{ branches: AgentBranchDTO[] }> {
  return apiFetch(`/api/agents/${agentId}/branches`);
}

export async function createAgentBranch(
  agentId: string,
  input: { name: string; description?: string | null; fromVersionId: string },
): Promise<{ branch: AgentBranchDTO; draft: AgentDraftDTO }> {
  return apiFetch(`/api/agents/${agentId}/branches`, { method: "POST", body: JSON.stringify(input) });
}

export async function archiveAgentBranch(agentId: string, branchId: string, archived = true): Promise<{ ok: boolean }> {
  return apiFetch(`/api/agents/${agentId}/branches/${branchId}`, { method: "PATCH", body: JSON.stringify({ archived }) });
}

export async function reviewAgentMerge(agentId: string, branchId: string): Promise<MergeReviewDTO> {
  return apiFetch(`/api/agents/${agentId}/branches/${branchId}/merge`);
}

export async function executeAgentMerge(
  agentId: string,
  branchId: string,
  resolutions: Array<{ field: string; pick: "theirs" | "ours" }>,
): Promise<{ version: AgentVersionDTO }> {
  return apiFetch(`/api/agents/${agentId}/branches/${branchId}/merge`, {
    method: "POST",
    body: JSON.stringify({ resolutions }),
  });
}

export async function fetchPublishReview(agentId: string, versionId: string): Promise<PublishReviewDTO> {
  return apiFetch(`/api/agents/${agentId}/publish?versionId=${encodeURIComponent(versionId)}`);
}

export async function fetchAgentDeployments(agentId: string): Promise<{ deployments: AgentDeploymentDTO[] }> {
  return apiFetch(`/api/agents/${agentId}/publish`);
}

export async function publishAgentVersion(agentId: string, versionId: string, publicAccess: boolean): Promise<{
  deployment: AgentDeploymentDTO;
  validation: PublishReviewDTO["validation"];
}> {
  return apiFetch(`/api/agents/${agentId}/publish`, {
    method: "POST",
    body: JSON.stringify({ versionId, publicAccess }),
  });
}

export async function rollbackAgent(agentId: string, versionId: string): Promise<{ deployment: AgentDeploymentDTO }> {
  return apiFetch(`/api/agents/${agentId}/publish`, { method: "PUT", body: JSON.stringify({ versionId }) });
}

// ─── Published agent explore link ─────────────────────────────────────────────

export type AgentExploreLinkDTO = {
  kbId: string;
  kbName: string;
  key: string;
  widgetUrl: string;
  voiceUrl: string;
  previewUrl: string;
};

/** Mint (or re-mint) an embed key + public URL pair for exploring a published agent. */
export async function generateAgentExploreLink(agentId: string): Promise<AgentExploreLinkDTO> {
  return apiFetch(`/api/agents/${agentId}/explore-link`, { method: "POST" });
}

export async function checkAgentDefaultUpdate(agentId: string): Promise<{
  updateAvailable: boolean;
  agentDefaultVersion: number | null;
  currentPlatformVersion: number | null;
}> {
  return apiFetch(`/api/agents/${agentId}/default-update`);
}

export async function applyAgentDefaultUpdate(agentId: string): Promise<AgentDraftDTO> {
  return apiFetch(`/api/agents/${agentId}/default-update`, { method: "POST" });
}

// ─── Capability resolver (agent workspace AI selectors) ───────────────────────

export type AgentAIOptionsDTO = {
  capability: AICapability;
  available: Array<{
    providerId: string;
    displayName: string;
    health: ProviderHealthStatus;
    isDefault: boolean;
    models: Array<{ modelId: string; displayName: string; kind: string; isDefault: boolean }>;
    voices: Array<{ modelId: string; displayName: string; kind: string; isDefault: boolean }>;
  }>;
  blocked: Array<{ providerId: string; displayName: string; reason: string }>;
  entitlement: { planId: string | null; planName: string | null; capabilityEnabled: boolean };
  currentSelection: { providerId: string | null; modelId: string | null; voiceId: string | null; stillAvailable: boolean } | null;
};

export async function fetchAgentAIOptions(agentId: string, capability: AICapability): Promise<AgentAIOptionsDTO> {
  return apiFetch(`/api/agents/${agentId}/ai-options?capability=${capability}`);
}

export type GeneratedSystemPromptDTO = {
  prompt: string;
  template: string;
  reason?: string;
  documentsSampled: number;
};

/** Drafts a system prompt from the agent's knowledge base (review before use). */
export async function generateAgentSystemPrompt(
  agentId: string,
  input: { template: string; notes?: string },
): Promise<GeneratedSystemPromptDTO> {
  return apiFetch(`/api/agents/${agentId}/system-prompt/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Translates admin-authored text (e.g. the first message) for review. */
export async function translateAgentText(
  agentId: string,
  input: { text: string; targetLanguage: string },
): Promise<{ translatedText: string; language: string }> {
  return apiFetch(`/api/agents/${agentId}/translate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
