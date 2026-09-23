/**
 * src/modules/voice-core/resolve-draft.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Draft-preview resolution contract (authenticated agent preview):
 *
 *   • preferDraft resolves the voice axes from the CURRENT Main-branch DRAFT
 *     configuration instead of the immutable production version;
 *   • KB overrides (draft-only state) APPLY in draft mode even when a
 *     version/draft config exists — the opposite of published semantics;
 *   • without a draft the resolution falls back to the production version
 *     (deterministic, never fabricated);
 *   • the TTL cache keys draft and live resolutions separately (a draft
 *     preview must never poison the published hot path, and vice versa).
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
    agentId: "agent-1",
    kbId: "kb-1",
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

// ── Version fixtures: production pins ElevenLabs; the draft pins Sarvam ────
const PRODUCTION_VERSION = {
  id: "version-prod-1",
  agentId: "agent-1",
  orgId: "org-1",
  branchId: "branch-main",
  branchName: "Main",
  versionNumber: 4,
  parentVersionId: null,
  configuration: {
    assistant: {},
    ai: {
      provider: "openai",
      chatModel: "gpt-4o",
      embeddingModel: null,
      realtimeModel: null,
      transcriptionModel: null,
      voiceProvider: "elevenlabs",
      voiceChatSttModel: null,
      voiceChatTtsModel: null,
      voiceChatVoiceId: null,
      realtimeVoiceProvider: "elevenlabs",
      realtimeLlmModel: null,
      realtimeSttModel: null,
      realtimeTtsModel: null,
      realtimeVoiceId: null,
    },
    runtime: { enableVoice: true, enableRealtime: true, enablePublicEmbed: true },
  },
  changeSummary: null,
  source: "draft",
  createdByName: null,
  createdBy: null,
  createdAt: "2026-09-01T00:00:00Z",
  publishedAt: "2026-09-01T00:00:00Z",
} as const;

const DRAFT = {
  id: "draft-1",
  agentId: "agent-1",
  orgId: "org-1",
  branchId: "branch-main",
  branchName: "Main",
  userId: "user-1",
  configuration: {
    assistant: {},
    ai: {
      provider: "openai",
      chatModel: "gpt-4o-mini",
      embeddingModel: null,
      realtimeModel: null,
      transcriptionModel: null,
      voiceProvider: "sarvam",
      voiceChatSttModel: null,
      voiceChatTtsModel: null,
      voiceChatVoiceId: null,
      realtimeVoiceProvider: "sarvam",
      realtimeLlmModel: null,
      realtimeSttModel: null,
      realtimeTtsModel: null,
      realtimeVoiceId: null,
    },
    runtime: { enableVoice: true, enableRealtime: true, enablePublicEmbed: true },
  },
  parentVersionId: "version-prod-1",
  parentVersionNumber: 4,
  updatedAt: "2026-09-23T00:00:00Z",
  createdAt: "2026-09-20T00:00:00Z",
} as const;

const draftConfigMock = vi.fn(async () => DRAFT as unknown);
const productionVersionMock = vi.fn(async () => PRODUCTION_VERSION as unknown);

vi.mock("@/modules/agent-versioning/core/db", () => ({
  getProductionVersionConfigCached: () => productionVersionMock(),
  getAgentDraftConfigCached: () => draftConfigMock(),
  getActiveDeploymentCached: vi.fn(async () => null),
  getActiveDeploymentKbCollection: vi.fn(async () => null),
}));

vi.mock("@/modules/ai-governance/core/resolver", () => ({
  validateAgentAISelection: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => ({ defaults: [] })),
}));
vi.mock("./model-catalog", () => ({
  getPlatformDefaultSTTModel: () => "scribe_v2",
  getPlatformDefaultTTSModel: () => "eleven_flash_v2_5",
  getPlatformDefaultRealtimeTTSModel: () => "eleven_flash_v2_5",
  getPlatformDefaultRealtimeSTTModel: () => "scribe_v2_realtime",
  getPlatformDefaultVoiceId: () => "EXAVITQu4vr4xnSDxMaL",
  looksLikeElevenLabsVoiceId: () => true,
  isSupportedTTSModel: () => true,
  isSarvamEnabled: vi.fn(() => true),
  getPlatformDefaultSarvamTTSModel: () => "bulbul:v3",
  getPlatformDefaultSarvamSttModel: () => "saaras:v3",
  getPlatformDefaultSarvamSpeaker: () => "shubh",
  isSupportedSarvamTTSModel: () => true,
  isSupportedSarvamSpeaker: () => true,
  getPlatformDefaultSarvamRealtimeSttModel: () => "saaras:v3-realtime",
  getPlatformDefaultSarvamRealtimeLlmModel: () => "sarvam-105b",
  isSarvamRealtimeTtsEnabled: () => true,
  SARVAM_TTS_LANGUAGES: ["hi-IN", "ta-IN", "en-IN"],
  getSarvamApiKey: () => "test-sarvam-key",
  SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS: 30,
  SARVAM_TTS_SAMPLE_RATE_HZ: 22050,
}));
vi.mock("./server-provider-availability", () => ({
  isElevenLabsEnabled: vi.fn(async () => true),
  isElevenLabsRealtimeEnabled: vi.fn(async () => false),
}));

import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import { resolveVoiceConfig, resolveVoiceConfigCached } from "./resolve";

const kbOverridesMock = vi.mocked(getKbAIOverrides);

beforeEach(() => {
  kbOverridesMock.mockReset();
  draftConfigMock.mockReset().mockImplementation(async () => DRAFT);
  productionVersionMock.mockReset().mockImplementation(async () => PRODUCTION_VERSION);
});
describe("draft-preview voice resolution", () => {
  it("resolves the realtime axis from the DRAFT when preferDraft is set", async () => {
    const resolved = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime", preferDraft: true });
    expect(resolved.realtimeProvider).toBe("sarvam");
    expect(resolved.voiceProvider).toBe("sarvam");
  });

  it("resolves the immutable production version without preferDraft", async () => {
    const resolved = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(resolved.realtimeProvider).toBe("elevenlabs");
    expect(resolved.voiceProvider).toBe("elevenlabs");
  });

  it("falls back to the production version in draft mode when no draft exists", async () => {
    draftConfigMock.mockImplementation(async () => null);
    const resolved = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime", preferDraft: true });
    expect(resolved.realtimeProvider).toBe("elevenlabs");
  });

  it("applies KB overrides in draft mode even though a version config exists", async () => {
    // Published semantics: version config exists → KB overrides are nulled.
    kbOverridesMock.mockImplementation(
      async () => ({ voiceProvider: "sarvam", realtimeVoiceProvider: "sarvam" }) as never,
    );
    const published = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime" });
    expect(published.voiceProvider).toBe("elevenlabs");
    expect(published.source).not.toBe("kb_override");

    // Draft semantics: KB overrides are draft-only state and DO apply.
    const draft = await resolveVoiceConfig({ kbId: "kb-1", surface: "realtime", preferDraft: true });
    expect(draft.voiceProvider).toBe("sarvam");
    expect(draft.source).toBe("kb_override");
  });

  it("caches draft and live resolutions under separate keys", async () => {
    const draftFirst = await resolveVoiceConfigCached({ kbId: "kb-1", surface: "realtime", preferDraft: true });
    expect(draftFirst.voiceProvider).toBe("sarvam");

    // Flip the fixtures AFTER the draft resolution is cached — a shared cache
    // key would serve the stale draft answer to the published path.
    draftConfigMock.mockImplementation(async () => null);

    const live = await resolveVoiceConfigCached({ kbId: "kb-1", surface: "realtime" });
    expect(live.voiceProvider).toBe("elevenlabs");
  });
});
