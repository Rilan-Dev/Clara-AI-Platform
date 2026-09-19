/**
 * src/modules/voice-core/resolve.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voice-provider resolution for the realtime/embed surfaces — the voice-axis
 * counterpart of src/modules/ai-core/resolve.ts (resolveAIConfig).
 *
 * ElevenLabs is a VOICE layer, never a brain layer (see
 * Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md §3). This resolver picks WHICH provider
 * serves each voice PURPOSE using the same precedence discipline as
 * resolveAIConfig():
 *
 *   voice-chat purpose (chat-window voice-chat / Mode A pipeline):
 *     kb_ai_overrides.voice_provider
 *       → agent_ai_settings.voice_provider
 *         → org_ai_settings.voice_provider
 *           → brain provider (inherit — the default for every existing tenant)
 *
 *   realtime purpose (real-time voice assistant: floating voice modal, embed
 *   voice surfaces, ElevenLabs Agents, phone):
 *     kb_ai_overrides.realtime_voice_provider
 *       → agent_ai_settings.realtime_voice_provider
 *         → org_ai_settings.realtime_voice_provider
 *           → the voice-chat value (inherit — so one provider pick keeps
 *              every surface native to it)
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
  getPlatformDefaultSarvamSttModel,
  getPlatformDefaultSarvamSpeaker,
  getPlatformDefaultSarvamTTSModel,
  isSarvamEnabled,
  isSupportedSarvamSpeaker,
  isSupportedSarvamTTSModel,
  SARVAM_TTS_LANGUAGES,
} from "./model-catalog";
import type {
  ElevenLabsResolvedConfig,
  ResolveVoiceConfigInput,
  SarvamResolvedConfig,
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
 * Map a 2-letter assistant language ("hi", "ta", "en", "si", …) to the
 * BCP-47 code Saaras/Bulbul understand ("hi-IN", …). Bulbul covers 10 Indian
 * languages + Indian English — anything else (Sinhala, Arabic, …) falls back
 * to en-IN so voice stays usable while the brain answers in the assistant's
 * language (text chat is unaffected; only the spoken voice is English).
 */
const SARVAM_TTS_LANGUAGE_BASES = new Set(
  SARVAM_TTS_LANGUAGES.map((code) => code.split("-")[0]!),
);

export function toSarvamLanguageCode(language: string | null | undefined): string {
  const base = (language ?? "").trim().toLowerCase().split("-")[0] ?? "";
  if (!base) return "en-IN";
  if (base === "en") return "en-IN";
  if (SARVAM_TTS_LANGUAGE_BASES.has(base)) return `${base}-IN`;
  return "en-IN";
}

/** V5 realtime STT relay capability flag (off until an operator opts in). */
export function isSarvamRealtimeSttEnabled(): boolean {
  return (process.env.SARVAM_REALTIME_STT_ENABLED ?? "false").toLowerCase() === "true";
}

// ─── Hot-path resolution cache ─────────────────────────────────────────────────
//
// resolveVoiceConfig walks kb → agent → org settings → AI overrides → voice
// catalog: ~8 remote-DB round trips. The Mode A pipeline calls it on EVERY
// per-sentence TTS request and EVERY utterance STT request (a 10-sentence
// answer repeats the whole walk 10 times), which stacks hundreds of ms of
// pure database latency in front of every vendor call. A 5-second TTL memo
// collapses that to one walk per speaking burst while staying short enough
// that operator/provider switches propagate effectively immediately.

const VOICE_CONFIG_CACHE_TTL_MS = 5_000;
const voiceConfigCache = new Map<
  string,
  { expiresAt: number; value: VoiceResolution }
>();

function voiceConfigCacheKey(input: ResolveVoiceConfigInput): string {
  return `${input.surface}|${input.kbId ?? ""}|${input.orgId ?? ""}`;
}

/**
 * TTL-cached resolveVoiceConfig for hot per-request routes (tts, transcribe).
 * Errors are NEVER cached — a failed resolution is retried on the next call.
 * Session bootstrap keeps the uncached resolveVoiceConfig for freshness.
 */
