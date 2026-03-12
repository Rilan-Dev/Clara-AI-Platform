/**
 * src/modules/organisations/core/models.ts
 * Shared TypeScript types for organisations and projects.
 */

// ── Organisation ──────────────────────────────────────────────────────────────

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrgInput = {
  name: string;
  slug?: string;       // auto-generated from name if omitted
  logoUrl?: string;
};

export type UpdateOrgInput = Partial<Pick<CreateOrgInput, "name" | "logoUrl">>;

// ── Project ───────────────────────────────────────────────────────────────────

export type Project = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

// ── Org AI Settings ───────────────────────────────────────────────────────────

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
