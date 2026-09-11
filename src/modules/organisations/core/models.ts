/** Shared TypeScript types for organisations and projects. */

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /** Platform-admin summary counts only; never tenant resource details. */
  projectCount?: number;
  knowledgeBaseCount?: number;
};

export type CreateOrgInput = { name: string; slug?: string; logoUrl?: string };
export type UpdateOrgInput = Partial<Pick<CreateOrgInput, "name" | "logoUrl">>;

export type Project = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CreateProjectInput = { name: string; description?: string };
export type UpdateProjectInput = Partial<CreateProjectInput>;

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
