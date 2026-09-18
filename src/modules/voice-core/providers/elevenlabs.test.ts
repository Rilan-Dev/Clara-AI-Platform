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
});
