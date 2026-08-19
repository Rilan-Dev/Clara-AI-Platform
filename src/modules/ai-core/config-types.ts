import type { AssistantConfig } from "@/modules/knowledge-bases/core/models";

export type AIProvider = "openai" | "gemini";

export type AISurface = "chat" | "rag-embedding" | "realtime" | "embed";

export type ResolutionSource =
  | "env"
  | "org"
  | "project"
  | "kb_override"
  | "assistant_config"
  | null;

export type ProviderScopedList = Partial<Record<AIProvider, string[]>>;

export type VoiceResolutionSource = ResolutionSource;

export interface PlatformAIDefaults {
  provider: AIProvider;
  models: Record<AIProvider, {
    chat: string | null;
    embedding: string | null;
    realtime: string | null;
    transcription: string | null;
    defaultVoice: string | null;
  }>;
  limits: {
    chatMaxTokens: number | null;
    realtimeMaxTokens: number | null;
    maxTemperature: number | null;
  };
}

export interface OrgAISettings {
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
}

export interface PatchOrgAISettingsInput {
  defaultProvider?: AIProvider | null;
  allowedProviders?: AIProvider[];
  allowedChatModels?: ProviderScopedList;
  allowedEmbeddingModels?: ProviderScopedList;
  allowedRealtimeModels?: ProviderScopedList;
  allowedVoices?: ProviderScopedList;
  defaultChatModel?: string | null;
  defaultEmbeddingModel?: string | null;
  defaultRealtimeModel?: string | null;
  defaultTranscriptionModel?: string | null;
  maxChatTokens?: number | null;
  maxRealtimeTokens?: number | null;
  maxTemperature?: number | null;
  enablePublicEmbed?: boolean;
  enableVoice?: boolean;
  enableRealtime?: boolean;
}

export interface KBAIOverrides {
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
}

export interface PatchKBAIOverridesInput {
  provider?: AIProvider | null;
  chatModel?: string | null;
  embeddingModel?: string | null;
  realtimeModel?: string | null;
  transcriptionModel?: string | null;
  disableVoice?: boolean;
  disablePublicEmbed?: boolean;
}

export interface ResolveAIConfigInput {
  kbId?: string;
  orgId?: string;
  surface: AISurface;
}

export interface ResolvedAIConfig {
  orgId: string | null;
  kbId: string | null;
  provider: AIProvider;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  voiceId: string | null;
  temperature: number | null;
  maxTokens: number | null;
  assistantConfig: AssistantConfig | null;
  flags: {
    voiceEnabled: boolean;
    realtimeEnabled: boolean;
    publicEmbedEnabled: boolean;
  };
  sources: {
    provider: ResolutionSource;
    chatModel: ResolutionSource;
    embeddingModel: ResolutionSource;
    realtimeModel: ResolutionSource;
    transcriptionModel: ResolutionSource;
    voiceId: VoiceResolutionSource;
    temperature: ResolutionSource;
    maxTokens: ResolutionSource;
  };
}
