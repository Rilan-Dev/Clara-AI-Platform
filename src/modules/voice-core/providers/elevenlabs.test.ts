/**
 * Unit tests for the ElevenLabs VoiceProviderService implementation and the
 * VoiceProviderFactory — the voice-axis mirror of
 * ai-core/providers/openai.test.ts.
 *
 * Covers: factory singleton semantics, the realtime-provider guard, the
 * lazy missing-key error, vendor error mapping, and the speak() request
 * shape (data-boundary discipline).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VoiceProviderFactory } from "../factory";
import { ElevenLabsError, ElevenLabsVoiceProvider } from "./elevenlabs";
import { isConversationalVoiceService } from "../types";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("VoiceProviderFactory", () => {
  beforeEach(() => { VoiceProviderFactory.reset(); });
  afterEach(() => { VoiceProviderFactory.reset(); vi.unstubAllEnvs(); });

  it("returns a cached default instance (singleton, like ProviderFactory)", () => {
    const a = VoiceProviderFactory.getVoiceService();
    const b = VoiceProviderFactory.getVoiceService();
    expect(a).toBe(b);
    expect(a.getProviderName()).toBe("elevenlabs");
  });

  it("caches configured instances per config key", () => {
    const a = VoiceProviderFactory.getVoiceService({ provider: "elevenlabs", apiKey: "key_one" });
    const b = VoiceProviderFactory.getVoiceService({ provider: "elevenlabs", apiKey: "key_two" });
    const aAgain = VoiceProviderFactory.getVoiceService({ provider: "elevenlabs", apiKey: "key_one" });
    expect(a).not.toBe(b);
    expect(aAgain).toBe(a);
  });

  it("rejects realtime providers — they have no server-side voice service", () => {
    expect(() => VoiceProviderFactory.getVoiceService({ provider: "openai" })).toThrow(/Realtime/);
    expect(() => VoiceProviderFactory.getVoiceService({ provider: "gemini" })).toThrow(/Realtime/);
  });

  it("rejects unknown providers", () => {
    // @ts-expect-error — deliberately invalid provider value
    expect(() => VoiceProviderFactory.getVoiceService({ provider: "azure" })).toThrow(/Unsupported voice provider/);
  });
});

describe("ElevenLabsVoiceProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    VoiceProviderFactory.reset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    VoiceProviderFactory.reset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails lazily with a 503 when no API key is configured", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const provider = new ElevenLabsVoiceProvider();
    await expect(provider.getSubscriptionInfo()).rejects.toMatchObject({
      name: "ElevenLabsError",
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps vendor HTTP errors to short, redacted ElevenLabsErrors", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock.mockResolvedValueOnce(
      new Response("sensitive request echo", { status: 401, statusText: "Unauthorized" }),
    );
    const provider = new ElevenLabsVoiceProvider();
    await expect(provider.getSubscriptionInfo()).rejects.toMatchObject({
      name: "ElevenLabsError",
      status: 401,
    });
    // The error message must not leak the vendor response body.
    await provider.getSubscriptionInfo().catch((err: ElevenLabsError) => {
      expect(err.message).not.toContain("sensitive request echo");
    });
  });

  it("sends only the answer text to speak() — the data boundary", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock.mockResolvedValueOnce(okResponse({}));
    const provider = new ElevenLabsVoiceProvider();
    await provider.speak({
      text: "Hello there.",
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
      modelId: "eleven_flash_v2_5",
      outputFormat: "pcm_16000",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.text).toBe("Hello there.");
    expect(body.model_id).toBe("eleven_flash_v2_5");
    // No document, chunk, or KB metadata ever rides along.
    expect(Object.keys(body).sort()).toEqual(["model_id", "text", "voice_settings"]);
  });

  it("normalises the workspace voice list", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock.mockResolvedValueOnce(
      okResponse({
        voices: [
          {
            voice_id: "JBFqnCBsd6RMkjVDRZzb",
            name: "Rachel",
            category: "premade",
            labels: { accent: "american", use_case: "narration" },
            description: null,
            preview_url: null,
          },
        ],
      }),
    );
    const voices = await new ElevenLabsVoiceProvider().listVoices();
    expect(voices).toHaveLength(1);
    expect(voices[0]).toMatchObject({
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
      name: "Rachel",
      category: "premade",
      labels: { accent: "american", use_case: "narration" },
    });
  });

  // ─── Connect-level retry (2026-09-18 HAR hardening) ────────────────────────

  /** Undici-shaped network failure: TypeError("fetch failed") + cause code. */
  function connectFailure(code: string): TypeError {
    const err = new TypeError("fetch failed");
    (err as { cause?: unknown }).cause = Object.assign(new Error("connect failed"), { code });
    return err;
  }

  it("retries once on connect-level failures and recovers (the HAR 'fetch failed' bursts)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock
      .mockRejectedValueOnce(connectFailure("UND_ERR_CONNECT_TIMEOUT"))
      .mockResolvedValueOnce(okResponse({ text: "Hi", language_code: "eng" }));
    const provider = new ElevenLabsVoiceProvider();
    const result = await provider.transcribeAudio({
      file: new Blob(["audio-bytes"], { type: "audio/webm" }),
      modelId: "scribe_v1",
    });
    expect(result.text).toBe("Hi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries happy-eyeballs AggregateError connect failures", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    const err = new TypeError("fetch failed");
    (err as { cause?: unknown }).cause = new AggregateError([
      Object.assign(new Error("connect ECONNREFUSED ::1:443"), { code: "ECONNREFUSED" }),
    ]);
    fetchMock
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(okResponse({ text: "Hi", language_code: "eng" }));
    const provider = new ElevenLabsVoiceProvider();
    const result = await provider.transcribeAudio({
      file: new Blob(["audio-bytes"], { type: "audio/webm" }),
      modelId: "scribe_v1",
    });
    expect(result.text).toBe("Hi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry twice — a second connect failure surfaces as 502", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock
      .mockRejectedValueOnce(connectFailure("ETIMEDOUT"))
      .mockRejectedValueOnce(connectFailure("ETIMEDOUT"));
    const provider = new ElevenLabsVoiceProvider();
    await expect(provider.listVoices()).rejects.toMatchObject({
      name: "ElevenLabsError",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry vendor HTTP errors (401 maps straight through)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock.mockResolvedValueOnce(new Response("denied", { status: 401, statusText: "Unauthorized" }));
    const provider = new ElevenLabsVoiceProvider();
    await expect(provider.listVoices()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-connect TypeErrors (mid-stream socket loss stays 502)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    fetchMock.mockRejectedValueOnce(new TypeError("terminated"));
    const provider = new ElevenLabsVoiceProvider();
    await expect(provider.listVoices()).rejects.toMatchObject({
      name: "ElevenLabsError",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Mode B capability methods (V4/V5) ───────────────────────────────────────

describe("ElevenLabsVoiceProvider — Conversational AI capability", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    VoiceProviderFactory.reset();
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    VoiceProviderFactory.reset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("satisfies the ConversationalVoiceService capability guard", () => {
    const provider = new ElevenLabsVoiceProvider();
    expect(isConversationalVoiceService(provider)).toBe(true);
  });

  it("normalises vendor agent records", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        agents: [
          {
            agent_id: "agent_vendor_001",
            name: "Front desk voice",
            conversation_config: {
              tts: { voice_id: "JBFqnCBsd6RMkjVDRZzb" },
              language: "en",
              agent: { prompt: { system_prompt: "Be helpful.", first_message: { text: "Hi!" } } },
            },
          },
        ],
      }),
    );
    const agents = await new ElevenLabsVoiceProvider().listConversationalAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      agentId: "agent_vendor_001",
      name: "Front desk voice",
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
      language: "en",
      firstMessage: "Hi!",
      systemPrompt: "Be helpful.",
    });
  });

  it("registers the RAG server tool (HMAC secret + tenant ids) on agent create", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        agent_id: "agent_vendor_002",
        name: "Support voice",
        conversation_config: { tts: { voice_id: "JBFqnCBsd6RMkjVDRZzb" } },
      }),
    );
    await new ElevenLabsVoiceProvider().createConversationalAgent({
      name: "Support voice",
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
      ragTool: {
        url: "https://clara.example/api/internal/elevenlabs/tools/rag-search",
        secret: "hmac_secret",
        orgId: "o1",
        agentId: "a1",
        kbId: "k1",
      },
      twilio: { phoneNumbers: ["+15550001111"] },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/convai/agents/create");
    const body = JSON.parse(String(init.body)) as {
      tools: { name: string; url: string; config: Record<string, unknown> }[];
      conversation_config: { twilio?: { phone_numbers: string[] } };
    };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("clara_rag_search");
    expect(body.tools[0].url).toContain("/api/internal/elevenlabs/tools/rag-search");
    // The tenant ids + secret the callback re-validates ride in tool config.
    expect(body.tools[0].config).toMatchObject({ orgId: "o1", agentId: "a1", kbId: "k1", secret: "hmac_secret" });
    expect(body.conversation_config.twilio?.phone_numbers).toEqual(["+15550001111"]);
  });

  it("returns the signed URL with a short TTL", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=x&signed_url=y" }));
    const signed = await new ElevenLabsVoiceProvider().getAgentSignedUrl("agent_vendor_003");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/convai/agents/agent_vendor_003/get-signed-url");
    expect(signed.signedUrl).toContain("wss://api.elevenlabs.io");
    expect(signed.expiresAt).toBeGreaterThan(Date.now());
    expect(signed.expiresAt).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("errors loudly when the vendor returns no signed URL", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await expect(new ElevenLabsVoiceProvider().getAgentSignedUrl("agent_vendor_004")).rejects.toMatchObject({
      name: "ElevenLabsError",
      status: 502,
    });
  });

  it("normalises conversation history timestamps from both vendor formats", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        conversations: [
          { conversation_id: "c1", agent_id: "agent_vendor_001", status: "done", started_at: 1718000000, ended_at: 1718000120 },
          { conversation_id: "c2", agent_id: "agent_vendor_001", status: "processing", started_at: "2025-06-10T12:00:00Z", ended_at: "2025-06-10T12:02:00Z" },
        ],
      }),
    );
    const history = await new ElevenLabsVoiceProvider().listConversations({ agentId: "agent_vendor_001" });
    expect(history).toHaveLength(2);
    expect(history[0].startedAtUnix).toBe(1718000000);
    expect(history[1].startedAtUnix).toBeGreaterThan(0);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("agent_id=agent_vendor_001");
  });

  it("refuses cloning with zero reference files before any vendor call", async () => {
    await expect(
      new ElevenLabsVoiceProvider().cloneVoice({ name: "Brand", files: [] }),
    ).rejects.toMatchObject({ name: "ElevenLabsError", status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses clone results including the verification flag", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ voice_id: "newClonedVoice12345", requires_verification: true }));
    const result = await new ElevenLabsVoiceProvider().cloneVoice({
      name: "Brand voice",
      files: [{ blob: new Blob(["audio"]), filename: "ref.webm" }],
    });
    expect(result).toEqual({ voiceId: "newClonedVoice12345", requiresVerification: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/voices/add");
    expect(init.method).toBe("POST");
    // Reference audio travels as multipart form data, never JSON.
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("parses Voice Design results (voice id + sample media ids)", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ voice_id: "designedVoice67890", media_ids: ["m1", "m2"] }),
    );
    const result = await new ElevenLabsVoiceProvider().designVoice({
      name: "Calm narrator",
      textPrompt: "A calm middle-aged British male, warm and patient.",
    });
    expect(result).toEqual({ voiceId: "designedVoice67890", sampleMediaIds: ["m1", "m2"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/text-to-voice/design");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.text_description).toContain("calm");
  });
});
