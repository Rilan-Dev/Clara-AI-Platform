import { query, queryOne } from "@/lib/db";
import type { AIProvider } from "@/modules/ai-core/config-types";
import type { AgentLanguage, AgentVoice } from "./agent-ai-types";

type Row = Record<string, unknown>;

export async function listOrganisationLanguages(orgId: string): Promise<AgentLanguage[]> {
  const rows = await query<Row>(
    "SELECT * FROM organisation_languages WHERE org_id = $1 ORDER BY name",
    [orgId],
  );
  return rows.map((row) => ({
    id: String(row.id), orgId: String(row.org_id), code: String(row.code),
    name: String(row.name), nativeName: row.native_name == null ? null : String(row.native_name),
    enabled: Boolean(row.enabled),
  }));
}

export async function listOrganisationVoices(orgId: string): Promise<AgentVoice[]> {
  const rows = await query<Row>(
    "SELECT * FROM organisation_voices WHERE org_id = $1 ORDER BY provider, name",
    [orgId],
  );
  return rows.map((row) => ({
    id: String(row.id), orgId: String(row.org_id),
    provider: row.provider === "gemini" ? "gemini" : "openai",
    voiceId: String(row.voice_id), name: String(row.name), enabled: Boolean(row.enabled),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
  }));
}

export async function upsertOrganisationLanguage(
  orgId: string,
  input: { code: string; name: string; nativeName?: string | null; enabled?: boolean },
): Promise<AgentLanguage> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(code)) throw new Error("Invalid BCP-47 language code");
  if (!name) throw new Error("Language name is required");
  const row = await queryOne<Row>(
    `INSERT INTO organisation_languages (org_id, code, name, native_name, enabled)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, code) DO UPDATE SET name=EXCLUDED.name,native_name=EXCLUDED.native_name,enabled=EXCLUDED.enabled,updated_at=now()
     RETURNING *`,
    [orgId, code, name, input.nativeName?.trim() || null, input.enabled !== false],
  );
  if (!row) throw new Error("Failed to save organisation language");
  return {
    id: String(row.id), orgId: String(row.org_id), code: String(row.code), name: String(row.name),
    nativeName: row.native_name == null ? null : String(row.native_name), enabled: Boolean(row.enabled),
  };
}

export async function upsertOrganisationVoice(
  orgId: string,
  input: { provider: AIProvider; voiceId: string; name: string; enabled?: boolean; metadata?: Record<string, unknown> },
): Promise<AgentVoice> {
  const voiceId = input.voiceId.trim();
  const name = input.name.trim();
  if (!voiceId || !name) throw new Error("Voice ID and name are required");
  const row = await queryOne<Row>(
    `INSERT INTO organisation_voices (org_id, provider, voice_id, name, enabled, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (org_id, provider, voice_id) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,metadata=EXCLUDED.metadata,updated_at=now()
     RETURNING *`,
    [orgId, input.provider, voiceId, name, input.enabled !== false, JSON.stringify(input.metadata ?? {})],
  );
  if (!row) throw new Error("Failed to save organisation voice");
  return {
    id: String(row.id), orgId: String(row.org_id), provider: row.provider === "gemini" ? "gemini" : "openai",
    voiceId: String(row.voice_id), name: String(row.name), enabled: Boolean(row.enabled),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
  };
}
