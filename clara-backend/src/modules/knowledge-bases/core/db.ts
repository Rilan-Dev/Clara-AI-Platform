/**
 * src/modules/knowledge-bases/core/db.ts
 * All PostgreSQL queries for knowledge_bases and assistant_configs.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "@/lib/db";
import type {
  KnowledgeBase,
  AssistantConfig,
  CreateKbInput,
  UpdateKbInput,
  PutAssistantConfigInput,
  PatchAssistantConfigInput,
} from "./models";
import { snapshotConfig } from "./snapshots-db";

// ── Collection name generator ─────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "kb";
}

/**
 * Generates a stable, unique Qdrant collection name for a knowledge base.
 * Format: kb_{8-char-uuid}_{slug}
 * Example: kb_af80156d_hr_policy
 */
function makeCollectionName(kbId: string, name: string): string {
  const shortId = kbId.replace(/-/g, "").slice(0, 8);
  return `kb_${shortId}_${slugify(name)}`;
}

// ── Row → model mappers ───────────────────────────────────────────────────────

function toKb(row: Record<string, unknown>): KnowledgeBase {
  return {
    id:               String(row.id),
    projectId:        String(row.project_id),
    name:             String(row.name),
    description:      row.description != null ? String(row.description) : null,
    qdrantCollection: String(row.qdrant_collection),
    status:           (row.status as "active" | "archived") ?? "active",
    createdAt:        String(row.created_at),
    updatedAt:        String(row.updated_at),
  };
}

function toConfig(row: Record<string, unknown>): AssistantConfig {
  // rules is stored as JSONB — pg driver parses it automatically to JS array
  const rawRules = row.rules;
  const rules: string[] = Array.isArray(rawRules)
    ? (rawRules as string[])
    : [];

  const rawLangs = row.allowed_languages;
  const allowedLanguages: string[] = Array.isArray(rawLangs)
    ? (rawLangs as string[])
    : ["en"];

  return {
    id:              String(row.id),
    kbId:            String(row.kb_id),
    assistantName:   String(row.assistant_name),
    avatarUrl:       row.avatar_url != null ? String(row.avatar_url) : null,
    systemPrompt:    String(row.system_prompt),
    welcomeMessage:  String(row.welcome_message),
    outOfScopeReply: String(row.out_of_scope_reply),
    rules,
    defaultLanguage:  String(row.default_language),
    allowedLanguages,
    alwaysRespondIn:  row.always_respond_in != null ? String(row.always_respond_in) : null,
    voiceId:          String(row.voice_id),
    speed:            Number(row.speed),
    temperature:      Number(row.temperature),
    maxTokens:        Number(row.max_tokens),
    citeSources:      Boolean(row.cite_sources),
    strictMode:       Boolean(row.strict_mode),
    primaryColour:    String(row.primary_colour),
    accentColour:     String(row.accent_colour),
    widgetTheme:        (row.widget_theme as "light" | "dark") ?? "light",
    widgetPosition:     (row.widget_position as "bottom-right" | "bottom-left") ?? "bottom-right",
    widgetButtonSize:   Number(row.widget_button_size ?? 56),
    widgetBorderRadius: Number(row.widget_border_radius ?? 20),
    widgetFontFamily:   String(row.widget_font_family ?? "system-ui,sans-serif"),
    widgetChatHeight:   Number(row.widget_chat_height ?? 580),
    widgetShowBranding: row.widget_show_branding !== false,
    widgetLauncherLabel: row.widget_launcher_label != null ? String(row.widget_launcher_label) : null,
    widgetMode:          (row.widget_mode as "floating" | "inline" | "headless") ?? "floating",
    customCss:           row.custom_css != null ? String(row.custom_css) : null,
    customLauncherSvg:   row.custom_launcher_svg != null ? String(row.custom_launcher_svg) : null,
    customHeaderHtml:    row.custom_header_html != null ? String(row.custom_header_html) : null,
    customPoweredBy:     row.custom_powered_by != null ? String(row.custom_powered_by) : null,
    createdAt:        String(row.created_at),
    updatedAt:        String(row.updated_at),
  };
}

// ── Knowledge Base CRUD ───────────────────────────────────────────────────────

/**
 * Creates a KB row and its default assistant_config row in one transaction.
 * Returns the KB. The Qdrant collection is created by the API handler
 * (not here) so DB and Qdrant operations can be handled/rolled-back cleanly.
 */
