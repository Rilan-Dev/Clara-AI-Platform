/**
 * src/modules/voice-core/resolve.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voice-provider resolution for the realtime/embed surfaces — the voice-axis
 * counterpart of src/modules/ai-core/resolve.ts (resolveAIConfig).
 *
 * ElevenLabs is a VOICE layer, never a brain layer (see
 * Doc/ELEVENLABS_INTEGRATION_PLAN.md §3). This resolver picks WHICH provider
 * serves the voice surface using the same precedence discipline as
 * resolveAIConfig():
 *
 *   kb_ai_overrides.voice_provider
 *     → agent_ai_settings.voice_provider
 *       → org_ai_settings.voice_provider
 *         → brain provider (inherit — the default for every existing tenant)
 *
 * The brain config (chat model, embedding model, RAG) is resolved by the
 * UNTOUCHED resolveAIConfig() and returned alongside, so callers get one
 * coherent object without re-querying.
 */

import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getAgentById } from "@/modules/organisations/core/db";
import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getAgentAISettings } from "@/modules/organisations/core/agent-ai-settings-db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import { resolveAIConfig } from "@/modules/ai-core/resolve";
import {
  getPlatformDefaultSTTModel,
  getPlatformDefaultTTSModel,
  getPlatformDefaultVoiceId,
  isElevenLabsEnabled,
  isSupportedTTSModel,
  looksLikeElevenLabsVoiceId,
} from "./model-catalog";
import type {
  ElevenLabsResolvedConfig,
  ResolveVoiceConfigInput,
  VoiceResolution,
} from "./config-types";
import type { VoiceProvider } from "./types";
import { query } from "@/lib/db";

export class VoiceConfigResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceConfigResolutionError";
  }
}

export type { ResolveVoiceConfigInput };

/**
 * Resolve the voice provider + ElevenLabs specifics for a tenant. The brain
 * config is resolved via the existing resolveAIConfig() with the SAME input
 * so surface flags (voiceEnabled / realtimeEnabled / publicEmbedEnabled)
 * are enforced exactly as before.
 */
export async function resolveVoiceConfig(
  input: ResolveVoiceConfigInput,
): Promise<VoiceResolution> {
  // Brain resolution first — unchanged code path, unchanged failures. This
  // also enforces the surface flags via assertSurfaceEnabled inside.
  const brain = await resolveAIConfig({
    kbId: input.kbId,
    orgId: input.orgId,
    surface: input.surface,
  });

  const kb = input.kbId ? await getKnowledgeBaseById(input.kbId) : null;
  const agent = kb ? await getAgentById(kb.agentId) : null;
  const orgId = input.orgId ?? agent?.orgId ?? null;

  const [orgSettings, agentSettings, kbOverrides] = await Promise.all([
    orgId ? getOrgAISettings(orgId) : Promise.resolve(null),
    agent?.id ? getAgentAISettings(agent.id) : Promise.resolve(null),
    input.kbId ? getKbAIOverrides(input.kbId) : Promise.resolve(null),
  ]);

  // ── Precedence: kb → agent → org → inherit brain ────────────────────────
  let voiceProvider: VoiceProvider | null =
    kbOverrides?.voiceProvider ?? agentSettings?.voiceProvider ?? orgSettings?.voiceProvider ?? null;
  let source: VoiceResolution["source"] =
    kbOverrides?.voiceProvider != null
      ? "kb_override"
      : agentSettings?.voiceProvider != null
        ? "agent_settings"
        : orgSettings?.voiceProvider != null
          ? "org"
          : "env";

  if (!voiceProvider) {
    voiceProvider = brain.provider; // inherit — default for existing tenants
    source = "env";
  }

  // ── Org allow-list (mirrors the allowedProviders check in resolveAIConfig) ─
  const allowedVoiceProviders = orgSettings?.allowedVoiceProviders?.length
    ? orgSettings.allowedVoiceProviders
    : (["openai", "gemini", "elevenlabs"] as VoiceProvider[]);

  if (!allowedVoiceProviders.includes(voiceProvider)) {
    throw new VoiceConfigResolutionError(
      `Voice provider ${voiceProvider} is not enabled for this organisation.`,
    );
  }

  // ── Kill switch: platform-level ElevenLabs availability ───────────────────
  if (voiceProvider === "elevenlabs" && !isElevenLabsEnabled()) {
    throw new VoiceConfigResolutionError(
      "ElevenLabs voice is not available on this platform (ELEVENLABS_ENABLED is off or the API key is not configured).",
    );
  }

  // ── ElevenLabs specifics ──────────────────────────────────────────────────
  let elevenlabs: ElevenLabsResolvedConfig | null = null;
  if (voiceProvider === "elevenlabs") {
    const ttsModel =
      orgSettings?.elevenlabsTtsModel ??
      getPlatformDefaultTTSModel();
    if (!isSupportedTTSModel(ttsModel)) {
      throw new VoiceConfigResolutionError(
        `Unsupported ElevenLabs TTS model: ${ttsModel}`,
      );
    }

    const sttModel =
      orgSettings?.elevenlabsSttModel ??
      getPlatformDefaultSTTModel();

    const voiceId = await resolveElevenLabsVoiceId({
      orgId,
      agentId: agent?.id ?? null,
      agentSettings,
      assistantVoiceId: brain.assistantConfig?.voiceId ?? null,
      orgDefaultVoice: orgSettings?.defaultElevenlabsVoice ?? null,
    });

    elevenlabs = {
      ttsModel,
      sttModel,
      voiceId,
      voiceSettings: {}, // per-agent tuning lands with the settings UI phase
      language:
        brain.defaultLanguage ??
        brain.assistantConfig?.alwaysRespondIn ??
        "en",
    };
  }

  return { voiceProvider, source, brain, elevenlabs };
}

