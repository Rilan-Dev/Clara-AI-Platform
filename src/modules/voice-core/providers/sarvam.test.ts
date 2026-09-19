import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SarvamVoiceProvider,
  SarvamVoiceError,
  extractWavDataChunk,
} from "./sarvam";

// ─── RIFF fixture builders ─────────────────────────────────────────────────────

/** Canonical 44-byte WAV: RIFF + fmt (16) + data. */
function canonicalWav(pcm: Uint8Array): Uint8Array {
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);       // fmt chunk size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, 16_000, true);   // sample rate
  view.setUint32(28, 32_000, true);   // byte rate
  view.setUint16(32, 2, true);        // block align
  view.setUint16(34, 16, true);       // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buffer).set(pcm, 44);
  return new Uint8Array(buffer);
}

/** Non-canonical WAV with an extra LIST chunk before data (chunk-walk test). */
function wavWithExtraChunk(pcm: Uint8Array): Uint8Array {
  const listPayload = new Uint8Array(5); // odd size → tests the even-padding walk
  const parts: Uint8Array[] = [];
  const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

  const header = new Uint8Array(12);
  header.set(ascii("RIFF"), 0);
  new DataView(header.buffer).setUint32(4, 36 + 8 + listPayload.length + 1 + pcm.length, true);
  header.set(ascii("WAVE"), 8);

  const fmt = new Uint8Array(24);
  fmt.set(ascii("fmt "), 0);
  new DataView(fmt.buffer).setUint32(4, 16, true);
  new DataView(fmt.buffer).setUint16(8, 1, true);
  new DataView(fmt.buffer).setUint16(10, 1, true);
  new DataView(fmt.buffer).setUint32(12, 16_000, true);
  new DataView(fmt.buffer).setUint32(16, 32_000, true);
  new DataView(fmt.buffer).setUint16(20, 2, true);
  new DataView(fmt.buffer).setUint16(22, 16, true);

  const listHeader = new Uint8Array(8);
  listHeader.set(ascii("LIST"), 0);
  new DataView(listHeader.buffer).setUint32(4, listPayload.length, true);

  const dataHeader = new Uint8Array(8);
  dataHeader.set(ascii("data"), 0);
  new DataView(dataHeader.buffer).setUint32(4, pcm.length, true);

  parts.push(header, fmt, listHeader, listPayload, new Uint8Array(1) /* pad */, dataHeader, pcm);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.length; }
  return merged;
}

describe("extractWavDataChunk (chunk-length-aware RIFF parser)", () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it("strips the canonical 44-byte header", () => {
    expect(Array.from(extractWavDataChunk(canonicalWav(pcm))!)).toEqual(Array.from(pcm));
  });

  it("walks extra chunks (odd-size LIST with padding) — never assumes 44 bytes", () => {
    expect(Array.from(extractWavDataChunk(wavWithExtraChunk(pcm))!)).toEqual(Array.from(pcm));
  });

  it("returns null for non-RIFF payloads (fallback passthrough)", () => {
    expect(extractWavDataChunk(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(extractWavDataChunk(new Uint8Array(8))).toBeNull();
  });

  it("returns null for truncated RIFF frames", () => {
    const wav = canonicalWav(pcm).slice(0, 40);
    expect(extractWavDataChunk(wav)).toBeNull();
  });
});

describe("SarvamVoiceProvider", () => {
  beforeEach(() => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_BASE_URL = "https://api.sarvam.ai";
    delete process.env.SARVAM_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_BASE_URL;
  });

  it("requires the key lazily (503), never at construction", () => {
    delete process.env.SARVAM_API_KEY;
    const provider = new SarvamVoiceProvider(); // constructs keyless — status probe
    expect(provider.getProviderName()).toBe("sarvam");
  });

  it("listVoices returns the static catalogue without any vendor call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new SarvamVoiceProvider();
    const voices = await provider.listVoices();
    expect(voices.length).toBe(37);
    expect(voices[0]).toMatchObject({ voiceId: "shubh", name: expect.stringContaining("Shubh") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transcribeAudio maps the Saaras response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        request_id: "r1",
        transcript: "नमस्ते दुनिया",
        language_code: "hi-IN",
        language_probability: 0.99,
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamVoiceProvider();
    const result = await provider.transcribeAudio({
      file: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      modelId: "saaras:v3",
      languageCode: "hi-IN",
    });

    expect(result.text).toBe("नमस्ते दुनिया");
    expect(result.languageCode).toBe("hi-IN");
    expect(result.durationSeconds).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/speech-to-text");
    expect((init.headers as Record<string, string>)["api-subscription-key"]).toBe("test-key");
    // multipart body carries model + mode + language
    const form = init.body as FormData;
    expect(form.get("model")).toBe("saaras:v3");
    expect(form.get("mode")).toBe("transcribe");
    expect(form.get("language_code")).toBe("hi-IN");
  });

  it("speak strips the RIFF container and returns raw PCM with the shared contract", async () => {
    const pcm = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(canonicalWav(pcm).slice().buffer, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamVoiceProvider();
    const response = await provider.speak({
      text: "नमस्ते",
      voiceId: "shubh",
      modelId: "bulbul:v3",
      outputFormat: "pcm_16000",
      languageCode: "hi-IN",
    });

    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("X-Sarvam-Audio-Format")).toBe("pcm_16000");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(pcm));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/text-to-speech");
    const json = JSON.parse(init.body as string);
    expect(json).toMatchObject({
      text: "नमस्ते",
      model: "bulbul:v3",
      speaker: "shubh",
      speech_sample_rate: 16_000,
      language_code: "hi-IN",
    });
  });

  it("speak falls back to verbatim WAV (audio/wav) on a non-canonical container", async () => {
    const raw = new Uint8Array([9, 9, 9, 9]); // not RIFF
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(raw.slice().buffer, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamVoiceProvider();
    const response = await provider.speak({
      text: "hi",
      voiceId: "shubh",
      modelId: "bulbul:v3",
      outputFormat: "pcm_16000",
    });

    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(raw));
  });

  it("getSubscriptionInfo probes with a 1-token completion and normalizes health", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "h" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamVoiceProvider();
    const info = await provider.getSubscriptionInfo();
    expect(info.tier).toBe("api-probe-ok");
    expect(info.voiceLimit).toBe(37);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/v1/chat/completions");
    expect(JSON.parse(init.body as string).max_tokens).toBe(1);
  });

  it("getSubscriptionInfo maps 429 to reachable-but-throttled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("too many", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamVoiceProvider();
    const info = await provider.getSubscriptionInfo();
    expect(info.tier).toBe("rate-limited");
  });

  it("sanitizes vendor errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"detail":"echo"}', { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamVoiceProvider();
    await expect(provider.getSubscriptionInfo()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(SarvamVoiceError);
      expect((err as SarvamVoiceError).message).not.toContain("echo");
      return true;
    });
  });
});
