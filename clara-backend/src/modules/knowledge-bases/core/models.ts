/**
 * src/modules/knowledge-bases/core/models.ts
 * TypeScript types for knowledge bases and assistant configs.
 */

// ── Knowledge Base ─────────────────────────────────────────────────────────────

export type KnowledgeBase = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  qdrantCollection: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CreateKbInput = {
  name: string;
  description?: string;
};

export type UpdateKbInput = Partial<Pick<CreateKbInput, "name" | "description"> & {
  status: "active" | "archived";
}>;

// ── Assistant Config ──────────────────────────────────────────────────────────

export type AssistantConfig = {
  id: string;
  kbId: string;

  // Identity
  assistantName: string;
  avatarUrl: string | null;

  // Behaviour
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];          // plain-English rule strings

  // Language
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;

  // Voice
  voiceId: string;
  speed: number;

  // Generation
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;

  // Branding / colours
  primaryColour: string;
  accentColour: string;
  launcherColour: string;
  launcherColour: string;

  // Widget layout & design
  widgetTheme: "light" | "dark";
  widgetPosition: "bottom-right" | "bottom-left";
  widgetButtonSize: number;
  widgetBorderRadius: number;
  widgetFontFamily: string;
  widgetChatHeight: number;
  widgetShowBranding: boolean;
  widgetLauncherLabel: string | null;
  // Full design control
  widgetMode: "floating" | "inline" | "headless";
  customCss: string | null;
  customLauncherSvg: string | null;
  customHeaderHtml: string | null;
  customPoweredBy: string | null;

  createdAt: string;
  updatedAt: string;
};

/** Full replace (PUT) — all fields required except id/kbId/timestamps */
export type PutAssistantConfigInput = Omit<AssistantConfig, "id" | "kbId" | "createdAt" | "updatedAt">;

/** Partial update (PATCH) — any subset of config fields */
export type PatchAssistantConfigInput = Partial<PutAssistantConfigInput>;

// ── KB AI Overrides ───────────────────────────────────────────────────────────

export type AIProvider = "openai" | "gemini";

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

export type PatchKBAIOverridesInput = Partial<{
  provider: AIProvider | null;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  disableVoice: boolean;
  disablePublicEmbed: boolean;
}>;
