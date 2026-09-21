/**
 * src/app/api/embed/session/route.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Production incident 2026-09-21 regression lock:
 *
 *   "OpenAI realtime voice is not configured for this tenant." (503)
 *
 * Root cause: the native realtime branches of the embed session route selected
 * the transport by the BRAIN provider and sourced voice/model/credential from
 * the brain resolution. An org running a Sarvam brain that selects OpenAI for
 * the realtime voice axis got a structurally-null brain voiceId → 503 — and
 * the branch would otherwise have sent the SARVAM key to OpenAI.
 *
 * The contract pinned here: the native realtime transport is selected by the
 * VOICE axis (realtimeProvider) and minted with the transport provider's OWN
 * credential; a Sarvam/Gemini brain with an OpenAI realtime selection yields
 * a fully valid OpenAI Realtime session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/embed/core/validate-embed", () => ({
  validateEmbedRequest: vi.fn(async () => ({
    ok: true as const,
    ctx: { kbId: "kb-1", orgId: "org-1", allowedOrigins: [] },
  })),
  requireVoiceAccess: vi.fn(() => null),
  buildCorsHeaders: vi.fn(() => ({})),
  handlePreflight: vi.fn(async () => new Response(null, { status: 204 })),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn(async () => {}) }));

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) => ({
    id: kbId,
    agentId: "agent-1",
    name: "Incident KB",
  })),
  getAssistantConfigByKb: vi.fn(async () => ({
    welcomeMessage: "hello",
    maxTokens: 500,
    temperature: 0.7,
  })),
}));

vi.mock("@/modules/knowledge-bases/core/config-builder", () => ({
  buildSystemPrompt: vi.fn(() => "LOCKED PROMPT"),
}));

const sarvamBrain = {
  orgId: "org-1",
  agentId: "agent-1",
  kbId: "kb-1",
  provider: "sarvam",
  chatModel: "sarvam-105b",
  embeddingModel: null,
  realtimeModel: null,
  transcriptionModel: null,
  voiceId: null, // structurally null for a non-OpenAI brain — the incident
  allowedLanguages: ["en"],
  defaultLanguage: "en",
  maxTokens: 500,
  temperature: 0.7,
  sources: {},
  flags: { voiceEnabled: true, realtimeEnabled: true, publicEmbedEnabled: true },
  assistantConfig: null,
};

const geminiBrain = {
  ...sarvamBrain,
  provider: "gemini",
  chatModel: "gemini-2.5-flash",
  realtimeModel: "gemini-2.5-flash-native-audio-preview-12-2025",
  voiceId: "Puck",
};

vi.mock("@/modules/ai-core/resolve", () => ({
  AIConfigResolutionError: class AIConfigResolutionError extends Error {},
  resolveAIConfig: vi.fn(async () => ({ ...sarvamBrain })),
  // Only OpenAI is keyed in these scenarios — proves the transport branch
  // uses the TRANSPORT provider's credential, never the brain's.
  getProviderApiKey: vi.fn((provider: string) =>
    provider === "openai" ? "test-openai-key" : undefined,
  ),
}));

vi.mock("@/modules/assistant/api/openai-realtime", () => ({
  buildOpenAIRealtimeSession: vi.fn((session: Record<string, unknown>) => session),
  createOpenAIRealtimeClientSecret: vi.fn(async () => ({
    ok: true as const,
    data: { client_secret: { value: "ephemeral-1", expires_at: 9999 } },
  })),
}));

vi.mock("@/modules/assistant/core/voice/realtime-audio-config", () => ({
  getRealtimeAudioPolicy: vi.fn(() => ({
    vadThreshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs: 700,
  })),
}));

vi.mock("@/modules/voice-core/api/gemini/realtime-auth", () => ({
  mintGeminiRealtimeToken: vi.fn(() => "gemini-hmac-token"),
}));

vi.mock("@/modules/voice-core/resolve", () => ({
  VoiceConfigResolutionError: class VoiceConfigResolutionError extends Error {},
  resolveVoiceConfig: vi.fn(async () => ({
    voiceProvider: "sarvam",
    source: "env",
    realtimeProvider: "openai",
    realtimeSource: "agent_settings",
    brain: { ...sarvamBrain },
    elevenlabs: null,
    sarvam: null,
    openai: {
      voiceId: "alloy",
      realtimeModel: "gpt-realtime-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
  })),
}));

vi.mock("@/modules/voice-core/model-catalog", () => ({
  STT_MAX_AUDIO_SECONDS: 300,
  TTS_OUTPUT_FORMAT: "mp3_44100_128",
}));

import { POST } from "./route";
import { createOpenAIRealtimeClientSecret } from "@/modules/assistant/api/openai-realtime";
import { getProviderApiKey, resolveAIConfig } from "@/modules/ai-core/resolve";
import { resolveVoiceConfig } from "@/modules/voice-core/resolve";
import { mintGeminiRealtimeToken } from "@/modules/voice-core/api/gemini/realtime-auth";

const mintMock = vi.mocked(createOpenAIRealtimeClientSecret);
const apiKeyMock = vi.mocked(getProviderApiKey);
const resolveAIMock = vi.mocked(resolveAIConfig);
const resolveVoiceMock = vi.mocked(resolveVoiceConfig);
const mintGeminiMock = vi.mocked(mintGeminiRealtimeToken);

function sessionRequest(): NextRequest {
  return new NextRequest("http://localhost/api/embed/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kbId: "kb-1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
  resolveVoiceMock.mockResolvedValue({
    voiceProvider: "sarvam",
    source: "env",
    realtimeProvider: "openai",
    realtimeSource: "agent_settings",
    brain: { ...sarvamBrain },
    elevenlabs: null,
    sarvam: null,
    openai: {
      voiceId: "alloy",
      realtimeModel: "gpt-realtime-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
  } as never);
  apiKeyMock.mockImplementation((provider: string) =>
    provider === "openai" ? "test-openai-key" : undefined,
  );
  mintMock.mockResolvedValue({
    ok: true,
    data: { client_secret: { value: "ephemeral-1", expires_at: 9999 } },
  } as never);
  delete process.env.GEMINI_REALTIME_MODEL;
  delete process.env.GEMINI_LIVE_MODEL;
  delete process.env.GEMINI_LIVE_VOICE;
});

describe("POST /api/embed/session — voice-axis native realtime transport", () => {
  it("mints an OpenAI Realtime session for a SARVAM brain + OpenAI realtime selection (the incident split)", async () => {
    const res = await POST(sessionRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voiceProvider).toBe("openai");
    expect(body.model).toBe("gpt-realtime-mini");
    expect(body.voice).toBe("alloy");
    expect(body.client_secret?.value).toBe("ephemeral-1");
    // The transport uses the OPENAI credential — never the brain provider's.
    expect(apiKeyMock).toHaveBeenCalledWith("openai");
    expect(mintMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-openai-key" }),
    );
    // The Gemini relay token is never minted on the OpenAI transport.
    expect(mintGeminiMock).not.toHaveBeenCalled();
  });

  it("keeps the OpenAI transport when the brain is Gemini (voice axis wins, not the brain)", async () => {
    resolveAIMock.mockResolvedValue({ ...geminiBrain } as never);
    const res = await POST(sessionRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voiceProvider).toBe("openai");
    expect(body.client_secret?.value).toBe("ephemeral-1");
    expect(mintGeminiMock).not.toHaveBeenCalled();
  });

  it("returns 503 naming OPENAI_API_KEY when the transport credential is missing", async () => {
    apiKeyMock.mockReturnValue(undefined);
    const res = await POST(sessionRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/OPENAI_API_KEY is not configured/);
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("serves the Gemini Live relay descriptor when the realtime voice axis selects Gemini", async () => {
    resolveAIMock.mockResolvedValue({ ...sarvamBrain } as never);
    resolveVoiceMock.mockResolvedValue({
      voiceProvider: "sarvam",
      source: "env",
      realtimeProvider: "gemini",
      realtimeSource: "agent_settings",
      brain: { ...sarvamBrain },
      elevenlabs: null,
      sarvam: null,
      openai: null,
    } as never);
    process.env.GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
    process.env.GEMINI_LIVE_VOICE = "Aoede";
    const res = await POST(sessionRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voiceProvider).toBe("gemini");
    expect(body.realtime?.token).toBe("gemini-hmac-token");
    expect(body.model).toBe("models/gemini-2.5-flash-native-audio-preview-12-2025");
    expect(body.voice).toBe("Aoede");
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("propagates OpenAI session-mint failures with the transport model context", async () => {
    mintMock.mockResolvedValue({
      ok: false,
      status: 401,
      errorText: "invalid key",
    } as never);
    const res = await POST(sessionRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/OpenAI Realtime session creation failed \(401\)/);
    expect(body.model).toBe("gpt-realtime-mini");
  });
});
