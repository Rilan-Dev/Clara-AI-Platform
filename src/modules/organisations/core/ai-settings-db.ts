import { queryOne } from "@/lib/db";
import type {
  AIProvider,
  OrgAISettings,
  PatchOrgAISettingsInput,
  ProviderScopedList,
} from "@/modules/ai-core/config-types";

type Row = Record<string, unknown>;

function normalizeProviderList(input: unknown): AIProvider[] {
  if (!Array.isArray(input)) return ["openai", "gemini"];
  const values = input
    .filter((value): value is AIProvider => value === "openai" || value === "gemini");
  return values.length > 0 ? values : ["openai", "gemini"];
}

function normalizeProviderScopedList(input: unknown): ProviderScopedList {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const scoped: ProviderScopedList = {};
  for (const provider of ["openai", "gemini"] as const) {
    const values = record[provider];
    if (!Array.isArray(values)) continue;
    scoped[provider] = values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return scoped;
}

function toOrgAISettings(row: Row): OrgAISettings {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    defaultProvider:
      row.default_provider === "openai" || row.default_provider === "gemini"
        ? row.default_provider
        : null,
    allowedProviders: normalizeProviderList(row.allowed_providers),
    allowedChatModels: normalizeProviderScopedList(row.allowed_chat_models),
    allowedEmbeddingModels: normalizeProviderScopedList(row.allowed_embedding_models),
    allowedRealtimeModels: normalizeProviderScopedList(row.allowed_realtime_models),
    allowedVoices: normalizeProviderScopedList(row.allowed_voices),
    defaultChatModel:
      typeof row.default_chat_model === "string" ? row.default_chat_model : null,
    defaultEmbeddingModel:
      typeof row.default_embedding_model === "string"
        ? row.default_embedding_model
        : null,
    defaultRealtimeModel:
      typeof row.default_realtime_model === "string" ? row.default_realtime_model : null,
    defaultTranscriptionModel:
      typeof row.default_transcription_model === "string"
        ? row.default_transcription_model
        : null,
    maxChatTokens:
      typeof row.max_chat_tokens === "number" ? row.max_chat_tokens : row.max_chat_tokens != null ? Number(row.max_chat_tokens) : null,
    maxRealtimeTokens:
      typeof row.max_realtime_tokens === "number"
        ? row.max_realtime_tokens
        : row.max_realtime_tokens != null
        ? Number(row.max_realtime_tokens)
        : null,
    maxTemperature:
      typeof row.max_temperature === "number"
        ? row.max_temperature
        : row.max_temperature != null
        ? Number(row.max_temperature)
        : null,
    enablePublicEmbed: Boolean(row.enable_public_embed),
    enableVoice: Boolean(row.enable_voice),
    enableRealtime: Boolean(row.enable_realtime),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getOrgAISettings(orgId: string): Promise<OrgAISettings | null> {
  const row = await queryOne<Row>("SELECT * FROM org_ai_settings WHERE org_id = $1", [orgId]);
  return row ? toOrgAISettings(row) : null;
}

export async function upsertOrgAISettings(
  orgId: string,
  input: PatchOrgAISettingsInput,
): Promise<OrgAISettings> {
  const current = await getOrgAISettings(orgId);
  const next = {
    defaultProvider: input.defaultProvider ?? current?.defaultProvider ?? null,
    allowedProviders: input.allowedProviders ?? current?.allowedProviders ?? ["openai", "gemini"],
    allowedChatModels: input.allowedChatModels ?? current?.allowedChatModels ?? {},
    allowedEmbeddingModels:
      input.allowedEmbeddingModels ?? current?.allowedEmbeddingModels ?? {},
    allowedRealtimeModels:
      input.allowedRealtimeModels ?? current?.allowedRealtimeModels ?? {},
    allowedVoices: input.allowedVoices ?? current?.allowedVoices ?? {},
    defaultChatModel:
      input.defaultChatModel !== undefined
        ? normalizeStringOrNull(input.defaultChatModel)
        : current?.defaultChatModel ?? null,
    defaultEmbeddingModel:
      input.defaultEmbeddingModel !== undefined
        ? normalizeStringOrNull(input.defaultEmbeddingModel)
        : current?.defaultEmbeddingModel ?? null,
    defaultRealtimeModel:
      input.defaultRealtimeModel !== undefined
        ? normalizeStringOrNull(input.defaultRealtimeModel)
        : current?.defaultRealtimeModel ?? null,
    defaultTranscriptionModel:
      input.defaultTranscriptionModel !== undefined
        ? normalizeStringOrNull(input.defaultTranscriptionModel)
        : current?.defaultTranscriptionModel ?? null,
    maxChatTokens:
      input.maxChatTokens !== undefined ? input.maxChatTokens : current?.maxChatTokens ?? null,
    maxRealtimeTokens:
      input.maxRealtimeTokens !== undefined
        ? input.maxRealtimeTokens
        : current?.maxRealtimeTokens ?? null,
    maxTemperature:
      input.maxTemperature !== undefined ? input.maxTemperature : current?.maxTemperature ?? null,
    enablePublicEmbed:
      input.enablePublicEmbed !== undefined
        ? input.enablePublicEmbed
        : current?.enablePublicEmbed ?? true,
    enableVoice:
      input.enableVoice !== undefined ? input.enableVoice : current?.enableVoice ?? true,
    enableRealtime:
      input.enableRealtime !== undefined
        ? input.enableRealtime
        : current?.enableRealtime ?? true,
  };

  const row = await queryOne<Row>(
    `INSERT INTO org_ai_settings (
       org_id,
       default_provider,
       allowed_providers,
       allowed_chat_models,
       allowed_embedding_models,
       allowed_realtime_models,
       allowed_voices,
       default_chat_model,
       default_embedding_model,
       default_realtime_model,
       default_transcription_model,
       max_chat_tokens,
       max_realtime_tokens,
       max_temperature,
       enable_public_embed,
       enable_voice,
       enable_realtime
     )
     VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb,
       $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
     )
     ON CONFLICT (org_id)
     DO UPDATE SET
       default_provider = EXCLUDED.default_provider,
       allowed_providers = EXCLUDED.allowed_providers,
       allowed_chat_models = EXCLUDED.allowed_chat_models,
       allowed_embedding_models = EXCLUDED.allowed_embedding_models,
       allowed_realtime_models = EXCLUDED.allowed_realtime_models,
       allowed_voices = EXCLUDED.allowed_voices,
       default_chat_model = EXCLUDED.default_chat_model,
       default_embedding_model = EXCLUDED.default_embedding_model,
       default_realtime_model = EXCLUDED.default_realtime_model,
       default_transcription_model = EXCLUDED.default_transcription_model,
       max_chat_tokens = EXCLUDED.max_chat_tokens,
       max_realtime_tokens = EXCLUDED.max_realtime_tokens,
       max_temperature = EXCLUDED.max_temperature,
       enable_public_embed = EXCLUDED.enable_public_embed,
       enable_voice = EXCLUDED.enable_voice,
       enable_realtime = EXCLUDED.enable_realtime,
       updated_at = now()
     RETURNING *`,
    [
      orgId,
      next.defaultProvider,
      next.allowedProviders,
      JSON.stringify(next.allowedChatModels),
      JSON.stringify(next.allowedEmbeddingModels),
      JSON.stringify(next.allowedRealtimeModels),
      JSON.stringify(next.allowedVoices),
      next.defaultChatModel,
      next.defaultEmbeddingModel,
      next.defaultRealtimeModel,
      next.defaultTranscriptionModel,
      next.maxChatTokens,
      next.maxRealtimeTokens,
      next.maxTemperature,
      next.enablePublicEmbed,
      next.enableVoice,
      next.enableRealtime,
    ],
  );

  if (!row) {
    throw new Error(`Failed to upsert org AI settings for org ${orgId}`);
  }
  return toOrgAISettings(row);
}
