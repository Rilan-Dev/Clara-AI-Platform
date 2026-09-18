import type { AssistantConfig } from "@/modules/knowledge-bases/core/models";
import type { VoiceProvider } from "@/modules/voice-core/types";

export type AIProvider = "openai" | "gemini";
export type AISurface = "chat" | "rag-embedding" | "realtime" | "embed";
export type ResolutionSource =
  | "env"
  | "org"
  | "agent_settings"
  | "kb_override"
  | "agent"
  | "assistant_config"
  | null;
export type ProviderScopedList = Partial<Record<AIProvider, string[]>>;
export type VoiceResolutionSource = ResolutionSource;

export interface PlatformAIDefaults {
  provider: AIProvider;
  models: Record<
    AIProvider,
    {
      chat: string | null;
      embedding: string | null;
      realtime: string | null;
      transcription: string | null;
      defaultVoice: string | null;
    }
  >;
  limits: {
    chatMaxTokens: number | null;
    realtimeMaxTokens: number | null;
    maxTemperature: number | null;
  };
}

/**
 * Platform-level assistant persona defaults (Identity, Behaviour, Language,
 * Voice) — managed by the platform admin in Settings -> AI Configuration.
 *
 * These are the STARTING VALUES for newly onboarding agents / knowledge
 * bases: seeded at creation time, so later edits never affect existing rows
 * (those are owned by the organisations).
 */
export interface PlatformAssistantDefaults {
  id: string;
  // Identity
  assistantName: string;
  avatarUrl: string | null;
  // Behaviour
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  // Language
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  // Voice
  voiceId: string | null;
  voiceSpeed: number | null;
  updatedAt: string;
}

export interface PatchPlatformAssistantDefaultsInput {
  assistantName?: string;
  avatarUrl?: string | null;
  systemPrompt?: string;
  welcomeMessage?: string;
  outOfScopeReply?: string;
  rules?: string[];
  defaultLanguage?: string;
  allowedLanguages?: string[];
  alwaysRespondIn?: string | null;
  voiceId?: string | null;
  voiceSpeed?: number | null;
}

export interface OrgAISettings {
  id: string;
  orgId: string;
  defaultProvider: AIProvider | null;
  allowedProviders: AIProvider[];
  /** Voice-provider axis (ElevenLabs integration): NULL = inherit brain provider. */
  voiceProvider: VoiceProvider | null;
  allowedVoiceProviders: VoiceProvider[];
  /**
   * Realtime voice-assistant purpose (floating voice modal, embed voice,
   * Agents, phone): NULL = inherit the voice-chat provider (voiceProvider),
   * which itself inherits the brain provider — so leaving both NULL keeps
   * every surface native to the picked chat provider.
   */
  realtimeVoiceProvider: VoiceProvider | null;
  /** Org-level ElevenLabs defaults (NULL = platform defaults). */
  elevenlabsTtsModel: string | null;
  elevenlabsSttModel: string | null;
  defaultElevenlabsVoice: string | null;
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
}

export interface PatchOrgAISettingsInput {
  defaultProvider?: AIProvider | null;
  allowedProviders?: AIProvider[];
  voiceProvider?: VoiceProvider | null;
  allowedVoiceProviders?: VoiceProvider[];
  realtimeVoiceProvider?: VoiceProvider | null;
  elevenlabsTtsModel?: string | null;
  elevenlabsSttModel?: string | null;
  defaultElevenlabsVoice?: string | null;
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
  // Identity
  assistantName?: string | null;
  avatarUrl?: string | null;
  // Behaviour
  systemPrompt?: string | null;
  welcomeMessage?: string | null;
  outOfScopeReply?: string | null;
  rules?: string[] | null;
  // Language
  defaultLanguage?: string | null;
  allowedLanguages?: string[] | null;
  alwaysRespondIn?: string | null;
  // Voice
  voiceId?: string | null;
  voiceSpeed?: number | null;
}

export interface KBAIOverrides {
  id: string;
  kbId: string;
  provider: AIProvider | null;
  /** Voice-provider override (NULL = inherit agent/org). */
  voiceProvider: VoiceProvider | null;
  /** Realtime voice-provider override (NULL = inherit agent/org/voice-chat). */
  realtimeVoiceProvider: VoiceProvider | null;
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
  voiceProvider?: VoiceProvider | null;
  realtimeVoiceProvider?: VoiceProvider | null;
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
  agentId: string | null;
  kbId: string | null;
  provider: AIProvider;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  voiceId: string | null;
  allowedLanguages: string[];
  defaultLanguage: string | null;
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
