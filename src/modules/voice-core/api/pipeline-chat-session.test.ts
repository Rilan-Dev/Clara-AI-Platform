import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  permission: vi.fn(),
  embedGuard: vi.fn(),
}));
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn(async () => {}) }));
vi.mock("@/lib/db", () => ({ query: vi.fn(async () => [{ org_id: "org-1" }]) }));
vi.mock("@/lib/plan-guard", () => ({ planGuard: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(() => ({ allowed: true })),
  REALTIME_SESSION_RATE: { limit: 20, windowMs: 3600000 },
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/modules/rag/cross-lingual", () => ({ localizeText: vi.fn(async (text: string) => text) }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.auth,
  requireKbPermission: mocks.permission,
}));
vi.mock("@/modules/voice-core/server-provider-availability", () => ({
  isElevenLabsRealtimeEnabled: vi.fn(async () => false),
}));
vi.mock("@/modules/voice-core/api/sarvam/realtime-auth", () => ({
  mintSarvamRealtimeToken: vi.fn(() => "signed-realtime-token"),
}));
vi.mock("@/modules/voice-core/api/elevenlabs/realtime-auth", () => ({
  mintElevenLabsRealtimeToken: vi.fn(() => "signed-realtime-token"),
}));
vi.mock("@/modules/voice-core/api/elevenlabs/embed-auth", () => ({
  embedVoiceGuard: mocks.embedGuard,
}));
vi.mock("@/modules/voice-core/resolve", () => ({
  resolveVoiceConfig: vi.fn(async () => ({
    voiceProvider: "sarvam",
    realtimeProvider: "sarvam",
    sarvam: {
      sttModel: "saaras:v3", language: "en-IN", sttLanguage: "en-IN",
      realtimeSttModel: "saaras:v3", realtimeTtsModel: "bulbul:v3",
      realtimeSpeaker: "priya", realtimeTtsEnabled: true,
      realtimeLlmModel: "sarvam-105b",
    },
    brain: { allowedLanguages: ["en"], defaultLanguage: "en", assistantConfig: null },
  })),
  resolveVoiceConfigCached: vi.fn(async () => ({
    voiceProvider: "elevenlabs",
    realtimeProvider: "elevenlabs",
    elevenlabs: {
      sttModel: "scribe_v1", ttsModel: "eleven_flash_v2_5",
      voiceId: "voice-1", voiceSettings: {}, language: "en",
    },
    brain: { allowedLanguages: ["en"], defaultLanguage: "en", assistantConfig: null },
  })),
  VoiceConfigResolutionError: class VoiceConfigResolutionError extends Error {},
}));
vi.mock("@/modules/ai-core/resolve", () => ({
  AIConfigResolutionError: class AIConfigResolutionError extends Error {},
}));
import { postSarvamSession } from "./sarvam/session";
import { postElevenLabsSession } from "./elevenlabs/session";

const kbId = "ab69cf61-970b-4844-8986-8f772daabae7";
function request(token: string, provider: "sarvam" | "elevenlabs") {
  return new NextRequest("http://localhost:4000/api/voice/" + provider + "/session", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ kbId }),
  });
}

describe("actual realtime session chat endpoint contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.embedGuard.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: "workspace-user" });
    mocks.permission.mockResolvedValue({ orgId: "org-1" });
  });

  for (const [provider, handler] of [
    ["sarvam", postSarvamSession],
    ["elevenlabs", postElevenLabsSession],
  ] as const) {
    it(provider + ": public signed visitors do not receive the workspace chat URL", async () => {
      const response = await handler(request("pub_v1.payload.signature", provider));
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.chat.endpoint).toBe("/api/public/chat");
      if (provider === "elevenlabs") expect(mocks.auth).not.toHaveBeenCalled();
    });
    it(provider + ": widget and workspace receive their own chat routes", async () => {
      for (const [credential, expected] of [
        ["clr_widget", "/api/embed/chat"],
        ["workspace.jwt", "/api/chat"],
      ]) {
        const response = await handler(request(credential, provider));
        expect(response.status).toBe(200);
        expect((await response.json()).chat.endpoint).toBe(expected);
      }
      if (provider === "elevenlabs") expect(mocks.auth).toHaveBeenCalledOnce();
    });
  }
});
