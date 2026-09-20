/** Shared TypeScript types for organisations and agents (the former "projects"). */

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /** Platform-admin summary counts only; never tenant resource details. */
  agentCount?: number;
  knowledgeBaseCount?: number;
};

export type CreateOrgInput = { name: string; slug?: string; logoUrl?: string };
export type UpdateOrgInput = Partial<Pick<CreateOrgInput, "name" | "logoUrl">>;

// ── Agents (projects renamed to agents — one entity) ──────────────────────
// The agent owns its knowledge bases AND its assistant configuration
// (assistant_configs, 1:1 — Identity / Behaviour / Language / Voice /
// generation / widget design). Knowledge bases hold content only.

export type AgentStatus = "draft" | "published" | "archived";

export type Agent = {
  id: string;
  orgId: string;

  // Labelling & lifecycle
  name: string;
  description: string | null;
  status: AgentStatus;

  // Audit
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentInput = { name: string; description?: string; createdBy?: string };
export type UpdateAgentInput = Partial<
  Omit<Agent, "id" | "orgId" | "createdAt" | "updatedAt">
>;

export type AIProvider = "openai" | "gemini" | "sarvam";
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
  // Identity
  assistantName: string | null;
  avatarUrl: string | null;
  // Behaviour
  systemPrompt: string | null;
  welcomeMessage: string | null;
  outOfScopeReply: string | null;
  rules: string[] | null;
  // Language
  defaultLanguage: string | null;
  allowedLanguages: string[] | null;
  alwaysRespondIn: string | null;
  // Voice
  voiceId: string | null;
  voiceSpeed: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PatchOrgAISettingsInput = Partial<{
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
}>;
