/**
 * src/modules/ai-core/providers/openai.net-trace.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider-layer wiring proof for [net-trace] upstream rows on the OpenAI
 * path (see @/lib/net-trace and the Gemini twin in
 * gemini.relay.integration.test.ts, which proves the same contract against
 * the REAL @google/genai stack through a local relay).
 *
 * Contract under test — the row the docker/vercel log shows for every
 * server-side vendor call the browser Network tab can never see:
 *   • URL is the endpoint the SDK is actually hitting (client.baseURL + path)
 *   • HTTP status extracted from APIError (.status) — "→ 429" / "→ 401"
 *   • Failures ALWAYS captured (independent of NET_TRACE); successes only at
 *     NET_TRACE=verbose, with a compact request preview + response summary
 *   • The error itself still propagates unchanged to the retry ladder
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fakeChatCreate, fakeEmbedCreate } = vi.hoisted(() => ({
  fakeChatCreate: vi.fn(),
  fakeEmbedCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    baseURL = "https://api.openai.com/v1";
    chat = { completions: { create: fakeChatCreate } };
    embeddings = { create: fakeEmbedCreate };
  },
}));

import { OpenAIProvider } from "./openai";

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.NET_TRACE = "off";
  fakeChatCreate.mockReset();
  fakeEmbedCreate.mockReset();
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  delete process.env.NET_TRACE;
});

function provider(): OpenAIProvider {
  return new OpenAIProvider({ provider: "openai", apiKey: "test-key" });
}

function outputOf(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

describe("OpenAI provider net-trace upstream rows", () => {
  it("verbose: embedding success row names the endpoint, status, and res summary", async () => {
    process.env.NET_TRACE = "verbose";
    fakeEmbedCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 5 },
    });

    const vector = await provider().embedText("hello chunk");
    expect(vector).toEqual([0.1, 0.2, 0.3]);

    const output = outputOf(logSpy);
    expect(output).toContain("[net-trace] upstream openai");
    // The URL the SDK is actually hitting (baseURL is public on the client).
    expect(output).toContain("https://api.openai.com/v1/embeddings");
    expect(output).toContain("→ 200");
    expect(output).toContain('"data":1');
    expect(output).toContain('"dimension":3');
    expect(output).toContain("req  ▸");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("batch embedding failures are ALWAYS captured with the APIError status (429 at NET_TRACE=off)", async () => {
    process.env.NET_TRACE = "off";
    const quota = Object.assign(new Error("429 Rate limit reached for requests"), { status: 429 });
    fakeEmbedCreate.mockRejectedValueOnce(quota);

    // The error still propagates unchanged — the retry ladder owns retries.
    await expect(provider().embedBatch(["alpha chunk", "beta chunk"]))
      .rejects.toThrow("429 Rate limit reached");

    const output = outputOf(errorSpy);
    expect(output).toContain("[net-trace] upstream openai");
    expect(output).toContain("→ 429");
    expect(output).toContain("cause ▸");
    expect(output).toContain("429 Rate limit reached");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("chat stream failures are ALWAYS captured with the APIError status (401 at NET_TRACE=off)", async () => {
    process.env.NET_TRACE = "off";
    const invalidKey = Object.assign(
      new Error("401 Incorrect API key provided: sk-***"),
      { status: 401 },
    );
    fakeChatCreate.mockRejectedValueOnce(invalidKey);

    const stream = provider().chatStream([{ role: "user", content: "how do I reset my password?" }]);
    await expect(stream.next()).rejects.toThrow("401 Incorrect API key");

    const output = outputOf(errorSpy);
    expect(output).toContain("[net-trace] upstream openai");
    expect(output).toContain("https://api.openai.com/v1/chat/completions");
    expect(output).toContain("→ 401");
    // The request preview is NOT printed at level off — only cause + status.
    expect(output).not.toContain("req  ▸");
  });

  it("chat stream failure at verbose also prints the (scrubbed) request preview", async () => {
    process.env.NET_TRACE = "verbose";
    fakeChatCreate.mockRejectedValueOnce(
      Object.assign(new Error("401 Incorrect API key provided"), { status: 401 }),
    );

    const stream = provider().chatStream([{ role: "user", content: "hello there" }]);
    await expect(stream.next()).rejects.toThrow("401 Incorrect API key");

    const output = outputOf(errorSpy);
    expect(output).toContain("req  ▸");
    expect(output).toContain("hello there");
  });
});
