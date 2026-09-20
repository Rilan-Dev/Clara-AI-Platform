/**
 * src/modules/ai-core/assistant-defaults-db.ts
 * Platform-level assistant persona defaults (Identity / Behaviour /
 * Language / Voice) — a single row managed by the platform admin.
 *
 * Consumers:
 *  - /api/platform/assistant-defaults (admin editor in Settings -> AI
 *    Configuration)
 *  - Agent creation (agents module) — new agents start with these values
 *  - KB creation (knowledge-bases module + workspace wizard) — the KB's
 *    assistant_config starts with these values
 *
 * IMPORTANT contract: these values are only READ AT CREATION TIME and copied
 * onto the new row. Editing them later must never rewrite existing projects,
 * agents or knowledge bases — those values belong to the organisations.
 */

import { queryOne } from "@/lib/db";
import type {
  PatchPlatformAssistantDefaultsInput,
  PlatformAssistantDefaults,
} from "./config-types";

/** Fixed singleton row id (see migration 037). */
const SINGLETON_ID = "30000000-0000-0000-0000-000000000001";

type Row = Record<string, unknown>;

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function toModel(row: Row): PlatformAssistantDefaults {
  return {
    id: String(row.id),
    // Identity
    assistantName:
      typeof row.assistant_name === "string" && row.assistant_name.trim()
        ? row.assistant_name
        : "Clara",
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    // Behaviour
    systemPrompt:
      typeof row.system_prompt === "string" ? row.system_prompt : "",
    welcomeMessage:
      typeof row.welcome_message === "string" ? row.welcome_message : "",
    outOfScopeReply:
      typeof row.out_of_scope_reply === "string" ? row.out_of_scope_reply : "",
    rules: stringList(row.rules, []),
    // Generation (migration 042 — mirrors assistant_configs defaults)
    temperature: row.temperature == null ? 0.7 : Number(row.temperature),
    maxTokens: row.max_tokens == null ? 500 : Number(row.max_tokens),
    citeSources: row.cite_sources == null ? true : Boolean(row.cite_sources),
    strictMode: row.strict_mode == null ? true : Boolean(row.strict_mode),
    // Language
    defaultLanguage:
      typeof row.default_language === "string" && row.default_language.trim()
        ? row.default_language
        : "en",
    allowedLanguages: stringList(row.allowed_languages, ["en"]),
    alwaysRespondIn:
      typeof row.always_respond_in === "string" ? row.always_respond_in : null,
    // Voice
    voiceId: typeof row.voice_id === "string" ? row.voice_id : null,
    voiceSpeed:
      row.voice_speed == null
        ? null
        : typeof row.voice_speed === "number"
          ? row.voice_speed
          : Number(row.voice_speed),
    // Branding
    primaryColour:
      typeof row.primary_colour === "string" && row.primary_colour.trim()
        ? row.primary_colour
        : "#6366f1",
    accentColour:
      typeof row.accent_colour === "string" && row.accent_colour.trim()
        ? row.accent_colour
        : "#a5b4fc",
    launcherColour: typeof row.launcher_colour === "string" ? row.launcher_colour : null,
    updatedAt: String(row.updated_at),
  };
}

/**
 * Read the singleton defaults row. Self-healing: if the row is missing
 * (e.g. a fresh environment where the seed insert raced), it is created
 * with the SQL column defaults.
 */
