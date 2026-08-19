import type { AIProvider } from "@/modules/ai-core/config-types";

export type ProjectLanguage = {
  id: string;
  orgId: string;
  code: string;
  name: string;
  nativeName: string | null;
  enabled: boolean;
};

export type ProjectVoice = {
  id: string;
  orgId: string;
  provider: AIProvider;
  voiceId: string;
  name: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
};

export type ProjectAISettings = {
  id: string;
  projectId: string;
  orgId: string;
  provider: AIProvider | null;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  defaultLanguageId: string | null;
  defaultVoiceId: string | null;
  languages: ProjectLanguage[];
  voices: ProjectVoice[];
};

export type PatchProjectAISettingsInput = Partial<{
  provider: AIProvider | null;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  defaultLanguageId: string | null;
  defaultVoiceId: string | null;
  languageIds: string[];
  voiceIds: string[];
}>;

export type ProjectRuntimeSelectionInput = {
  provider: AIProvider;
  assistantLanguage: string | null | undefined;
  assistantVoice: string | null | undefined;
  assignedLanguages: Array<{ code: string; enabled: boolean }>;
  assignedVoices: Array<{ provider: AIProvider; voiceId: string; enabled: boolean }>;
  defaultLanguageCode?: string | null;
  defaultVoice?: { provider: AIProvider; voiceId: string } | null;
};

export type ProjectRuntimeSelection = {
  allowedLanguages: string[];
  defaultLanguage: string | null;
  voiceId: string | null;
};

/**
 * Applies the project boundary to assistant-level preferences. The assistant
 * can narrow a project's assignment, but it can never escape it.
 */
export function resolveProjectRuntimeSelection(
  input: ProjectRuntimeSelectionInput,
): ProjectRuntimeSelection {
  const languages = input.assignedLanguages
    .filter((language) => language.enabled)
    .map((language) => language.code.trim())
    .filter(Boolean);
  const uniqueLanguages = [...new Set(languages)];

  const assistantLanguage = input.assistantLanguage?.trim() || null;
  const defaultLanguage =
    (assistantLanguage && uniqueLanguages.includes(assistantLanguage) ? assistantLanguage : null) ??
    (input.defaultLanguageCode && uniqueLanguages.includes(input.defaultLanguageCode)
      ? input.defaultLanguageCode
      : null) ??
    uniqueLanguages[0] ?? null;

  const voices = input.assignedVoices.filter(
    (voice) => voice.enabled && voice.provider === input.provider,
  );
  const assistantVoice = input.assistantVoice?.trim() || null;
  const voiceId =
    (assistantVoice && voices.some((voice) => voice.voiceId === assistantVoice)
      ? assistantVoice
      : null) ??
    (input.defaultVoice?.provider === input.provider &&
    voices.some((voice) => voice.voiceId === input.defaultVoice?.voiceId)
      ? input.defaultVoice.voiceId
      : null) ??
    voices[0]?.voiceId ?? null;

  return {
    allowedLanguages: uniqueLanguages,
    defaultLanguage,
    voiceId,
  };
}
