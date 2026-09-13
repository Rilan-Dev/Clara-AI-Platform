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
       default_language = $8,
       allowed_languages = $9,
       always_respond_in = $10,
       voice_id = $11,
       voice_speed = $12,
       updated_by = $13,
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
      next.defaultLanguage,
      next.allowedLanguages,
      next.alwaysRespondIn,
      next.voiceId,
      next.voiceSpeed,
      updatedBy ?? null,
    ],
  );
  if (!row) {
    throw new Error("Failed to update platform assistant defaults");
  }
  return toModel(row);
}
