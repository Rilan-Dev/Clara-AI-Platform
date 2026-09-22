/**
 * src/modules/voice-core/resolve.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Two-purpose voice resolution contract:
 *
 *   voice-chat purpose : kb → agent → org → brain (inherit)
 *   realtime purpose   : kb → agent → org → voice-chat value (inherit)
 *
 * The inheritance chain is the product requirement: picking ONE provider
 * keeps chat, chat-window voice-chat AND the realtime voice assistant native
 * to it; an explicit realtime override splits the purposes (e.g. chat +
 * voice-chat on OpenAI while the real-time voice assistant runs ElevenLabs).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) => ({ id: kbId, agentId: "agent-1", name: "Test KB" })),
}));
vi.mock("@/modules/organisations/core/db", () => ({
  getAgentById: vi.fn(async () => ({ id: "agent-1", orgId: "org-1", name: "Test Agent" })),
}));
vi.mock("@/modules/organisations/core/ai-settings-db", () => ({
  getOrgAISettings: vi.fn(async () => null),
}));
vi.mock("@/modules/organisations/core/agent-ai-settings-db", () => ({
  getAgentAISettings: vi.fn(async () => null),
}));
vi.mock("@/modules/knowledge-bases/core/ai-overrides-db", () => ({
  getKbAIOverrides: vi.fn(async () => null),
}));
vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: vi.fn(async () => ({
    orgId: "org-1",
    agentId: null,
    kbId: null,
    provider: "openai",
    chatModel: null,
    embeddingModel: null,
    realtimeModel: null,
    transcriptionModel: null,
    voiceId: null,
    allowedLanguages: null,
    defaultLanguage: null,
    maxTokens: null,
    temperature: null,
    sources: {},
    flags: { voiceEnabled: true, realtimeEnabled: true, publicEmbedEnabled: true },
    assistantConfig: null,
  })),
}));
vi.mock("@/lib/db", () => ({
  pool: {
    query: vi.fn(async () => ({ rows: [] })),
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
  },
  query: vi.fn(async () => []),
}));
// Agent-versioning dual-read: no production deployment → legacy chain (the
// contract this suite pins).
vi.mock("@/modules/agent-versioning/core/db", () => ({
  getProductionVersionConfigCached: vi.fn(async () => null),
  getActiveDeploymentCached: vi.fn(async () => null),
}));
// Governance gate: platform allows everything in this suite's scenarios.
vi.mock("@/modules/ai-governance/core/resolver", () => ({
  validateAgentAISelection: vi.fn(async ({ provider }: { provider: string }) => ({
    ok:
      provider === "elevenlabs"
        ? await isElevenLabsEnabledMock()
        : provider === "sarvam"
          ? isSarvamEnabledMock()
          : true,
  })),
}));
vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => ({ defaults: [] })),
  listProviderModels: vi.fn(async () => []),
}));
vi.mock("./model-catalog", () => ({
  getPlatformDefaultSTTModel: () => "scribe_v1",
  getPlatformDefaultTTSModel: () => "eleven_flash_v2_5",
  getPlatformDefaultVoiceId: () => "EXAVITQu4vr4xnSDxMaL",
  isSupportedTTSModel: () => true,
  looksLikeElevenLabsVoiceId: () => true,
  // Sarvam arm (V2) — mock surface mirrors the real exports resolve.ts uses.
  isSarvamEnabled: vi.fn(() => false),
  getPlatformDefaultSarvamTTSModel: () => "bulbul:v3",
  getPlatformDefaultSarvamSttModel: () => "saaras:v3",
  getPlatformDefaultSarvamSpeaker: () => "shubh",
  isSupportedSarvamTTSModel: () => true,
  isSupportedSarvamSpeaker: () => true,
  // Sarvam realtime arm — only exercised when Sarvam is actually selected.
  getPlatformDefaultSarvamRealtimeSttModel: () => "saaras:v3-realtime",
  getPlatformDefaultSarvamRealtimeLlmModel: () => "sarvam-105b",
  isSarvamRealtimeTtsEnabled: () => true,
  SARVAM_TTS_LANGUAGES: ["hi-IN", "ta-IN", "en-IN"],
}));
// Legacy gate mock — resolve.ts no longer consults this DB-backed flag
// directly (the API routes do), but the mock keeps these tests hermetic.
vi.mock("./server-provider-availability", () => ({
  isElevenLabsEnabled: vi.fn(async () => true),
  isElevenLabsRealtimeEnabled: vi.fn(async () => true),
}));

import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getAgentAISettings } from "@/modules/organisations/core/agent-ai-settings-db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import { isSarvamEnabled } from "./model-catalog";
import { isElevenLabsEnabled } from "./server-provider-availability";
import { isSarvamRealtimeSttEnabled, resolveVoiceConfig } from "./resolve";
import type { VoiceResolution } from "./config-types";

const orgSettingsMock = vi.mocked(getOrgAISettings);
const agentSettingsMock = vi.mocked(getAgentAISettings);
const kbOverridesMock = vi.mocked(getKbAIOverrides);
const isElevenLabsEnabledMock = vi.mocked(isElevenLabsEnabled);
const isSarvamEnabledMock = vi.mocked(isSarvamEnabled);

const baseOrg = {
  voiceProvider: null as string | null,
  realtimeVoiceProvider: null as string | null,
  allowedVoiceProviders: ["openai", "gemini", "elevenlabs"],
  elevenlabsTtsModel: null,
  elevenlabsSttModel: null,
  defaultElevenlabsVoice: null,
};

async function resolve(): Promise<VoiceResolution> {
  return resolveVoiceConfig({ orgId: "org-1", surface: "realtime" });
}

beforeEach(() => {
  vi.clearAllMocks();
  orgSettingsMock.mockResolvedValue({ ...baseOrg } as never);
  agentSettingsMock.mockResolvedValue(null as never);
  kbOverridesMock.mockResolvedValue(null as never);
  isElevenLabsEnabledMock.mockResolvedValue(true);
});

describe("voice resolution — native-by-default", () => {
  it("inherits the brain provider on BOTH purposes when nothing is configured", async () => {
    const r = await resolve();
    expect(r.voiceProvider).toBe("openai");
    expect(r.realtimeProvider).toBe("openai");
    expect(r.realtimeSource).toBe("voice_chat");
    expect(r.elevenlabs).toBeNull();
  });

  it("realtime follows the voice-chat axis (org voice_provider=elevenlabs → both elevenlabs)", async () => {
    orgSettingsMock.mockResolvedValue({ ...baseOrg, voiceProvider: "elevenlabs" } as never);
    const r = await resolve();
    expect(r.voiceProvider).toBe("elevenlabs");
    expect(r.realtimeProvider).toBe("elevenlabs");
    expect(r.realtimeSource).toBe("voice_chat");
    expect(r.elevenlabs).not.toBeNull();
    expect(r.elevenlabs?.ttsModel).toBe("eleven_flash_v2_5");
    expect(r.elevenlabs?.sttModel).toBe("scribe_v1");
  });
});

describe("voice resolution — per-purpose overrides", () => {
  it("supports chat+voice-chat on OpenAI while realtime runs ElevenLabs (the product's split)", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      voiceProvider: null,
      realtimeVoiceProvider: "elevenlabs",
    } as never);
    const r = await resolve();
    expect(r.voiceProvider).toBe("openai");          // voice-chat stays native
    expect(r.realtimeProvider).toBe("elevenlabs");  // realtime pinned
    expect(r.realtimeSource).toBe("org");
    expect(r.elevenlabs).not.toBeNull();             // models/voice resolved for the realtime axis
  });

  it("kb-level realtime override wins over the org value", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      voiceProvider: "elevenlabs",
      realtimeVoiceProvider: "openai",
    } as never);
    kbOverridesMock.mockResolvedValue({
      voiceProvider: null,
      realtimeVoiceProvider: "gemini",
    } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.voiceProvider).toBe("elevenlabs"); // voice-chat axis untouched
    expect(r.realtimeProvider).toBe("gemini");  // kb override > org > voice-chat
    expect(r.realtimeSource).toBe("kb_override");
  });
});

describe("voice resolution — guards", () => {
  it("rejects a realtime provider outside the org allow-list", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini"], // elevenlabs not allowed
      realtimeVoiceProvider: "elevenlabs",
    } as never);
    await expect(resolve()).rejects.toThrow(/Realtime voice provider elevenlabs/);
  });

  it("degrades a realtime elevenlabs pick to the voice-chat provider when the platform kill switch is off", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      voiceProvider: null,
      realtimeVoiceProvider: "elevenlabs",
    } as never);
    isElevenLabsEnabledMock.mockResolvedValue(false);
    const r = await resolve();
    expect(r.voiceProvider).toBe("openai");          // voice-chat axis untouched
    expect(r.realtimeProvider).toBe("openai");      // realtime degraded, not fatal
    expect(r.realtimeSource).toBe("voice_chat");
    expect(r.elevenlabs).toBeNull();                // no ElevenLabs specifics resolved
  });

  it("degrades the voice-chat elevenlabs axis to the brain provider when the kill switch is off", async () => {
    orgSettingsMock.mockResolvedValue({ ...baseOrg, voiceProvider: "elevenlabs" } as never);
    isElevenLabsEnabledMock.mockResolvedValue(false);
    const r = await resolve();
    expect(r.voiceProvider).toBe("openai");
    expect(r.realtimeProvider).toBe("openai"); // inherited pick degrades with it
    expect(r.source).toBe("env");
    expect(r.elevenlabs).toBeNull();
  });

  it("degrades a sarvam selection when SARVAM_ENABLED is off (dark-launch posture)", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
      voiceProvider: "sarvam",
    } as never);
    // isSarvamEnabled defaults to false in the mock surface.
    const r = await resolve();
    expect(r.voiceProvider).toBe("openai");
    expect(r.realtimeProvider).toBe("openai");
    expect(r.sarvam).toBeNull();
  });

  it("still hard-fails when the org allow-list excludes every fallback provider", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["elevenlabs"], // brain fallback (openai) not allowed
      voiceProvider: "elevenlabs",
    } as never);
    isElevenLabsEnabledMock.mockResolvedValue(false);
    await expect(resolve()).rejects.toThrow(/ElevenLabs voice is not available on this platform/);
  });
});

describe("Phase 13 rollout gate — SARVAM_REALTIME_STT_ENABLED stays DARK by default", () => {
  it("defaults OFF (unset env)", () => {
    delete process.env.SARVAM_REALTIME_STT_ENABLED;
    expect(isSarvamRealtimeSttEnabled()).toBe(false);
  });

  it("opt-in requires an explicit true", () => {
    process.env.SARVAM_REALTIME_STT_ENABLED = "true";
    expect(isSarvamRealtimeSttEnabled()).toBe(true);
    delete process.env.SARVAM_REALTIME_STT_ENABLED;
  });
});

// ── OpenAI native-realtime axis (production incident 2026-09-21) ──────────────
//
// The realtime transport (model / output voice / transcription) must resolve
// from the VOICE axis with OpenAI-contract validation, independent of the
// brain provider: a Sarvam brain with an OpenAI realtime voice selection is a
// SUPPORTED split (org chat/RAG on Sarvam, realtime voice assistant on OpenAI
// Realtime) and must yield a fully valid OpenAI session descriptor.
import { resolveAIConfig } from "@/modules/ai-core/resolve";

const resolveAIMock = vi.mocked(resolveAIConfig);

const sarvamBrain = {
  orgId: "org-1",
  agentId: null,
  kbId: null,
  provider: "sarvam",
  chatModel: "sarvam-105b",
  embeddingModel: null,
  realtimeModel: null,
  transcriptionModel: null,
  voiceId: null,
  allowedLanguages: ["en"],
  defaultLanguage: "en",
  maxTokens: null,
  temperature: null,
  sources: {},
  flags: { voiceEnabled: true, realtimeEnabled: true, publicEmbedEnabled: true },
  assistantConfig: null,
};

const openaiRealtimeAgent = {
  id: "agent-ai-1",
  agentId: "agent-1",
  orgId: "org-1",
  provider: null,
  voiceProvider: null,
  voiceChatSttModel: null,
  voiceChatTtsModel: null,
  voiceChatVoiceId: null,
  realtimeVoiceProvider: "openai",
  realtimeLlmModel: null,
  realtimeSttModel: null,
  realtimeTtsModel: null,
  realtimeVoiceId: null,
  chatModel: null,
  embeddingModel: null,
  realtimeModel: null,
  transcriptionModel: null,
  defaultLanguageId: null,
  defaultVoiceId: null,
  languages: [],
  voices: [],
};

describe("voice resolution — independent voice-chat and realtime providers", () => {
  beforeEach(() => {
    resolveAIMock.mockResolvedValue({
      ...sarvamBrain,
      provider: "openai",
      chatModel: "gpt-4o-mini",
    } as never);
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
      voiceProvider: "elevenlabs",
      realtimeVoiceProvider: "openai",
      defaultElevenlabsVoice: null,
    } as never);
    agentSettingsMock.mockResolvedValue({
      ...openaiRealtimeAgent,
      realtimeVoiceProvider: "openai",
    } as never);
  });

  it("does not require an ElevenLabs voice when realtime is explicitly OpenAI", async () => {
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.voiceProvider).toBe("elevenlabs");
    expect(r.realtimeProvider).toBe("openai");
    expect(r.elevenlabs).toBeNull();
    expect(r.openai).not.toBeNull();
  });

  it("still resolves ElevenLabs for the voice-chat pipeline independently", async () => {
    agentSettingsMock.mockResolvedValue({
      ...openaiRealtimeAgent,
      voiceProvider: "elevenlabs",
      realtimeVoiceProvider: "openai",
      voices: [{ enabled: true, provider: "elevenlabs", voiceId: "el-test", id: "v1", orgId: "org-1", name: "Test", metadata: {} }],
    } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "voice_chat" });
    expect(r.voiceProvider).toBe("elevenlabs");
    expect(r.realtimeProvider).toBe("openai");
    expect(r.elevenlabs?.voiceId).toBe("el-test");
    expect(r.openai).toBeNull();
  });
});

describe("voice resolution — OpenAI native-realtime axis", () => {
  beforeEach(() => {
    delete process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_DEFAULT_VOICE;
    delete process.env.OPENAI_REALTIME_VOICE;
    delete process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL;
    // A Sarvam brain must be a legal voice-chat inherit value: enable the
    // provider in the (mocked) platform surface and allow it org-wide.
    isSarvamEnabledMock.mockReturnValue(true);
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
    } as never);
  });

  it("resolves a valid OpenAI transport for a SARVAM brain + OpenAI realtime selection (the incident split)", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    agentSettingsMock.mockResolvedValue({ ...openaiRealtimeAgent } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.brain.provider).toBe("sarvam");        // brain untouched
    expect(r.realtimeProvider).toBe("openai");     // realtime on the voice axis
    expect(r.openai).not.toBeNull();
    expect(r.openai?.voiceId).toBe("alloy");       // contract fallback, never null
    expect(r.openai?.realtimeModel).toBe("gpt-realtime-mini");
    expect(r.openai?.transcriptionModel).toBe("gpt-4o-mini-transcribe");
  });

  it("honours the agent realtime voice when it is a valid OpenAI Realtime voice", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    agentSettingsMock.mockResolvedValue({ ...openaiRealtimeAgent, realtimeVoiceId: "ash" } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.openai?.voiceId).toBe("ash");
  });

  it("filters cross-provider voice leftovers (a Bulbul speaker id is never an OpenAI voice)", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    agentSettingsMock.mockResolvedValue({ ...openaiRealtimeAgent, realtimeVoiceId: "meera" } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.openai?.voiceId).toBe("alloy");
  });

  it("picks only OpenAI realtime models from the tenant chain (a Sarvam chat model is skipped)", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    agentSettingsMock.mockResolvedValue({ ...openaiRealtimeAgent, realtimeModel: "gpt-realtime-2.1-mini" } as never);
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
      realtimeVoiceProvider: "openai",
      defaultRealtimeModel: "sarvam-105b",
    } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.openai?.realtimeModel).toBe("gpt-realtime-2.1-mini");
  });

  it("falls back to the platform env model when no tenant model is an OpenAI realtime model", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
      realtimeVoiceProvider: "openai",
      defaultRealtimeModel: "sarvam-105b",
    } as never);
    process.env.OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview";
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.openai?.realtimeModel).toBe("gpt-4o-realtime-preview");
    delete process.env.OPENAI_REALTIME_MODEL;
  });

  it("resolves the org allow-list voice and a whisper transcription model", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    agentSettingsMock.mockResolvedValue({
      ...openaiRealtimeAgent,
      transcriptionModel: "whisper-1",
    } as never);
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
      realtimeVoiceProvider: "openai",
      allowedVoices: { openai: ["verse"], gemini: ["Puck"] },
    } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.openai?.voiceId).toBe("verse");
    expect(r.openai?.transcriptionModel).toBe("whisper-1");
  });

  it("keeps the assistant-config voice when it is a valid OpenAI voice", async () => {
    resolveAIMock.mockResolvedValue({
      ...sarvamBrain,
      assistantConfig: { voiceId: "coral" },
    } as never);
    agentSettingsMock.mockResolvedValue({ ...openaiRealtimeAgent } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.openai?.voiceId).toBe("coral");
  });

  it("resolves an OpenAI block for a pure-OpenAI tenant too (inherit case, brain openai)", async () => {
    resolveAIMock.mockResolvedValue({
      ...sarvamBrain,
      provider: "openai",
      chatModel: "gpt-4o-mini",
    } as never);
    agentSettingsMock.mockResolvedValue(null as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.voiceProvider).toBe("openai");
    expect(r.realtimeProvider).toBe("openai");
    expect(r.openai).not.toBeNull();
    expect(r.openai?.voiceId).toBe("alloy");
  });

  it("leaves the OpenAI block null when neither purpose selects OpenAI", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      allowedVoiceProviders: ["openai", "gemini", "elevenlabs", "sarvam"],
      voiceProvider: "elevenlabs",
      realtimeVoiceProvider: "elevenlabs",
      elevenlabsTtsModel: "eleven_flash_v2_5",
      elevenlabsSttModel: "scribe_v1",
      defaultElevenlabsVoice: null,
    } as never);
    const r = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(r.realtimeProvider).toBe("elevenlabs");
    expect(r.openai).toBeNull();
  });
});
