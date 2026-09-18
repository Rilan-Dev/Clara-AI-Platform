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
  query: vi.fn(async () => []),
}));
vi.mock("./model-catalog", () => ({
  getPlatformDefaultSTTModel: () => "scribe_v1",
  getPlatformDefaultTTSModel: () => "eleven_flash_v2_5",
  getPlatformDefaultVoiceId: () => "EXAVITQu4vr4xnSDxMaL",
  isElevenLabsEnabled: vi.fn(() => true),
  isSupportedTTSModel: () => true,
  looksLikeElevenLabsVoiceId: () => true,
}));

import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getAgentAISettings } from "@/modules/organisations/core/agent-ai-settings-db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import { isElevenLabsEnabled } from "./model-catalog";
import { resolveVoiceConfig } from "./resolve";
import type { VoiceResolution } from "./config-types";

const orgSettingsMock = vi.mocked(getOrgAISettings);
const agentSettingsMock = vi.mocked(getAgentAISettings);
const kbOverridesMock = vi.mocked(getKbAIOverrides);
const isElevenLabsEnabledMock = vi.mocked(isElevenLabsEnabled);

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
  isElevenLabsEnabledMock.mockReturnValue(true);
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

  it("rejects a realtime elevenlabs pick when the platform kill switch is off", async () => {
    orgSettingsMock.mockResolvedValue({
      ...baseOrg,
      voiceProvider: null,
      realtimeVoiceProvider: "elevenlabs",
    } as never);
    isElevenLabsEnabledMock.mockReturnValue(false);
    await expect(resolve()).rejects.toThrow(/ElevenLabs realtime voice is not available/);
  });

  it("still rejects the voice-chat elevenlabs axis when the kill switch is off", async () => {
    orgSettingsMock.mockResolvedValue({ ...baseOrg, voiceProvider: "elevenlabs" } as never);
    isElevenLabsEnabledMock.mockReturnValue(false);
    await expect(resolve()).rejects.toThrow(/ElevenLabs voice is not available/);
  });
});