export async function getPlatformAssistantDefaults(): Promise<PlatformAssistantDefaults> {
  const existing = await queryOne<Row>(
    "SELECT * FROM platform_assistant_defaults WHERE id = $1",
    [SINGLETON_ID],
  );
  if (existing) return toModel(existing);

  const inserted = await queryOne<Row>(
    `INSERT INTO platform_assistant_defaults (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [SINGLETON_ID],
  );
  if (inserted) return toModel(inserted);

  // Lost an insert race — re-read.
  const raced = await queryOne<Row>(
    "SELECT * FROM platform_assistant_defaults WHERE id = $1",
    [SINGLETON_ID],
  );
  if (!raced) {
    throw new Error("platform_assistant_defaults row could not be established");
  }
  return toModel(raced);
}

function normalizeStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColour(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : fallback;
}

/** Update the singleton defaults row (platform admin only, enforced at API layer). */
export async function updatePlatformAssistantDefaults(
  input: PatchPlatformAssistantDefaultsInput,
  updatedBy?: string | null,
): Promise<PlatformAssistantDefaults> {
  const current = await getPlatformAssistantDefaults();

  const next = {
    assistantName: input.assistantName?.trim() || current.assistantName,
    avatarUrl:
      input.avatarUrl !== undefined
        ? normalizeStringOrNull(input.avatarUrl)
        : current.avatarUrl,
    // NOT NULL columns — a null/empty input keeps the current value instead
    // of crashing on .trim() or writing an empty persona.
    systemPrompt: input.systemPrompt?.trim() || current.systemPrompt,
    welcomeMessage: input.welcomeMessage?.trim() || current.welcomeMessage,
    outOfScopeReply: input.outOfScopeReply?.trim() || current.outOfScopeReply,
    rules: input.rules !== undefined ? stringList(input.rules, []) : current.rules,
    // Generation — inputs are clamped to the same ranges the agent configs
    // enforce, so the platform default can never seed an invalid agent row.
    temperature:
      input.temperature != null
        ? clampNumber(input.temperature, 0, 1)
        : current.temperature,
    maxTokens:
      input.maxTokens != null
        ? clampNumber(Math.round(input.maxTokens), 50, 4000)
        : current.maxTokens,
    citeSources: input.citeSources != null ? input.citeSources : current.citeSources,
    strictMode: input.strictMode != null ? input.strictMode : current.strictMode,
    defaultLanguage:
      input.defaultLanguage?.trim().toLowerCase() || current.defaultLanguage,
    allowedLanguages:
      input.allowedLanguages !== undefined
        ? stringList(
            input.allowedLanguages.map((l) => l.trim().toLowerCase()),
            current.allowedLanguages,
          )
        : current.allowedLanguages,
    alwaysRespondIn:
      input.alwaysRespondIn !== undefined
        ? normalizeStringOrNull(input.alwaysRespondIn)
        : current.alwaysRespondIn,
    voiceId:
      input.voiceId !== undefined ? normalizeStringOrNull(input.voiceId) : current.voiceId,
    voiceSpeed:
      input.voiceSpeed !== undefined ? input.voiceSpeed : current.voiceSpeed,
    primaryColour: input.primaryColour !== undefined
      ? normalizeColour(input.primaryColour, current.primaryColour)
      : current.primaryColour,
    accentColour: input.accentColour !== undefined
      ? normalizeColour(input.accentColour, current.accentColour)
      : current.accentColour,
    launcherColour:
      input.launcherColour !== undefined
        ? normalizeStringOrNull(input.launcherColour)
        : current.launcherColour,
  };

  if (!next.assistantName) {
    throw new Error("Assistant name cannot be empty.");
  }
  if (!next.defaultLanguage) {
    throw new Error("Default language cannot be empty.");
  }
  if (next.allowedLanguages.length === 0) {
    throw new Error("Allowed languages must have at least one language.");
  }
  if (next.voiceSpeed != null && (next.voiceSpeed < 0.25 || next.voiceSpeed > 4.0)) {
    throw new Error("Voice speed must be between 0.25 and 4.0.");
  }

  const row = await queryOne<Row>(
    `UPDATE platform_assistant_defaults SET
       assistant_name = $2,
       avatar_url = $3,
       system_prompt = $4,
       welcome_message = $5,
       out_of_scope_reply = $6,
       rules = $7::jsonb,
       temperature = $8,
       max_tokens = $9,
       cite_sources = $10,
       strict_mode = $11,
       default_language = $12,
       allowed_languages = $13,
       always_respond_in = $14,
       voice_id = $15,
       voice_speed = $16,
       primary_colour = $17,
       accent_colour = $18,
       launcher_colour = $19,
       updated_by = $20,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      SINGLETON_ID,
      next.assistantName,
      next.avatarUrl,
      next.systemPrompt,
      next.welcomeMessage,
      next.outOfScopeReply,
      JSON.stringify(next.rules),
      next.temperature,
      next.maxTokens,
      next.citeSources,
      next.strictMode,
      next.defaultLanguage,
      next.allowedLanguages,
      next.alwaysRespondIn,
      next.voiceId,
      next.voiceSpeed,
      next.primaryColour,
      next.accentColour,
      next.launcherColour,
      updatedBy ?? null,
    ],
  );
  if (!row) {
    throw new Error("Failed to update platform assistant defaults");
  }
  return toModel(row);
}