export async function resolveVoiceConfigCached(
  input: ResolveVoiceConfigInput,
): Promise<VoiceResolution> {
  const key = voiceConfigCacheKey(input);
  const hit = voiceConfigCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const value = await resolveVoiceConfig(input);
  voiceConfigCache.set(key, { expiresAt: Date.now() + VOICE_CONFIG_CACHE_TTL_MS, value });
  if (voiceConfigCache.size > 512) {
    // Cheap periodic sweep — never expected to trigger at this key cardinality.
    const now = Date.now();
    for (const [k, entry] of voiceConfigCache) {
      if (entry.expiresAt <= now) voiceConfigCache.delete(k);
    }
  }
  return value;
}

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

  // ── Realtime purpose: kb → agent → org → inherit voice-chat ──────────────
  // NULL at every level means "follow the voice-chat provider", which itself
  // follows the brain provider — so picking ONE provider keeps chat, voice
  // chat AND the realtime voice assistant native to it. An explicit override
  // pins the realtime assistant (e.g. chat + voice-chat on OpenAI while the
  // real-time voice assistant runs on ElevenLabs Agents).
  let realtimeProvider: VoiceProvider | null =
    kbOverrides?.realtimeVoiceProvider ??
    agentSettings?.realtimeVoiceProvider ??
    orgSettings?.realtimeVoiceProvider ??
    null;
  let realtimeSource: VoiceResolution["realtimeSource"] =
    kbOverrides?.realtimeVoiceProvider != null
      ? "kb_override"
      : agentSettings?.realtimeVoiceProvider != null
        ? "agent_settings"
        : orgSettings?.realtimeVoiceProvider != null
          ? "org"
          : "voice_chat";

  if (!realtimeProvider) {
    realtimeProvider = voiceProvider;
    realtimeSource = "voice_chat";
  }

  // ── Org allow-list (mirrors the allowedProviders check in resolveAIConfig) ─
  const allowedVoiceProviders = orgSettings?.allowedVoiceProviders?.length
    ? orgSettings.allowedVoiceProviders
    : (["openai", "gemini", "elevenlabs", "sarvam"] as VoiceProvider[]);

  if (!allowedVoiceProviders.includes(voiceProvider)) {
    throw new VoiceConfigResolutionError(
      `Voice provider ${voiceProvider} is not enabled for this organisation.`,
    );
  }
  if (
    realtimeProvider !== voiceProvider &&
    !allowedVoiceProviders.includes(realtimeProvider)
  ) {
    throw new VoiceConfigResolutionError(
      `Realtime voice provider ${realtimeProvider} is not enabled for this organisation.`,
    );
  }

  // ── Kill switch: platform-level ElevenLabs availability ───────────────────
  if (voiceProvider === "elevenlabs" && !isElevenLabsEnabled()) {
    throw new VoiceConfigResolutionError(
      "ElevenLabs voice is not available on this platform (ELEVENLABS_ENABLED is off or the API key is not configured).",
    );
  }
  if (
    realtimeProvider === "elevenlabs" &&
    voiceProvider !== "elevenlabs" &&
    !isElevenLabsEnabled()
  ) {
    throw new VoiceConfigResolutionError(
      "ElevenLabs realtime voice is not available on this platform (ELEVENLABS_ENABLED is off or the API key is not configured).",
    );
  }

  // ── Kill switch: platform-level Sarvam availability ──────────────────────
  if (voiceProvider === "sarvam" && !isSarvamEnabled()) {
    throw new VoiceConfigResolutionError(
      "Sarvam voice is not available on this platform (SARVAM_ENABLED is off or the API key is not configured).",
    );
  }
  if (
    realtimeProvider === "sarvam" &&
    voiceProvider !== "sarvam" &&
    !isSarvamEnabled()
  ) {
    throw new VoiceConfigResolutionError(
      "Sarvam realtime voice is not available on this platform (SARVAM_ENABLED is off or the API key is not configured).",
    );
  }

  // ── ElevenLabs specifics ──────────────────────────────────────────────────
  // Resolved when EITHER purpose selects ElevenLabs — both purposes share the
  // same org-level models / voice configuration.
  let elevenlabs: ElevenLabsResolvedConfig | null = null;
  if (voiceProvider === "elevenlabs" || realtimeProvider === "elevenlabs") {
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

  // ── Sarvam specifics ──────────────────────────────────────────────────────
  // Resolved when EITHER purpose selects Sarvam — both purposes share the
  // same org-level models / speaker configuration. Speakers are a STATIC
  // catalogue (no DB round-trip, no sync job — contrast ElevenLabs above).
  let sarvam: SarvamResolvedConfig | null = null;
  if (voiceProvider === "sarvam" || realtimeProvider === "sarvam") {
    const sarvamTtsModel =
      orgSettings?.sarvamTtsModel ??
      getPlatformDefaultSarvamTTSModel();
    if (!isSupportedSarvamTTSModel(sarvamTtsModel)) {
      throw new VoiceConfigResolutionError(
        `Unsupported Sarvam TTS model: ${sarvamTtsModel}`,
      );
    }

    const sarvamSttModel =
      orgSettings?.sarvamSttModel ??
      getPlatformDefaultSarvamSttModel();

    const speaker = resolveSarvamSpeaker({
      assistantVoiceId: brain.assistantConfig?.voiceId ?? null,
      orgDefaultSpeaker: orgSettings?.defaultSarvamSpeaker ?? null,
    });

    sarvam = {
      ttsModel: sarvamTtsModel,
      sttModel: sarvamSttModel,
      speaker,
      language: toSarvamLanguageCode(
        brain.defaultLanguage ?? brain.assistantConfig?.alwaysRespondIn ?? "en",
      ),
      sampleRate: 16_000,
      realtimeSttEnabled: isSarvamRealtimeSttEnabled(),
    };
  }

  return {
    voiceProvider,
    source,
    realtimeProvider,
    realtimeSource,
    brain,
    elevenlabs,
    sarvam,
  };
}

/**
 * Speaker selection for the Sarvam axis. Bulbul speakers are a fixed
 * enumerable set, so validation is a catalogue lookup — no org catalog, no
 * sync job. Precedence:
 *
 *   assistant config voiceId (when it is a known Bulbul speaker)
 *     → org default Sarvam speaker
 *       → platform default (env SARVAM_DEFAULT_SPEAKER)
 *         → "shubh" (the vendor default)
 */
function resolveSarvamSpeaker(params: {
  assistantVoiceId: string | null;
  orgDefaultSpeaker: string | null;
}): string {
  if (params.assistantVoiceId && isSupportedSarvamSpeaker(params.assistantVoiceId)) {
    return params.assistantVoiceId.trim().toLowerCase();
  }
  if (params.orgDefaultSpeaker && isSupportedSarvamSpeaker(params.orgDefaultSpeaker)) {
    return params.orgDefaultSpeaker.trim().toLowerCase();
  }
  const platformDefault = getPlatformDefaultSarvamSpeaker();
  if (isSupportedSarvamSpeaker(platformDefault)) {
    return platformDefault;
  }
  return "shubh";
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
