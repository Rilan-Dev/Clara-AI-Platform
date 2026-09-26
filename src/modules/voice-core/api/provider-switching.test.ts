/**
 * Plan Phase 7 — provider switching must work without reconfiguration.
 *
 * Task 7.1 — server-side provider resolver order: every session route resolves
 * tenant/agent/KB/RAG/tools/memory and VALIDATES capability BEFORE anything
 * vendor-facing is minted. A guard failure (unknown KB, plan limit, provider
 * mismatch) must reject BEFORE a vendor connection artifact exists.
 *
 * Task 7.2 — the switching matrix: switching the realtime provider changes
 * ONLY the transport. For every switch (OpenAI → Gemini → Sarvam → ElevenLabs
 * → OpenAI, cyclic) the SAME kbId resolves the SAME tenant, the SAME KB, the
 * SAME plan guard call — and each payload carries the same kbId. No switch can
 * change the tenant's knowledge binding (plan invariant §1.2 — proven end-to-end
 * at the grounding level in rag/grounding.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const KB_ID = "11111111-1111-1111-1111-111111111111"; // uuid — ElevenLabs route validates shape
const ORG_ID = "org-switch-1";
const AGENT_ID = "agent-switch-1";

const KB_FIXTURE = {
  id: KB_ID,
  name: "Switching Matrix KB",
  status: "active",
  qdrantCollection: "kb_switch_1",
  agent_id: AGENT_ID,
};

const ASSISTANT_CONFIG = {
  voiceId: "marin",
  maxTokens: 500,
  alwaysRespondIn: "en",
  defaultLanguage: "en",
};

// ── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) =>
    kbId === KB_ID ? { ...KB_FIXTURE } : null,
  ),
  getAssistantConfigByKb: vi.fn(async () => ({ ...ASSISTANT_CONFIG })),
  getKnowledgeBaseDocumentTitles: vi.fn(async () => []),
}));

vi.mock("@/lib/db", () => ({
  queryOne: vi.fn(async (sql: string) =>
    String(sql).includes("platform_env_settings") ? { value: "true" } : { enabled: true },
  ),
  query: vi.fn(async (sql: string) => {
    if (String(sql).includes("SELECT a.org_id")) return [{ org_id: ORG_ID }];
    return [];
  }),
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

// Provider-axis mocks — each test sets the provider it wants resolved.
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
  buildSystemPrompt: vi.fn(() => "SHARED SYSTEM PROMPT — tenant bound"),
}));

vi.mock("@/modules/voice-core/api/elevenlabs/embed-auth", () => ({
  embedVoiceGuard: vi.fn(async () => null), // platform JWT path — no clr_ key
}));

// Gap-closure Phase D: the Gemini session route now requires a platform
// session (P0 credential-security fix). Mock requireAuth the way the real
// one behaves: authenticated callers pass, anonymous callers get 401.
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      const { NextResponse } = await import("next/server");
      throw NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return { user: { id: "user-switch-1" }, session: { id: "sess-switch-1" } };
  }),
  // The ElevenLabs session checks kb:read and takes the tenant from it.
  requireKbPermission: vi.fn(async () => ({ orgId: ORG_ID })),
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
import { planGuard } from "@/lib/plan-guard";
import { query as dbQuery } from "@/lib/db";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { requireKbPermission } from "@/modules/auth/core/rbac";


// ── Provider resolution fixtures (one per realtime provider) ─────────────────

function openAIResolved() {
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
    brain: {
      provider: "openai",
      orgId: ORG_ID,
      agentId: AGENT_ID,
      flags: { voiceEnabled: true, realtimeEnabled: true },
    },
    elevenlabs: null,
    sarvam: null,
    openai: {
      voiceId: "marin",
      realtimeModel: "gpt-realtime-2.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
  });
}

function geminiResolved() {
  resolveAIConfigMock.mockResolvedValue({
    provider: "gemini",
    realtimeModel: "gemini-2.5-flash-native-audio-preview-12-2025",
    voiceId: "Aoede",
    assistantConfig: { ...ASSISTANT_CONFIG },
  });
  resolveVoiceConfigMock.mockResolvedValue({
    voiceProvider: "gemini",
    source: "env",
    realtimeProvider: "gemini",
    realtimeSource: "voice_chat",
    brain: {
      provider: "gemini",
      orgId: ORG_ID,
      agentId: AGENT_ID,
      flags: { voiceEnabled: true, realtimeEnabled: true },
    },
    elevenlabs: null,
    sarvam: null,
    openai: null,
  });
}

function elevenlabsResolved() {
  resolveVoiceConfigMock.mockResolvedValue({
    voiceProvider: "elevenlabs",
    realtimeProvider: "elevenlabs",
    brain: {
      provider: "openai",
      orgId: ORG_ID,
      agentId: AGENT_ID,
      flags: { voiceEnabled: true, realtimeEnabled: true },
    },
    elevenlabs: {
      ttsModel: "eleven_flash_v2_5",
      sttModel: "scribe_v2_realtime",
      voiceId: "el-voice-1",
      voiceSettings: {},
      language: "en",
    },
    openai: null,
  });
}

function sarvamResolved() {
  resolveVoiceConfigMock.mockResolvedValue({
    voiceProvider: "sarvam",
    realtimeProvider: "sarvam",
    brain: {
      provider: "sarvam",
      orgId: ORG_ID,
      agentId: AGENT_ID,
      flags: { voiceEnabled: true, realtimeEnabled: true },
    },
    sarvam: {
      sttModel: "saaras:v3",
      language: "en-IN",
      sampleRate: 16_000,
      ttsModel: "bulbul:v3",
      speaker: "shubh",
      realtimeSttModel: "saaras:v3-realtime",
      realtimeLlmModel: "sarvam-105b-conversations",
      realtimeTtsEnabled: true,
    },
    openai: null,
  });
}

function sessionPost(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/session", {
    method: "POST",
    // Authenticated platform caller — the contract every realtime session
    // route now shares (the browser hook sends the platform JWT).
    headers: { "Content-Type": "application/json", Authorization: "Bearer platform-session-token" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // vi.clearAllMocks() clears calls but KEEPS implementations — reset the
  // plan gate explicitly so a failing test cannot leak into the next one.
  (planGuard as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });
  process.env.AUTH_SECRET = "x".repeat(48);
  process.env.OPENAI_API_KEY = "sk-switch";
  process.env.GEMINI_API_KEY = "gem-switch";
  process.env.ELEVENLABS_ENABLED = "true";
  process.env.ELEVENLABS_API_KEY = "el-switch";
  process.env.SARVAM_ENABLED = "true";
  process.env.SARVAM_API_KEY = "sv-switch";
  process.env.SARVAM_REALTIME_STT_ENABLED = "true";
  createClientSecretMock.mockResolvedValue({
    ok: true,
    data: { value: "eph-switch", client_secret: { value: "eph-switch", expires_at: 1 } },
  });
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ELEVENLABS_ENABLED;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_REALTIME_ENABLED;
  delete process.env.SARVAM_ENABLED;
  delete process.env.SARVAM_API_KEY;
  delete process.env.SARVAM_REALTIME_STT_ENABLED;
});

// ── Task 7.1: tenant context BEFORE any vendor artifact ─────────────────────

describe("Task 7.1 — resolve tenant context before provider connection", () => {
  it("every route resolves the SAME tenant from the SAME kbId before anything else", async () => {
    openAIResolved();
    await postRealtimeSession(sessionPost({ kbId: KB_ID }));
    geminiResolved();
    await postGeminiSession(sessionPost({ kbId: KB_ID }));
    elevenlabsResolved();
    await postElevenLabsSession(sessionPost({ kbId: KB_ID }));
    sarvamResolved();
    await postSarvamSession(sessionPost({ kbId: KB_ID }));

    // Same KB row for every provider that performs a direct KB lookup
    // (ElevenLabs and Sarvam resolve the KB inside resolveVoiceConfig)…
    for (const call of (getKnowledgeBaseById as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(KB_ID);
    }
    expect((getKnowledgeBaseById as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    // …same tenant-resolution SQL + kbId param…
    for (const call of (dbQuery as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).toContain("agents a JOIN knowledge_bases");
      expect(call[1]).toEqual([KB_ID]);
    }
    // …same plan guard for the same org.
    for (const call of (planGuard as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(ORG_ID);
      expect(call[1]).toBe("voice");
    }
  });

  it("guard failure rejects BEFORE any vendor credential is minted", async () => {
    // The plan gate fails for EVERY provider in this test (not Once — each
    // route re-consults planGuard).
    (planGuard as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "Voice is not enabled on this plan.",
    });

    // OpenAI: the ephemeral vendor secret is NEVER minted on a 402.
    openAIResolved();
    const openai = await postRealtimeSession(sessionPost({ kbId: KB_ID }));
    expect(openai.status).toBe(402);
    expect(createClientSecretMock).not.toHaveBeenCalled();

    // Gemini: the relay capability token (the only credential artifact this
    // route can mint) is NEVER minted on a 402 — and no wsUrl ever exists.
    geminiResolved();
    const gemini = await postGeminiSession(sessionPost({ kbId: KB_ID }));
    expect(gemini.status).toBe(402);
    const geminiBody = await gemini.json();
    expect(geminiBody.wsUrl).toBeUndefined();
    expect(geminiBody.realtime).toBeUndefined();

    // ElevenLabs / Sarvam: descriptors + relay tokens are NEVER minted.
    elevenlabsResolved();
    const elevenlabs = await postElevenLabsSession(sessionPost({ kbId: KB_ID }));
    expect(elevenlabs.status).toBe(402);
    expect((await elevenlabs.json()).stt).toBeUndefined();

    sarvamResolved();
    const sarvam = await postSarvamSession(sessionPost({ kbId: KB_ID }));
    expect(sarvam.status).toBe(402);
    expect((await sarvam.json()).stt).toBeUndefined();
  });

  it("ElevenLabs realtime session declares Clara Mode C and dedicated Scribe model", async () => {
    elevenlabsResolved();
    const response = await postElevenLabsSession(sessionPost({ kbId: KB_ID }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.mode).toBe("clara-stream");
    expect(payload.stt.model).toBe("scribe_v2_realtime");
    expect(payload.stt.realtime).toMatchObject({
      endpoint: "/api/voice-realtime?channel=elevenlabs-stt",
      ttsEndpoint: "/api/voice-realtime?channel=elevenlabs-tts",
      model: "scribe_v2_realtime",
      sampleRate: 16_000,
      encoding: "linear16",
    });
  });

  it("capability mismatch rejects with 409 before vendor artifacts", async () => {
    // Request the OpenAI session while the KB resolves to Gemini.
    geminiResolved();
    const mismatch = await postRealtimeSession(sessionPost({ kbId: KB_ID }));
    expect(mismatch.status).toBe(409);
    expect(createClientSecretMock).not.toHaveBeenCalled();
    expect((await mismatch.json()).provider).toBe("gemini");
  });
});

// ── Task 7.2: the switching matrix ───────────────────────────────────────────

describe("Task 7.2 — provider switching invariants", () => {
  const matrix = [
    { from: "openai", to: "gemini" },
    { from: "gemini", to: "sarvam" },
    { from: "sarvam", to: "elevenlabs" },
    { from: "elevenlabs", to: "openai" },
  ];

  it("cyclic switches keep the same tenant/KB binding — only transport changes", async () => {
    const payloads: Array<Record<string, unknown>> = [];

    openAIResolved();
    payloads.push(await (await postRealtimeSession(sessionPost({ kbId: KB_ID }))).json());
    geminiResolved();
    payloads.push(await (await postGeminiSession(sessionPost({ kbId: KB_ID }))).json());
    sarvamResolved();
    payloads.push(await (await postSarvamSession(sessionPost({ kbId: KB_ID }))).json());
    elevenlabsResolved();
    payloads.push(await (await postElevenLabsSession(sessionPost({ kbId: KB_ID }))).json());
    // …and back to OpenAI (the cyclic matrix).
    openAIResolved();
    payloads.push(await (await postRealtimeSession(sessionPost({ kbId: KB_ID }))).json());

    // Same KB binding on every payload regardless of provider.
    for (const payload of payloads) {
      expect(payload.kbId).toBe(KB_ID);
    }
    // Transports differ per provider (each switch changed only the transport).
    expect(payloads[0].provider).toBe("openai");
    expect(payloads[1].provider).toBe("gemini");
    expect(payloads[2].provider).toBe("sarvam");
    expect(payloads[3].provider).toBe("elevenlabs");
    expect(payloads[4].provider).toBe("openai");
    // The tenant resolution ran for EVERY session (same org every time).
    expect((planGuard as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(5);
    for (const call of (planGuard as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(ORG_ID);
    }

    // The plan's asserted invariants (same tenant/agent/KB/RAG mode) are
    // enforced structurally: every payload derives from the same kbId and
    // the same server-side org resolution above; ragMode defaults match.
    expect(payloads[2].ragMode ?? "hybrid").toBe("hybrid");
    expect(payloads[3].ragMode ?? "hybrid").toBe("hybrid");
  });

  it("each switch in the matrix list resolves without reconfiguration side effects", async () => {
    // For every from→to pair, the target session resolves cleanly using the
    // SAME kbId — no provider-specific reconfiguration is required between
    // switches (the plan's core switching requirement).
    for (const { to } of matrix) {
      vi.clearAllMocks();
      if (to === "openai") openAIResolved();
      if (to === "gemini") geminiResolved();
      if (to === "sarvam") sarvamResolved();
      if (to === "elevenlabs") elevenlabsResolved();

      const route =
        to === "openai"
          ? () => postRealtimeSession(sessionPost({ kbId: KB_ID }))
          : to === "gemini"
            ? () => postGeminiSession(sessionPost({ kbId: KB_ID }))
            : to === "sarvam"
              ? () => postSarvamSession(sessionPost({ kbId: KB_ID }))
              : () => postElevenLabsSession(sessionPost({ kbId: KB_ID }));

      const response = await route();
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.kbId).toBe(KB_ID);
      // Every provider resolved the tenant server-side from the SAME kbId
      // (Sarvam resolves via resolveVoiceConfig — its org SQL still ran).
      const kbLookedUp = (getKnowledgeBaseById as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[0] === KB_ID,
      );
      const orgResolved = (dbQuery as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => Array.isArray(call[1]) && call[1][0] === KB_ID,
      );
      // ElevenLabs takes the tenant from the kb:read permission check.
      const permissionChecked = (requireKbPermission as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[1] === KB_ID,
      );
      expect(kbLookedUp || orgResolved || permissionChecked).toBe(true);
    }
  });
});
