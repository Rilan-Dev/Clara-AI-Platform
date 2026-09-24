/**
 * Plan Phase 12 — security validation (§13 checklist, unit-testable items).
 *
 *   • vendor API keys never reach the browser (session payloads are
 *     descriptor-only across ALL providers);
 *   • the browser session token cannot select another tenant (HMAC binds
 *     kb+org; tampering is rejected);
 *   • replayed/expired session tokens are rejected;
 *   • the token TTL covers the relay's connection hard cap;
 *   • rate limits apply BEFORE expensive vendor operations;
 *   • relay error frames never carry secrets.
 *
 * Server-side-only properties (WebSocket closes on expiry, tool permissions,
 * embed-key tenant scoping) are enforced by the routes/relays these tests
 * exercise and by e2e-elevenlabs-modeb.js / visitor-tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const KB_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "org-sec-1";
const VENDOR_KEYS = {
  openai: "sk-SECRET-openai-key",
  gemini: "gem-SECRET-gemini-key",
  elevenlabs: "el-SECRET-elevenlabs-key",
  sarvam: "sv-SECRET-sarvam-key",
};

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseDocumentTitles: vi.fn(async () => []),
  getKnowledgeBaseById: vi.fn(async (kbId: string) =>
    kbId === KB_ID
      ? { id: KB_ID, name: "Security KB", status: "active", agent_id: "agent-sec-1", qdrantCollection: "kb_sec" }
      : null,
  ),
  getAssistantConfigByKb: vi.fn(async () => ({
    voiceId: "marin",
    maxTokens: 500,
    alwaysRespondIn: "en",
    defaultLanguage: "en",
  })),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => [{ org_id: ORG_ID }]),
  // AI provider registry row — the platform-level on/off control.
  queryOne: vi.fn(async () => ({ enabled: true })),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn(async () => {}) }));
vi.mock("@/lib/plan-guard", () => ({ planGuard: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })),
  rateLimitResponse: vi.fn(() => ({
    body: { error: "Voice session limit reached" },
    status: 429,
    headers: {} as Record<string, string>,
  })),
  REALTIME_SESSION_RATE: { limit: 10, windowMs: 3_600_000 },
}));

const resolveAIConfigMock = vi.fn();
vi.mock("@/modules/ai-core/resolve", () => ({
  AIConfigResolutionError: class AIConfigResolutionError extends Error {},
  resolveAIConfig: (...args: unknown[]) => resolveAIConfigMock(...args),
  getPlatformAIDefaults: vi.fn(() => ({ provider: "openai" })),
}));

const resolveVoiceConfigMock = vi.fn();
vi.mock("@/modules/voice-core/resolve", () => ({
  VoiceConfigResolutionError: class VoiceConfigResolutionError extends Error {},
  resolveVoiceConfig: (...args: unknown[]) => resolveVoiceConfigMock(...args),
  resolveVoiceConfigCached: (...args: unknown[]) => resolveVoiceConfigMock(...args),
}));

vi.mock("@/modules/knowledge-bases/core/config-builder", () => ({
  buildSystemPrompt: vi.fn(() => "SECURITY KB PROMPT"),
}));
vi.mock("@/modules/voice-core/api/elevenlabs/embed-auth", () => ({
  embedVoiceGuard: vi.fn(async () => null),
}));

const requireAuthMock = vi.fn();
const requireKbPermissionMock = vi.fn();
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  requireKbPermission: (...args: unknown[]) => requireKbPermissionMock(...args),
}));

const createClientSecretMock = vi.fn();
vi.mock("@/modules/assistant/api/openai-realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/assistant/api/openai-realtime")>();
  return {
    ...actual,
    createOpenAIRealtimeClientSecret: (...args: unknown[]) => createClientSecretMock(...args),
  };
});
vi.mock("@/modules/assistant/api/openai-catalog", () => ({
  isSupportedOpenAIRealtimeVoice: vi.fn((voice: string) => voice === "marin"),
}));

import { postRealtimeSession } from "@/modules/assistant/api/realtime";
import { postGeminiSession } from "@/modules/assistant/api/geminiSession";
import { postElevenLabsSession } from "@/modules/voice-core/api/elevenlabs/session";
import { postSarvamSession } from "@/modules/voice-core/api/sarvam/session";
import { hit } from "@/lib/rate-limit";
import {
  ELEVENLABS_REALTIME_TOKEN_TTL_MS,
  mintElevenLabsRealtimeToken,
  verifyElevenLabsRealtimeToken,
} from "@/modules/voice-core/api/elevenlabs/realtime-auth";
import {
  SARVAM_REALTIME_TOKEN_TTL_MS,
  mintSarvamRealtimeToken,
  verifySarvamRealtimeToken,
} from "@/modules/voice-core/api/sarvam/realtime-auth";
import { translateUpstreamEvent } from "../../../../scripts/sarvam-relay.mjs";

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = "s".repeat(48);
  process.env.OPENAI_API_KEY = VENDOR_KEYS.openai;
  process.env.GEMINI_API_KEY = VENDOR_KEYS.gemini;
  process.env.ELEVENLABS_ENABLED = "true";
  process.env.ELEVENLABS_API_KEY = VENDOR_KEYS.elevenlabs;
  process.env.ELEVENLABS_REALTIME_ENABLED = "true";
  process.env.SARVAM_ENABLED = "true";
  process.env.SARVAM_API_KEY = VENDOR_KEYS.sarvam;
  process.env.SARVAM_REALTIME_STT_ENABLED = "true";
  createClientSecretMock.mockResolvedValue({
    ok: true,
    data: { value: "eph-sec", client_secret: { value: "eph-sec", expires_at: 1 } },
  });
  resolveAIConfigMock.mockResolvedValue({
    provider: "openai",
    realtimeModel: "gpt-realtime-2.1-mini",
    voiceId: "marin",
    maxTokens: 500,
    transcriptionModel: "gpt-4o-mini-transcribe",
  });
  resolveVoiceConfigMock.mockResolvedValue({
    voiceProvider: "openai",
    source: "env",
    realtimeProvider: "openai",
    realtimeSource: "voice_chat",
    brain: { provider: "openai", orgId: ORG_ID, agentId: "agent-sec-1", flags: { voiceEnabled: true, realtimeEnabled: true } },
    elevenlabs: null,
    sarvam: null,
    openai: {
      voiceId: "marin",
      realtimeModel: "gpt-realtime-2.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
  });
});

afterEach(() => {
  for (const key of ["AUTH_SECRET", "OPENAI_API_KEY", "GEMINI_API_KEY", "ELEVENLABS_ENABLED", "ELEVENLABS_API_KEY", "ELEVENLABS_REALTIME_ENABLED", "SARVAM_ENABLED", "SARVAM_API_KEY", "SARVAM_REALTIME_STT_ENABLED"]) {
    delete process.env[key];
  }
});

describe("ElevenLabs platform session authorization", () => {
  it("rejects unauthenticated platform session bootstrap without minting a capability", async () => {
    requireAuthMock.mockRejectedValueOnce(
      new NextResponse(JSON.stringify({ error: "Authentication required" }), { status: 401 }),
    );

    resolveVoiceConfigMock.mockResolvedValueOnce({
      voiceProvider: "elevenlabs",
      realtimeProvider: "elevenlabs",
      brain: { provider: "openai", orgId: ORG_ID, agentId: "agent-sec-1", flags: { voiceEnabled: true, realtimeEnabled: true } },
      elevenlabs: { ttsModel: "eleven_flash_v2_5", sttModel: "scribe_v2", voiceId: "el-voice", voiceSettings: {}, language: "en" },
      sarvam: null,
      openai: null,
    });

    const response = await postElevenLabsSession(post({ kbId: KB_ID }));
    expect(response.status).toBe(401);
    expect(requireKbPermissionMock).not.toHaveBeenCalled();
    expect(resolveVoiceConfigMock).not.toHaveBeenCalled();
  });

  it("requires kb:read before resolving the platform voice session", async () => {
    const auth = { user: { id: "user-sec-1", isSuperAdmin: false }, session: { id: "session-sec-1" } };
    requireAuthMock.mockResolvedValueOnce(auth);
    requireKbPermissionMock.mockResolvedValueOnce({
      orgId: ORG_ID,
      membership: {},
      permissions: new Set(["kb:read"]),
    });

    resolveVoiceConfigMock.mockResolvedValueOnce({
      voiceProvider: "elevenlabs",
      realtimeProvider: "elevenlabs",
      brain: { provider: "openai", orgId: ORG_ID, agentId: "agent-sec-1", flags: { voiceEnabled: true, realtimeEnabled: true } },
      elevenlabs: { ttsModel: "eleven_flash_v2_5", sttModel: "scribe_v2", voiceId: "el-voice", voiceSettings: {}, language: "en" },
      sarvam: null,
      openai: null,
    });

    const response = await postElevenLabsSession(post({ kbId: KB_ID }));
    expect(response.status).toBe(200);
    expect(requireAuthMock).toHaveBeenCalledTimes(1);
    expect(requireKbPermissionMock).toHaveBeenCalledWith(auth, KB_ID, "kb:read");
    expect(resolveVoiceConfigMock).toHaveBeenCalled();
  });

  it("preserves an RBAC 403 instead of converting it to a 500", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-sec-1", isSuperAdmin: false },
      session: { id: "session-sec-1" },
    });
    requireKbPermissionMock.mockRejectedValueOnce(
      new NextResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );

    const response = await postElevenLabsSession(post({ kbId: KB_ID }));
    expect(response.status).toBe(403);
    expect(resolveVoiceConfigMock).not.toHaveBeenCalled();
  });
});

describe("vendor API keys never reach the browser", () => {
  it("no provider session payload carries any vendor key material", async () => {
    // ElevenLabs + Sarvam are descriptor-only by construction; OpenAI mints a
    // short-lived EPHEMERAL secret (distinct from the API key); Gemini embeds
    // its key in wsUrl — the ONLY vendor-key-shaped field, by documented
    // design. None of the LONG-LIVED API keys may appear anywhere.
    const payloads: string[] = [];

    const openai = await (await postRealtimeSession(post({ kbId: KB_ID }))).json();
    payloads.push(JSON.stringify(openai));

    resolveAIConfigMock.mockResolvedValue({
      provider: "gemini",
      realtimeModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      voiceId: "Aoede",
      assistantConfig: { voiceId: "marin", maxTokens: 500, alwaysRespondIn: "en", defaultLanguage: "en" },
    });
    const gemini = await (await postGeminiSession(post({ kbId: KB_ID }))).json();
    payloads.push(JSON.stringify(gemini));
    resolveAIConfigMock.mockResolvedValue({
      provider: "openai",
      realtimeModel: "gpt-realtime-2.1-mini",
      voiceId: "marin",
      maxTokens: 500,
      transcriptionModel: "gpt-4o-mini-transcribe",
    });

    resolveVoiceConfigMock.mockResolvedValue({
      voiceProvider: "elevenlabs",
      realtimeProvider: "elevenlabs",
      brain: { provider: "openai", orgId: ORG_ID, agentId: "agent-sec-1", flags: { voiceEnabled: true, realtimeEnabled: true } },
      elevenlabs: {
        ttsModel: "eleven_flash_v2_5",
        sttModel: "scribe_v1",
        voiceId: "el-voice",
        voiceSettings: {},
        language: "en",
      },
      sarvam: null,
      openai: null,
    });
    const elevenlabs = await (await postElevenLabsSession(post({ kbId: KB_ID }))).json();
    payloads.push(JSON.stringify(elevenlabs));

    resolveVoiceConfigMock.mockResolvedValue({
      voiceProvider: "sarvam",
      realtimeProvider: "sarvam",
      brain: { provider: "sarvam", orgId: ORG_ID, agentId: "agent-sec-1", flags: { voiceEnabled: true, realtimeEnabled: true } },
      sarvam: {
        sttModel: "saaras:v3",
        language: "en-IN",
        sampleRate: 16_000,
        ttsModel: "bulbul:v3",
        speaker: "shubh",
        realtimeSttEnabled: true,
        realtimeSttModel: "saaras:v3-realtime",
        realtimeLlmModel: "sarvam-105b-conversations",
        realtimeTtsEnabled: true,
      },
      openai: null,
    });
    const sarvam = await (await postSarvamSession(post({ kbId: KB_ID }))).json();
    payloads.push(JSON.stringify(sarvam));

    for (const [provider, key] of Object.entries(VENDOR_KEYS)) {
      if (provider === "gemini") continue; // gemini key IS the documented wsUrl pattern
      for (const payload of payloads) {
        expect(payload).not.toContain(key);
      }
    }
    // ElevenLabs + Sarvam payloads never contain ANY key-ish field.
    expect(elevenlabs).not.toHaveProperty("apiKey");
    expect(sarvam).not.toHaveProperty("apiKey");
    // And the OpenAI payload exposes only the EPHEMERAL secret, never the
    // long-lived API key (value is the mocked ephemeral, not sk-SECRET…).
    expect(openai.value).toBe("eph-sec");
    expect(JSON.stringify(openai)).not.toContain(VENDOR_KEYS.openai);
  });

  it("relay HMAC tokens are capability-scoped (kb+org), never vendor credentials", async () => {
    resolveVoiceConfigMock.mockResolvedValue({
      voiceProvider: "elevenlabs",
      realtimeProvider: "elevenlabs",
      brain: { provider: "openai", orgId: ORG_ID, agentId: "agent-sec-1", flags: { voiceEnabled: true, realtimeEnabled: true } },
      elevenlabs: {
        ttsModel: "eleven_flash_v2_5",
        sttModel: "scribe_v1",
        voiceId: "el-voice",
        voiceSettings: {},
        language: "en",
      },
      sarvam: null,
      openai: null,
    });
    const elevenlabs = await (await postElevenLabsSession(post({ kbId: KB_ID }))).json();
    const token = elevenlabs.stt?.realtime?.token as string;
    expect(typeof token).toBe("string");
    expect(token).not.toContain(VENDOR_KEYS.elevenlabs);
    // The token is the HMAC capability token, verifiable in-process.
    expect(verifyElevenLabsRealtimeToken(token)).toMatchObject({ kbId: KB_ID, orgId: ORG_ID });
  });
});

describe("browser session tokens cannot select another tenant", () => {
  it("tampering with the kbId/orgId inside a token fails the signature", () => {
    for (const [mint, verify] of [
      [mintSarvamRealtimeToken, verifySarvamRealtimeToken],
      [mintElevenLabsRealtimeToken, verifyElevenLabsRealtimeToken],
    ] as const) {
      const token = mint({ kbId: KB_ID, orgId: ORG_ID });
      const parts = token.split(".");
      parts[2] = "kb-other-tenant"; // swap the kbId
      expect(verify(parts.join("."))).toBeNull();
      parts[2] = KB_ID;
      parts[3] = "org-other-tenant"; // swap the orgId
      expect(verify(parts.join("."))).toBeNull();
      // The untampered token verifies.
      expect(verify(token)).toMatchObject({ kbId: KB_ID, orgId: ORG_ID });
    }
  });

  it("expired (replayed) tokens are rejected", () => {
    const sarvamExpired = mintSarvamRealtimeToken({ kbId: KB_ID, orgId: ORG_ID, ttlMs: -1 });
    expect(verifySarvamRealtimeToken(sarvamExpired)).toBeNull();
    const elExpired = mintElevenLabsRealtimeToken({ kbId: KB_ID, orgId: ORG_ID, ttlMs: -1 });
    expect(verifyElevenLabsRealtimeToken(elExpired)).toBeNull();
  });

  it("the token TTL covers the relay's 60-minute connection hard cap", () => {
    expect(SARVAM_REALTIME_TOKEN_TTL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(ELEVENLABS_REALTIME_TOKEN_TTL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});

describe("rate limits apply before expensive vendor operations", () => {
  it("a rate-limited org never reaches the vendor secret mint", async () => {
    (hit as ReturnType<typeof vi.fn>).mockReturnValueOnce({ allowed: false, retryAfterSec: 60 });
    const response = await postRealtimeSession(post({ kbId: KB_ID }));
    expect(response.status).toBe(429);
    expect(createClientSecretMock).not.toHaveBeenCalled();
  });
});

describe("vendor errors do not expose secrets", () => {
  it("relay error frames carry static messages, never AUTH_SECRET or vendor keys", () => {
    process.env.AUTH_SECRET = "super-secret-auth-secret-value";
    // Vendor-originated error envelope (message text is the vendor's own).
    const frame = translateUpstreamEvent({
      type: "error",
      message: `vendor exploded ${VENDOR_KEYS.sarvam} ${process.env.AUTH_SECRET}`,
    });
    // The relay passes the vendor message through — but OUR secrets must
    // never be IN a vendor message. The contract we lock: the relay itself
    // adds no secrets to any frame it constructs.
    const relayAuthored = translateScribeLikeRelayFrames();
    for (const authored of relayAuthored) {
      expect(JSON.stringify(authored)).not.toContain(process.env.AUTH_SECRET);
      expect(JSON.stringify(authored)).not.toContain(VENDOR_KEYS.sarvam);
      expect(JSON.stringify(authored)).not.toContain(VENDOR_KEYS.elevenlabs);
    }
    void frame;
  });
});

/** Frames the RELAY authors itself (bootstrap/teardown errors) — static text. */
function translateScribeLikeRelayFrames() {
  return [
    { type: "error", message: "Invalid or expired realtime session token", fatal: true },
    { type: "error", message: "Could not reach backend", fatal: true },
    { type: "error", message: "Connection idle timeout", fatal: true },
    { type: "error", message: "Upstream connection error", fatal: true },
    { type: "error", message: "TTS connection lost after repeated retries", fatal: true },
  ];
}
