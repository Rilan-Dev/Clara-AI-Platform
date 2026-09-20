/**
 * src/modules/ai-core/assistant-defaults-versions-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Immutable versioning for the Platform Default Assistant.
 *
 * The Default Assistant is a reusable BASELINE/TEMPLATE — never a live parent.
 * Versions are immutable; the singleton row carries the current pointer plus a
 * mutable draft. Restoring an old version creates a NEW version (§7 of the
 * implementation plan).
 */

import { query, queryOne, execute } from "@/lib/db";
import type { PlatformAssistantDefaults } from "./config-types";
import { getPlatformAssistantDefaults } from "./assistant-defaults-db";

/** Persona-shaped payload stored in each immutable version. */
export type PlatformAssistantDefaultsConfig = {
  assistant: {
    assistantName: string;
    avatarUrl: string | null;
    systemPrompt: string;
    welcomeMessage: string;
    outOfScopeReply: string;
    rules: string[];
    defaultLanguage: string;
    allowedLanguages: string[];
    alwaysRespondIn: string | null;
    voiceId: string | null;
    voiceSpeed: number | null;
  };
};

export type PlatformAssistantDefaultVersion = {
  versionNumber: number;
  configuration: PlatformAssistantDefaultsConfig;
  parentVersionNumber: number | null;
  changeSummary: string | null;
  createdByName: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type PlatformAssistantDefaultsState = {
  defaults: PlatformAssistantDefaults;
  currentVersion: number | null;
  current: PlatformAssistantDefaultVersion | null;
  draft: PlatformAssistantDefaultsConfig | null;
  draftUpdatedAt: string | null;
};

type Row = Record<string, unknown>;

const SINGLETON_ID = "30000000-0000-0000-0000-000000000001";

function toVersion(row: Row): PlatformAssistantDefaultVersion {
  return {
    versionNumber: Number(row.version_number),
    configuration: row.configuration_json as PlatformAssistantDefaultsConfig,
    parentVersionNumber:
      row.parent_version_number == null ? null : Number(row.parent_version_number),
    changeSummary: row.change_summary == null ? null : String(row.change_summary),
    createdByName: row.created_by_name == null ? null : String(row.created_by_name),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at),
  };
}

function configFromDefaults(defaults: PlatformAssistantDefaults): PlatformAssistantDefaultsConfig {
  return {
    assistant: {
      assistantName: defaults.assistantName,
      avatarUrl: defaults.avatarUrl,
      systemPrompt: defaults.systemPrompt,
      welcomeMessage: defaults.welcomeMessage,
      outOfScopeReply: defaults.outOfScopeReply,
      rules: defaults.rules,
      defaultLanguage: defaults.defaultLanguage,
      allowedLanguages: defaults.allowedLanguages,
      alwaysRespondIn: defaults.alwaysRespondIn,
      voiceId: defaults.voiceId,
      voiceSpeed: defaults.voiceSpeed,
    },
  };
}

function configFromDraftRow(value: unknown): PlatformAssistantDefaultsConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as PlatformAssistantDefaultsConfig;
  if (!raw.assistant || typeof raw.assistant.assistantName !== "string") return null;
  return raw;
}

/** Full state for the Default Assistant workspace (current + draft + versions meta). */
export async function getPlatformAssistantDefaultsState(): Promise<PlatformAssistantDefaultsState> {
  const defaults = await getPlatformAssistantDefaults();
  const row = await queryOne<Row>(
    "SELECT current_version, draft_configuration_json, draft_updated_at FROM platform_assistant_defaults WHERE id = $1",
    [SINGLETON_ID],
  );
  const currentVersion = row?.current_version == null ? null : Number(row.current_version);
  const current = currentVersion != null ? await getPlatformAssistantDefaultVersion(currentVersion) : null;
  return {
    defaults,
    currentVersion,
    current,
    draft: configFromDraftRow(row?.draft_configuration_json),
    draftUpdatedAt: row?.draft_updated_at == null ? null : String(row.draft_updated_at),
  };
}

