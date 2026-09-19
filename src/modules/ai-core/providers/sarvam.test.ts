import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SarvamEmbeddingUnsupportedError,
  SarvamError,
  SarvamProvider,
  isSarvamBetaChatModel,
} from "./sarvam";

/** Build an SSE Response from chunk objects (OpenAI-compatible wire). */
function sseResponse(chunks: Array<Record<string, unknown>>): Response {
  const body = chunks
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("SarvamProvider", () => {
  beforeEach(() => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_BASE_URL = "https://api.sarvam.ai";
    process.env.SARVAM_CHAT_TIMEOUT_MS = "100"; // fast abort in tests
    delete process.env.SARVAM_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_BASE_URL;
    delete process.env.SARVAM_CHAT_TIMEOUT_MS;
  });

  it("throws without an API key", () => {
    delete process.env.SARVAM_API_KEY;
    expect(() => new SarvamProvider()).toThrow("SARVAM_API_KEY");
  });

  it("streams token deltas and reports usage from the final chunk (empty choices)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        { choices: [{ delta: { content: "नमस्ते" } }] },
        { choices: [{ delta: { content: " दुनिया" } }] },
        // The usage chunk arrives with an EMPTY choices array — the classic
        // indexing bug this adapter guards against (vendor docs).
        { choices: [], usage: { prompt_tokens: 12, completion_tokens: 34 } },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamProvider({ provider: "sarvam", chatModel: "sarvam-105b" });
    const deltas: string[] = [];
    let usage: { promptTokens: number; completionTokens: number } | null = null;

    for await (const delta of provider.chatStream(
      [{ role: "user", content: "hi" }],
      { onUsage: (u) => { usage = u; } },
    )) {
      deltas.push(delta);
    }

    expect(deltas).toEqual(["नमस्ते", " दुनिया"]);
    expect(usage).toEqual({ promptTokens: 12, completionTokens: 34 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>)["api-subscription-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string).stream).toBe(true);
  });

  it("routes beta open-source models to the /v2 endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamProvider({ provider: "sarvam", chatModel: "gemma4" });
    const iterator = provider.chatStream([{ role: "user", content: "hi" }]);
    await iterator.next();
    await iterator.return?.();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/v2/chat/completions");
  });

  it("beta model classification", () => {
    expect(isSarvamBetaChatModel("gemma4")).toBe(true);
    expect(isSarvamBetaChatModel("deepseekv4-flash")).toBe(true);
    expect(isSarvamBetaChatModel("glm5.3")).toBe(true);
    expect(isSarvamBetaChatModel("sarvam-105b")).toBe(false);
  });

  it("embedText/embedBatch throw the typed EMBEDDING_UNSUPPORTED error", async () => {
    const provider = new SarvamProvider();
    await expect(provider.embedText("hi")).rejects.toBeInstanceOf(SarvamEmbeddingUnsupportedError);
    await expect(provider.embedBatch(["hi"])).rejects.toBeInstanceOf(SarvamEmbeddingUnsupportedError);
    expect(() => provider.getModelName("embedding")).toThrow(SarvamEmbeddingUnsupportedError);
    expect(() => provider.getEmbeddingDimension()).toThrow(SarvamEmbeddingUnsupportedError);
  });

  it("sanitizes vendor errors — the body never reaches the client message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"detail":"secret-echo"}', { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamProvider();
    const iterator = provider.chatStream([{ role: "user", content: "hi" }]);
    await expect(iterator.next()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(SarvamError);
      expect((err as SarvamError).message).not.toContain("secret-echo");
      expect((err as SarvamError).message).toContain("subscription key");
      return true;
    });
  });

  it("retries once on 429 honouring Retry-After, then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "0" },
      }))
      .mockResolvedValueOnce(sseResponse([
        { choices: [{ delta: { content: "ok" } }] },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamProvider();
    const deltas: string[] = [];
    for await (const delta of provider.chatStream([{ role: "user", content: "hi" }])) {
      deltas.push(delta);
    }
    expect(deltas).toEqual(["ok"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces AbortError as a 504 timeout", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SarvamProvider();
    const iterator = provider.chatStream([{ role: "user", content: "hi" }]);
    await expect(iterator.next()).rejects.toSatisfy((err: unknown) => {
      expect((err as SarvamError).status).toBe(504);
      return true;
    });
  });

  it("identity", () => {
    const provider = new SarvamProvider({ provider: "sarvam", chatModel: "sarvam-105b-conversations" });
    expect(provider.getProviderName()).toBe("sarvam");
    expect(provider.getModelName("chat")).toBe("sarvam-105b-conversations");
  });
});