/**
 * Voice-id selection for the ElevenLabs axis. Vendor voice ids are NOT a
 * fixed enumerable set (unlike OPENAI_REALTIME_VOICES), so validation runs
 * against the org's synced catalog + a shape check. Precedence:
 *
 *   assistant config voiceId (if it is an ElevenLabs voice id in the org catalog)
 *     → agent's assigned ElevenLabs voices (first enabled)
 *       → org default ElevenLabs voice
 *         → platform default (env)
 */
async function resolveElevenLabsVoiceId(params: {
  orgId: string | null;
  agentId: string | null;
  agentSettings: Awaited<ReturnType<typeof getAgentAISettings>>;
  assistantVoiceId: string | null;
  orgDefaultVoice: string | null;
}): Promise<string> {
  const { orgId, agentSettings, assistantVoiceId, orgDefaultVoice } = params;

  // Org's ElevenLabs catalog (elevenlabs_voices table + organisation_voices
  // rows with provider='elevenlabs').
  const catalogVoiceIds = orgId ? await listOrgElevenLabsVoiceIds(orgId) : [];

  // 1. Assistant-config voice id, when it is a known ElevenLabs voice.
  if (assistantVoiceId && catalogVoiceIds.includes(assistantVoiceId)) {
    return assistantVoiceId;
  }

  // 2. Agent's assigned voices on the elevenlabs provider axis.
  const assignedElevenLabsVoices = (agentSettings?.voices ?? []).filter(
    (voice) => voice.enabled && voice.provider === "elevenlabs",
  );
  if (assignedElevenLabsVoices.length > 0) {
    return assignedElevenLabsVoices[0].voiceId;
  }

  // 3. Org default.
  if (orgDefaultVoice && (catalogVoiceIds.includes(orgDefaultVoice) || looksLikeElevenLabsVoiceId(orgDefaultVoice))) {
    return orgDefaultVoice;
  }

  // 4. Platform default.
  const platformDefault = getPlatformDefaultVoiceId();
  if (platformDefault && (catalogVoiceIds.includes(platformDefault) || looksLikeElevenLabsVoiceId(platformDefault))) {
    return platformDefault;
  }

  // 5. First catalog voice — better than failing when an org HAS voices synced.
  if (catalogVoiceIds.length > 0) {
    return catalogVoiceIds[0];
  }

  throw new VoiceConfigResolutionError(
    "No ElevenLabs voice is configured for this organisation or platform. Add voices in Settings → AI, or set ELEVENLABS_DEFAULT_VOICE_ID.",
  );
}

/**
 * Union of ElevenLabs voice ids the org may use: the dedicated
 * elevenlabs_voices catalog plus organisation_voices rows stored with
 * provider='elevenlabs'.
 */
export async function listOrgElevenLabsVoiceIds(orgId: string): Promise<string[]> {
  try {
    const rows = await query<{ voice_id: string }>(
      `SELECT voice_id FROM elevenlabs_voices WHERE org_id = $1
       UNION
       SELECT voice_id FROM organisation_voices
        WHERE org_id = $1 AND provider = 'elevenlabs'`,
      [orgId],
    );
    return rows.map((row) => row.voice_id);
  } catch {
    // Table not yet migrated (first boot before 033 applies) — degrade to
    // empty catalog rather than breaking resolution.
    return [];
  }
}