/** Read a specific version ("current" resolves the current pointer). */
export async function getPlatformAssistantDefaultVersion(
  ref: number | "current",
): Promise<PlatformAssistantDefaultVersion | null> {
  if (ref === "current") {
    const row = await queryOne<Row>(
      `SELECT v.*, u.name AS created_by_name
         FROM platform_assistant_defaults d
         JOIN platform_assistant_default_versions v ON v.version_number = d.current_version
         LEFT JOIN users u ON u.id = v.created_by
        WHERE d.id = $1`,
      [SINGLETON_ID],
    );
    return row ? toVersion(row) : null;
  }
  const row = await queryOne<Row>(
    `SELECT v.*, u.name AS created_by_name
       FROM platform_assistant_default_versions v
       LEFT JOIN users u ON u.id = v.created_by
      WHERE v.version_number = $1`,
    [ref],
  );
  return row ? toVersion(row) : null;
}

export async function listPlatformAssistantDefaultVersions(limit = 50): Promise<PlatformAssistantDefaultVersion[]> {
  const rows = await query<Row>(
    `SELECT v.*, u.name AS created_by_name
       FROM platform_assistant_default_versions v
       LEFT JOIN users u ON u.id = v.created_by
      ORDER BY v.version_number DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toVersion);
}

/** Save the mutable draft (does NOT touch versions or the live singleton). */
export async function putPlatformAssistantDefaultsDraft(
  config: PlatformAssistantDefaultsConfig,
  userId: string | null,
): Promise<void> {
  await execute(
    `UPDATE platform_assistant_defaults
        SET draft_configuration_json = $2::jsonb, draft_updated_by = $3, draft_updated_at = now()
      WHERE id = $1`,
    [SINGLETON_ID, JSON.stringify(config), userId],
  );
}

/**
 * Save the draft as a NEW immutable version and make it current. Also applies
 * the persona onto the singleton row (so legacy creation-time seeding keeps
 * working during the compat window) — existing agents are never touched.
 */
export async function savePlatformAssistantDefaultsVersion(
  input: { changeSummary?: string | null; config?: PlatformAssistantDefaultsConfig },
  userId: string | null,
): Promise<PlatformAssistantDefaultVersion> {
  const state = await getPlatformAssistantDefaultsState();
  const config = input.config ?? state.draft ?? configFromDefaults(state.defaults);
  const nextNumber = (await maxVersionNumber()) + 1;

  await execute(
    `INSERT INTO platform_assistant_default_versions (version_number, configuration_json, parent_version_number, change_summary, created_by)
     VALUES ($1, $2::jsonb, $3, $4, $5)`,
    [
      nextNumber,
      JSON.stringify(config),
      state.currentVersion,
      input.changeSummary?.trim() || null,
      userId,
    ],
  );

  const a = config.assistant;
  await execute(
    `UPDATE platform_assistant_defaults SET
        current_version = $2,
        assistant_name = $3, avatar_url = $4, system_prompt = $5, welcome_message = $6,
        out_of_scope_reply = $7, rules = $8::jsonb, default_language = $9,
        allowed_languages = $10, always_respond_in = $11, voice_id = $12, voice_speed = $13,
        updated_by = $14, updated_at = now()
      WHERE id = $1`,
    [
      SINGLETON_ID,
      nextNumber,
      a.assistantName,
      a.avatarUrl,
      a.systemPrompt,
      a.welcomeMessage,
      a.outOfScopeReply,
      JSON.stringify(a.rules),
      a.defaultLanguage,
      a.allowedLanguages,
      a.alwaysRespondIn,
      a.voiceId,
      a.voiceSpeed,
      userId,
    ],
  );

  const version = await getPlatformAssistantDefaultVersion(nextNumber);
  if (!version) throw new Error("Failed to read the saved default assistant version.");
  return version;
}

/** Restore an old version by creating a NEW version (history untouched). */
export async function restorePlatformAssistantDefaultsVersion(
  versionNumber: number,
  userId: string | null,
): Promise<PlatformAssistantDefaultVersion> {
  const source = await getPlatformAssistantDefaultVersion(versionNumber);
  if (!source) throw new Error(`Default Assistant version ${versionNumber} not found.`);
  return savePlatformAssistantDefaultsVersion(
    {
      changeSummary: `Restore of v${versionNumber}`,
      config: source.configuration,
    },
    userId,
  );
}

async function maxVersionNumber(): Promise<number> {
  const row = await queryOne<{ max: number | null }>(
    "SELECT max(version_number) AS max FROM platform_assistant_default_versions",
  );
  return row?.max ?? 0;
}
