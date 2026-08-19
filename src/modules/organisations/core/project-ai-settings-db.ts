import { query, queryOne } from "@/lib/db";
import type { AIProvider } from "@/modules/ai-core/config-types";
import type { PatchProjectAISettingsInput, ProjectAISettings, ProjectLanguage, ProjectVoice } from "./project-ai-types";

type Row = Record<string, unknown>;
function provider(value: unknown): AIProvider | null { return value === "openai" || value === "gemini" ? value : null; }
function language(row: Row): ProjectLanguage { return { id: String(row.id), orgId: String(row.org_id), code: String(row.code), name: String(row.name), nativeName: row.native_name == null ? null : String(row.native_name), enabled: Boolean(row.enabled) }; }
function voice(row: Row): ProjectVoice { return { id: String(row.id), orgId: String(row.org_id), provider: provider(row.provider) ?? "openai", voiceId: String(row.voice_id), name: String(row.name), enabled: Boolean(row.enabled), metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {} }; }

export async function getProjectAISettings(projectId: string): Promise<ProjectAISettings | null> {
  const base = await queryOne<Row>("SELECT * FROM project_ai_settings WHERE project_id = $1", [projectId]);
  if (!base) return null;
  const orgId = String(base.org_id);
  const [languageRows, voiceRows] = await Promise.all([
    query<Row>(`SELECT l.* FROM project_language_assignments a JOIN organisation_languages l ON l.id = a.language_id AND l.org_id = a.org_id WHERE a.project_id = $1 AND a.org_id = $2 ORDER BY l.name`, [projectId, orgId]),
    query<Row>(`SELECT v.* FROM project_voice_assignments a JOIN organisation_voices v ON v.id = a.voice_id AND v.org_id = a.org_id WHERE a.project_id = $1 AND a.org_id = $2 ORDER BY v.name`, [projectId, orgId]),
  ]);
  return {
    id: String(base.id), projectId: String(base.project_id), orgId,
    provider: provider(base.provider), chatModel: base.chat_model == null ? null : String(base.chat_model), embeddingModel: base.embedding_model == null ? null : String(base.embedding_model),
    realtimeModel: base.realtime_model == null ? null : String(base.realtime_model), transcriptionModel: base.transcription_model == null ? null : String(base.transcription_model),
    defaultLanguageId: base.default_language_id == null ? null : String(base.default_language_id), defaultVoiceId: base.default_voice_id == null ? null : String(base.default_voice_id),
    languages: languageRows.map(language), voices: voiceRows.map(voice),
  };
}

export async function upsertProjectAISettings(projectId: string, orgId: string, input: PatchProjectAISettingsInput): Promise<ProjectAISettings> {
  const current = await getProjectAISettings(projectId);
  const next = {
    provider: input.provider !== undefined ? input.provider : current?.provider ?? null,
    chatModel: input.chatModel !== undefined ? input.chatModel : current?.chatModel ?? null,
    embeddingModel: input.embeddingModel !== undefined ? input.embeddingModel : current?.embeddingModel ?? null,
    realtimeModel: input.realtimeModel !== undefined ? input.realtimeModel : current?.realtimeModel ?? null,
    transcriptionModel: input.transcriptionModel !== undefined ? input.transcriptionModel : current?.transcriptionModel ?? null,
    defaultLanguageId: input.defaultLanguageId !== undefined ? input.defaultLanguageId : current?.defaultLanguageId ?? null,
    defaultVoiceId: input.defaultVoiceId !== undefined ? input.defaultVoiceId : current?.defaultVoiceId ?? null,
  };
  if (next.defaultLanguageId && input.languageIds !== undefined && !input.languageIds.includes(next.defaultLanguageId)) throw new Error("defaultLanguageId must be included in languageIds");
  if (next.defaultVoiceId && input.voiceIds !== undefined && !input.voiceIds.includes(next.defaultVoiceId)) throw new Error("defaultVoiceId must be included in voiceIds");

  const row = await queryOne<Row>(`INSERT INTO project_ai_settings (project_id, org_id, provider, chat_model, embedding_model, realtime_model, transcription_model, default_language_id, default_voice_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (project_id) DO UPDATE SET org_id=EXCLUDED.org_id, provider=EXCLUDED.provider, chat_model=EXCLUDED.chat_model, embedding_model=EXCLUDED.embedding_model, realtime_model=EXCLUDED.realtime_model, transcription_model=EXCLUDED.transcription_model, default_language_id=EXCLUDED.default_language_id, default_voice_id=EXCLUDED.default_voice_id, updated_at=now() RETURNING *`,
    [projectId, orgId, next.provider, next.chatModel, next.embeddingModel, next.realtimeModel, next.transcriptionModel, next.defaultLanguageId, next.defaultVoiceId]);
  if (!row) throw new Error(`Failed to save project AI settings for ${projectId}`);

  if (input.languageIds !== undefined) {
    await query("DELETE FROM project_language_assignments WHERE project_id = $1 AND org_id = $2", [projectId, orgId]);
    for (const languageId of [...new Set(input.languageIds)]) await query(`INSERT INTO project_language_assignments (project_id, org_id, language_id) SELECT $1,$2,l.id FROM organisation_languages l WHERE l.id=$3 AND l.org_id=$2 AND l.enabled=TRUE`, [projectId, orgId, languageId]);
  }
  if (input.voiceIds !== undefined) {
    await query("DELETE FROM project_voice_assignments WHERE project_id = $1 AND org_id = $2", [projectId, orgId]);
    for (const voiceId of [...new Set(input.voiceIds)]) await query(`INSERT INTO project_voice_assignments (project_id, org_id, voice_id) SELECT $1,$2,v.id FROM organisation_voices v WHERE v.id=$3 AND v.org_id=$2 AND v.enabled=TRUE`, [projectId, orgId, voiceId]);
  }

  const saved = await getProjectAISettings(projectId);
  if (!saved || saved.orgId !== orgId) throw new Error("Project AI settings tenant mismatch");
  if (saved.defaultLanguageId && !saved.languages.some((item) => item.id === saved.defaultLanguageId)) throw new Error("defaultLanguageId must reference an assigned language");
  if (saved.defaultVoiceId && !saved.voices.some((item) => item.id === saved.defaultVoiceId)) throw new Error("defaultVoiceId must reference an assigned voice");
  return saved;
}
