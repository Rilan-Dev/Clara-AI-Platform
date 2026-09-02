import type { AIProvider } from "@/modules/ai-core/config-types";

export type ProjectLanguage = { id: string; orgId: string; code: string; name: string; nativeName: string | null; enabled: boolean };
export type ProjectVoice = { id: string; orgId: string; provider: AIProvider; voiceId: string; name: string; enabled: boolean; metadata: Record<string, unknown> };
export type ProjectAISettings = { id: string; projectId: string; orgId: string; provider: AIProvider | null; chatModel: string | null; embeddingModel: string | null; realtimeModel: string | null; transcriptionModel: string | null; defaultLanguageId: string | null; defaultVoiceId: string | null; languages: ProjectLanguage[]; voices: ProjectVoice[] };
export type PatchProjectAISettingsInput = Partial<{ provider: AIProvider | null; chatModel: string | null; embeddingModel: string | null; realtimeModel: string | null; transcriptionModel: string | null; defaultLanguageId: string | null; defaultVoiceId: string | null; languageIds: string[]; voiceIds: string[] }>;
export type ProjectRuntimeSelectionInput = {
  provider: AIProvider;
  assistantLanguage: string | null | undefined;
  assistantAllowedLanguages?: string[] | null;
  assistantVoice: string | null | undefined;
  assignedLanguages: Array<{ code: string; enabled: boolean }>;
  assignedVoices: Array<{ provider: AIProvider; voiceId: string; enabled: boolean }>;
  defaultLanguageCode?: string | null;
  defaultVoice?: { provider: AIProvider; voiceId: string } | null;
};
export type ProjectRuntimeSelection = { allowedLanguages: string[]; defaultLanguage: string | null; voiceId: string | null };

/**
 * Resolves the runtime preferences for an assistant.
 *
 * The KB assistant configuration is the explicit user-facing source of truth
 * for its language list and selected voice. Project assignments remain the
 * fallback for older projects that do not have those assistant preferences.
 * Voice/provider validation is still performed by the shared AI resolver.
 */
export function resolveProjectRuntimeSelection(input: ProjectRuntimeSelectionInput): ProjectRuntimeSelection {
  const assignedLanguages = input.assignedLanguages
    .filter((language) => language.enabled)
    .map((language) => language.code.trim().toLowerCase())
    .filter(Boolean);
  const configuredLanguages = (input.assistantAllowedLanguages ?? [])
    .map((language) => language.trim().toLowerCase())
    .filter(Boolean);
  const uniqueLanguages = [...new Set(configuredLanguages.length > 0 ? configuredLanguages : assignedLanguages)];

  const assistantLanguage = input.assistantLanguage?.trim().toLowerCase() || null;
  const configuredDefaultLanguage = input.defaultLanguageCode?.trim().toLowerCase() || null;
  const defaultLanguage =
    (assistantLanguage && uniqueLanguages.includes(assistantLanguage) ? assistantLanguage : null) ??
    (configuredDefaultLanguage && uniqueLanguages.includes(configuredDefaultLanguage) ? configuredDefaultLanguage : null) ??
    uniqueLanguages[0] ??
    null;

  const voices = input.assignedVoices.filter((voice) => voice.enabled && voice.provider === input.provider);
  const assistantVoice = input.assistantVoice?.trim() || null;
  const configuredVoice =
    assistantVoice &&
    (voices.length === 0 || voices.some((voice) => voice.voiceId === assistantVoice))
      ? assistantVoice
      : null;
  const voiceId =
    configuredVoice ??
    (input.defaultVoice?.provider === input.provider && voices.some((voice) => voice.voiceId === input.defaultVoice?.voiceId)
      ? input.defaultVoice.voiceId
      : null) ??
    voices[0]?.voiceId ??
    null;

  return { allowedLanguages: uniqueLanguages, defaultLanguage, voiceId };
}