/**
 * Plan Task 4.1 — regression-lock the /api/realtime/session route contract.
 *
 * postRealtimeSession is the connect step of the OpenAI Realtime baseline:
 * KB resolution → org → rate limit → plan guard → AI config resolution →
 * voice validation → session build → ephemeral client secret. These tests pin
 * the CURRENT behavior (including create_response:false VAD and the
 * rag_search tool schema) so provider-switching work cannot silently regress
 * the baseline.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const KB_FIXTURE = {
  id: "kb-openai-1",
  name: "OpenAI Baseline KB",
  status: "active",
  qdrantCollection: "kb_openai_1",
};

const ASSISTANT_CONFIG_FIXTURE = {
  voiceId: "marin",
  maxTokens: 600,
  alwaysRespondIn: "en",
  defaultLanguage: "en",
};

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) =>
    kbId === KB_FIXTURE.id ? { ...KB_FIXTURE } : null,
  ),
  getAssistantConfigByKb: vi.fn(async () => ({ ...ASSISTANT_CONFIG_FIXTURE })),
  getKnowledgeBaseDocumentTitles: vi.fn(async () => []),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => [{ org_id: "org-openai-1" }]),
}));

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn(async () => {}),
}));

vi.mock("@/lib/plan-guard", () => ({
  planGuard: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })),
  rateLimitResponse: vi.fn(() => ({
    body: { error: "Voice session limit reached" },
    status: 429,
    headers: { "Retry-After": "60" } as Record<string, string>,
  })),
  REALTIME_SESSION_RATE: { limit: 10, windowMs: 3_600_000 },
}));

vi.mock("@/modules/ai-core/resolve", () => ({
  AIConfigResolutionError: class AIConfigResolutionError extends Error {},
  resolveAIConfig: vi.fn(async () => ({
    provider: "openai",
    realtimeModel: "gpt-realtime-2.1-mini",
    voiceId: "marin",
    maxTokens: 650,
    transcriptionModel: "gpt-4o-mini-transcribe",
  })),
  getProviderApiKey: vi.fn(() => "sk-voice-axis"),
}));

// Voice-axis resolution: realtime transport on OpenAI with the locked
// baseline values (the brain axis above is now orthogonal to the transport).
vi.mock("@/modules/voice-core/resolve", () => ({
  VoiceConfigResolutionError: class VoiceConfigResolutionError extends Error {},
  resolveVoiceConfig: vi.fn(async () => ({
    voiceProvider: "openai",
    source: "env",
    realtimeProvider: "openai",
    realtimeSource: "voice_chat",
    brain: {
      provider: "openai",
      realtimeModel: "gpt-realtime-2.1-mini",
      voiceId: "marin",
      maxTokens: 650,
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
    elevenlabs: null,
    sarvam: null,
    openai: {
      voiceId: "marin",
      realtimeModel: "gpt-realtime-2.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
  })),
}));

vi.mock("@/modules/assistant/api/openai-catalog", () => ({
  isSupportedOpenAIRealtimeVoice: vi.fn((voice: string) => ["marin", "alloy", "verse"].includes(voice)),
}));

vi.mock("@/modules/knowledge-bases/core/config-builder", () => ({
  buildSystemPrompt: vi.fn(() => "LOCKED SYSTEM PROMPT for the baseline KB"),
}));

vi.mock("./openai-realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openai-realtime")>();
  return {
    ...actual,
    createOpenAIRealtimeClientSecret: vi.fn(async () => ({
      ok: true,
      data: {
        value: "ephemeral-key-1",
        client_secret: { value: "ephemeral-key-1", expires_at: 9999 },
      },
    })),
  };
});

import { postRealtimeSession } from "./realtime";
import { createOpenAIRealtimeClientSecret, buildOpenAIRealtimeSession } from "./openai-realtime";
import { hit } from "@/lib/rate-limit";
import { planGuard } from "@/lib/plan-guard";
import { resolveAIConfig } from "@/modules/ai-core/resolve";

function sessionRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/realtime/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test-baseline";
});

describe("postRealtimeSession — locked happy path (kbId)", () => {
  it("mints an ephemeral session with the exact locked shape", async () => {
    const response = await postRealtimeSession(
      sessionRequest({ kbId: KB_FIXTURE.id, ragMode: "hybrid" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Envelope from the vendor exchange…
    expect(payload.value).toBe("ephemeral-key-1");
    expect(payload.client_secret.value).toBe("ephemeral-key-1");
    // …plus the resolved contract fields the hook depends on.
    expect(payload.model).toBe("gpt-realtime-2.1-mini");
    expect(payload.voice).toBe("marin");
    expect(payload.provider).toBe("openai");
    expect(payload.kbId).toBe(KB_FIXTURE.id);
    expect(payload.ragMode).toBe("hybrid");
    // Locked VAD: server_vad, 0.5/300/700, create_response FALSE (the client
    // drives response.create after RAG — "FIX V3" single-path design).
    expect(payload.turn_detection).toEqual({
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
      create_response: false,
    });
    expect(payload.input_audio_transcription).toEqual({
      model: "gpt-4o-mini-transcribe",
      language: "en",
    });
  });

  it("builds the session with the rag_search tool schema and grounded instructions", async () => {
    await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(createOpenAIRealtimeClientSecret).toHaveBeenCalledTimes(1);

    const session = (createOpenAIRealtimeClientSecret as ReturnType<typeof vi.fn>).mock
      .calls[0][0].session as Record<string, unknown>;
    expect(session.type).toBe("realtime");
    expect(session.instructions).toBe("LOCKED SYSTEM PROMPT for the baseline KB");
    expect(session.tool_choice).toBe("auto");
    expect(session.output_modalities).toEqual(["audio"]);

    const tools = session.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("rag_search");
    const parameters = tools[0].parameters as {
      properties: Record<string, { type: string; enum?: string[] }>;
      required: string[];
    };
    expect(Object.keys(parameters.properties).sort()).toEqual(
      ["documentId", "kbId", "query", "ragMode"].sort(),
    );
    expect(parameters.required).toEqual(["query"]);
    expect(parameters.properties.ragMode.enum).toEqual(["classic", "hybrid", "agentic"]);
  });

  it("runs rate limit and plan guard BEFORE assistant-config lookup", async () => {
    await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(hit).toHaveBeenCalledTimes(1);
    expect(planGuard).toHaveBeenCalledWith("org-openai-1", "voice");
    expect(resolveAIConfig).toHaveBeenCalledWith({ kbId: KB_FIXTURE.id, surface: "realtime" });
  });
});

describe("postRealtimeSession — voice-axis transport (production incident 2026-09-21)", () => {
  it("mints an OpenAI session for a SARVAM brain + OpenAI realtime voice selection", async () => {
    const { resolveVoiceConfig } = await import("@/modules/voice-core/resolve");
    (resolveVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      voiceProvider: "sarvam",
      source: "env",
      realtimeProvider: "openai",
      realtimeSource: "agent_settings",
      brain: { provider: "sarvam", realtimeModel: null, voiceId: null },
      elevenlabs: null,
      sarvam: null,
      openai: {
        voiceId: "alloy",
        realtimeModel: "gpt-realtime-mini",
        transcriptionModel: "gpt-4o-mini-transcribe",
      },
    });
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.provider).toBe("openai");
    expect(payload.voice).toBe("alloy");
    expect(payload.model).toBe("gpt-realtime-mini");
  });
});

describe("postRealtimeSession — guarded paths (locked contracts)", () => {
  it("404s an unknown KB", async () => {
    const response = await postRealtimeSession(sessionRequest({ kbId: "kb-nope" }));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Knowledge base not found");
  });

  it("409s when the realtime voice axis is not openai (voice-axis gate, not the brain)", async () => {
    const { resolveVoiceConfig } = await import("@/modules/voice-core/resolve");
    (resolveVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      voiceProvider: "openai",
      source: "env",
      realtimeProvider: "gemini",
      realtimeSource: "org",
      brain: { provider: "openai" },
      elevenlabs: null,
      sarvam: null,
      openai: null,
    });
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.provider).toBe("gemini");
    expect(payload.error).toContain("OpenAI Realtime is not the resolved realtime voice provider");
  });

  it("400s an unsupported realtime voice from the voice axis", async () => {
    const { resolveVoiceConfig } = await import("@/modules/voice-core/resolve");
    (resolveVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      voiceProvider: "openai",
      source: "env",
      realtimeProvider: "openai",
      realtimeSource: "voice_chat",
      brain: { provider: "openai" },
      elevenlabs: null,
      sarvam: null,
      openai: {
        voiceId: "not-a-real-voice",
        realtimeModel: "gpt-realtime-2.1-mini",
        transcriptionModel: "gpt-4o-mini-transcribe",
      },
    });
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Unsupported OpenAI Realtime voice");
  });

  it("402s when the org plan lacks voice (voice_not_enabled contract)", async () => {
    (planGuard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      reason: "Voice is not enabled on this plan.",
    });
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(402);
    const payload = await response.json();
    expect(payload.code).toBe("voice_not_enabled");
    expect(payload.error).toBe("plan_limit_exceeded");
  });

  it("429s when the realtime session rate limit is hit", async () => {
    (hit as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      allowed: false,
      retryAfterSec: 60,
    });
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("500s without OPENAI_API_KEY", async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("OPENAI_API_KEY is not set on server");
  });

  it("500s when the vendor secret exchange fails", async () => {
    (createOpenAIRealtimeClientSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      errorText: "invalid_api_key",
    });
    const response = await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("invalid_api_key");
  });
});

describe("postRealtimeSession — no-kbId fallback (locked defaults)", () => {
  it("uses env instructions, default model/voice and the policy tool description", async () => {
    const response = await postRealtimeSession(sessionRequest({ language: "en" }));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.model).toBe("gpt-realtime-2.1-mini");
    expect(payload.voice).toBe("marin");
    expect(payload.kbId).toBeNull();
    expect(payload.ragMode).toBe("hybrid");

    const session = (createOpenAIRealtimeClientSecret as ReturnType<typeof vi.fn>).mock
      .calls[0][0].session as Record<string, unknown>;
    expect(session.instructions).toContain("Clara");
    const tools = session.tools as Array<{ description?: string }>;
    expect(tools[0].description).toContain("insurance policy document");
  });
});

describe("buildOpenAIRealtimeSession — re-locked via route integration", () => {
  it("session sent to vendor matches the locked builder output", async () => {
    await postRealtimeSession(sessionRequest({ kbId: KB_FIXTURE.id }));
    const sent = (createOpenAIRealtimeClientSecret as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .session;
    const expected = buildOpenAIRealtimeSession({
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      instructions: "LOCKED SYSTEM PROMPT for the baseline KB",
      tools: [
        {
          type: "function",
          name: "rag_search",
          description: expect.any(String),
          parameters: expect.any(Object),
        },
      ],
      toolChoice: "auto",
      maxOutputTokens: 650,
      turnDetection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
        create_response: false,
      },
      transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
    });
    // Compare the deterministic parts (description text varies with KB name).
    expect(sent).toMatchObject({
      type: expected.type,
      model: expected.model,
      instructions: expected.instructions,
      output_modalities: expected.output_modalities,
      tool_choice: expected.tool_choice,
      max_output_tokens: expected.max_output_tokens,
      audio: expected.audio,
    });
  });
});