export async function createKnowledgeBase(
  projectId: string,
  input: CreateKbInput
): Promise<KnowledgeBase> {
  return withTransaction(async (client) => {
    // 1. Insert KB
    const kbId = randomUUID();
    const collectionName = makeCollectionName(kbId, input.name);

    const kbResult = await client.query<Record<string, unknown>>(
      `INSERT INTO knowledge_bases (id, project_id, name, description, qdrant_collection)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [kbId, projectId, input.name, input.description ?? null, collectionName]
    );
    const kbRow = kbResult.rows[0]!;

    // 2. Insert default assistant_config (all defaults from schema)
    await client.query(
      `INSERT INTO assistant_configs (kb_id) VALUES ($1)`,
      [kbId]
    );

    return toKb(kbRow);
  });
}

export async function listKnowledgeBases(projectId: string): Promise<KnowledgeBase[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM knowledge_bases WHERE project_id = $1 ORDER BY name ASC",
    [projectId]
  );
  return rows.map(toKb);
}

export async function getKnowledgeBaseById(id: string): Promise<KnowledgeBase | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM knowledge_bases WHERE id = $1",
    [id]
  );
  return row ? toKb(row) : null;
}

export async function updateKnowledgeBase(
  id: string,
  input: UpdateKbInput
): Promise<KnowledgeBase | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (input.name        !== undefined) { sets.push(`name = $${i++}`);        params.push(input.name); }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); params.push(input.description); }
  if (input.status      !== undefined) { sets.push(`status = $${i++}`);      params.push(input.status); }

  if (sets.length === 0) return getKnowledgeBaseById(id);

  params.push(id);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE knowledge_bases SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );
  return row ? toKb(row) : null;
}

export async function deleteKnowledgeBase(id: string): Promise<string | null> {
  // Returns the qdrant_collection name so the caller can delete it from Qdrant.
  const row = await queryOne<{ qdrant_collection: string }>(
    "DELETE FROM knowledge_bases WHERE id = $1 RETURNING qdrant_collection",
    [id]
  );
  return row ? row.qdrant_collection : null;
}

// ── Assistant Config CRUD ─────────────────────────────────────────────────────

export async function getAssistantConfig(kbId: string): Promise<AssistantConfig | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM assistant_configs WHERE kb_id = $1",
    [kbId]
  );
  return row ? toConfig(row) : null;
}

/** Full replace — overwrites every editable field. Auto-snapshots current before writing. */
export async function putAssistantConfig(
  kbId: string,
  input: PutAssistantConfigInput
): Promise<AssistantConfig> {
  // Snapshot current config before overwrite (best-effort)
  const current = await getAssistantConfig(kbId);
  if (current) {
    snapshotConfig(current).catch(() => {});
  }
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE assistant_configs SET
       assistant_name      = $1,
       avatar_url          = $2,
       system_prompt       = $3,
       welcome_message     = $4,
       out_of_scope_reply  = $5,
       rules               = $6::jsonb,
       default_language    = $7,
       allowed_languages   = $8,
       always_respond_in   = $9,
       voice_id            = $10,
       speed               = $11,
       temperature         = $12,
       max_tokens          = $13,
       cite_sources        = $14,
       strict_mode         = $15,
       primary_colour      = $16,
       accent_colour       = $17,
       widget_theme        = $18,
       widget_position     = $19,
       widget_button_size  = $20,
       widget_border_radius= $21,
       widget_font_family  = $22,
       widget_chat_height  = $23,
       widget_show_branding= $24,
       widget_launcher_label=$25
     WHERE kb_id = $26
     RETURNING *`,
    [
      input.assistantName,
      input.avatarUrl ?? null,
      input.systemPrompt,
      input.welcomeMessage,
      input.outOfScopeReply,
      JSON.stringify(input.rules),
      input.defaultLanguage,
      input.allowedLanguages,
      input.alwaysRespondIn ?? null,
      input.voiceId,
      input.speed,
      input.temperature,
      input.maxTokens,
      input.citeSources,
      input.strictMode,
      input.primaryColour,
      input.accentColour,
      input.widgetTheme        ?? "light",
      input.widgetPosition     ?? "bottom-right",
      input.widgetButtonSize   ?? 56,
      input.widgetBorderRadius ?? 20,
      input.widgetFontFamily   ?? "system-ui,sans-serif",
      input.widgetChatHeight   ?? 580,
      input.widgetShowBranding ?? true,
      input.widgetLauncherLabel ?? null,
      kbId,
    ]
  );
  if (!row) throw new Error(`AssistantConfig not found for kbId ${kbId}`);
  return toConfig(row);
}

/** Partial update — only the supplied fields are changed. Auto-snapshots current before writing. */
export async function patchAssistantConfig(
  kbId: string,
  input: PatchAssistantConfigInput
): Promise<AssistantConfig | null> {
  // Snapshot current config before patch (best-effort)
  const current = await getAssistantConfig(kbId);
  if (current) {
    snapshotConfig(current).catch(() => {});
  }
  const fieldMap: Record<string, string> = {
    assistantName:   "assistant_name",
    avatarUrl:       "avatar_url",
    systemPrompt:    "system_prompt",
    welcomeMessage:  "welcome_message",
    outOfScopeReply: "out_of_scope_reply",
    rules:           "rules",
    defaultLanguage: "default_language",
    allowedLanguages:"allowed_languages",
    alwaysRespondIn: "always_respond_in",
    voiceId:         "voice_id",
    speed:           "speed",
    temperature:     "temperature",
    maxTokens:       "max_tokens",
    citeSources:     "cite_sources",
    strictMode:      "strict_mode",
    primaryColour:      "primary_colour",
    accentColour:       "accent_colour",
    widgetTheme:        "widget_theme",
    widgetPosition:     "widget_position",
    widgetButtonSize:   "widget_button_size",
    widgetBorderRadius: "widget_border_radius",
    widgetFontFamily:   "widget_font_family",
    widgetChatHeight:   "widget_chat_height",
    widgetShowBranding: "widget_show_branding",
    widgetLauncherLabel:"widget_launcher_label",
    widgetMode:          "widget_mode",
    customCss:           "custom_css",
    customLauncherSvg:   "custom_launcher_svg",
    customHeaderHtml:    "custom_header_html",
    customPoweredBy:     "custom_powered_by",
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(fieldMap)) {
    const val = (input as Record<string, unknown>)[key];
    if (val === undefined) continue;

    if (key === "rules") {
      sets.push(`${col} = $${i++}::jsonb`);
      params.push(JSON.stringify(val));
    } else if (key === "allowedLanguages") {
      sets.push(`${col} = $${i++}`);
      params.push(val as string[]);
    } else {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    }
  }

  if (sets.length === 0) return getAssistantConfig(kbId);

  params.push(kbId);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE assistant_configs SET ${sets.join(", ")} WHERE kb_id = $${i} RETURNING *`,
    params
  );
  return row ? toConfig(row) : null;
}
