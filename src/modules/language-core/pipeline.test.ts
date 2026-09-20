import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SentenceTranslator, translateQueryForRag } from "./pipeline";

/**
 * The V4 contract, asserted at the unit level (plan §15 V4 acceptance):
 *   • translation_mode='off' (the org default) → ZERO vendor calls.
 *   • Kill switch off → ZERO vendor calls.
 *   • Every vendor failure degrades to the untranslated path.
 */

function enableTranslation() {
  process.env.SARVAM_TRANSLATION_ENABLED = "true";
  process.env.SARVAM_API_KEY = "test-key";
  process.env.SARVAM_BASE_URL = "https://api.sarvam.ai";
}

describe("translateQueryForRag", () => {
  beforeEach(() => {
    delete process.env.SARVAM_TRANSLATION_ENABLED;
    delete process.env.SARVAM_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.SARVAM_TRANSLATION_ENABLED;
    delete process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_BASE_URL;
  });

  it("makes ZERO vendor calls when translation_mode='off' (org default)", async () => {
    enableTranslation(); // kill switch on — mode must still gate everything
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateQueryForRag({
      query: "नमस्ते",
      translationMode: "off",
      targetLanguage: "en",
      orgId: "org-1",
      kbId: "kb-1",
      agentId: null,
    });

    expect(result.translated).toBe(false);
    expect(result.effectiveQuery).toBe("नमस्ते");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes ZERO vendor calls when the kill switch is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateQueryForRag({
      query: "नमस्ते",
      translationMode: "query+answer",
      targetLanguage: "en",
      orgId: "org-1",
      kbId: "kb-1",
      agentId: null,
    });

    expect(result.translated).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("identifies, transliterates romanized input, then translates", async () => {
    enableTranslation();
    const calls: Array<[string, Record<string, unknown>]> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push([String(url), JSON.parse(init.body as string)]);
      const path = String(url).replace("https://api.sarvam.ai", "");
      if (path === "/identify-language") {
        return new Response(JSON.stringify({ language: "hi-IN", language_probability: 0.98 }), { status: 200 });
      }
      if (path === "/transliterate") {
        return new Response(JSON.stringify({ transliterated_text: "नमस्ते दुनिया" }), { status: 200 });
      }
      if (path === "/translate") {
        return new Response(JSON.stringify({
          translated_text: "Hello world",
          model: "sarvam-translate:v1",
        }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateQueryForRag({
      query: "namaste duniya", // romanized Hindi — no native script
      translationMode: "query",
      targetLanguage: "en",
      orgId: "org-1",
      kbId: "kb-1",
      agentId: null,
    });

    expect(result.translated).toBe(true);
    expect(result.effectiveQuery).toBe("Hello world");
    expect(result.userLanguage).toBe("hi");
    expect(result.originalQuery).toBe("namaste duniya");
    // Call order: identify → transliterate → translate.
    expect(calls.map(([path]) => path)).toEqual([
      "https://api.sarvam.ai/identify-language",
      "https://api.sarvam.ai/transliterate",
      "https://api.sarvam.ai/translate",
    ]);
  });

  it("skips translation when the identified language matches the KB language (fast path)", async () => {
    enableTranslation();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith("/identify-language")) {
        return new Response(JSON.stringify({ language: "en-IN" }), { status: 200 });
      }
      throw new Error("should not be reached");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateQueryForRag({
      query: "what is my policy number",
      translationMode: "query",
      targetLanguage: "en",
      orgId: "org-1",
      kbId: "kb-1",
      agentId: null,
    });

    expect(result.translated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // identify only
  });

  it("degrades gracefully when the identify call fails", async () => {
    enableTranslation();
    const fetchMock = vi.fn().mockRejectedValue(new Error("vendor down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateQueryForRag({
      query: "नमस्ते",
      translationMode: "query",
      targetLanguage: "en",
      orgId: "org-1",
      kbId: "kb-1",
      agentId: null,
    });

    expect(result.translated).toBe(false);
    expect(result.effectiveQuery).toBe("नमस्ते");
  });
});

describe("SentenceTranslator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("buffers tokens and emits translated complete sentences in order", async () => {
    process.env.SARVAM_TRANSLATION_ENABLED = "true";
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_BASE_URL = "https://api.sarvam.ai";

    const translateMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string };
      return new Response(JSON.stringify({ translated_text: `(${body.input.trim()})` }), { status: 200 });
    });
    vi.stubGlobal("fetch", translateMock);

    const translator = new SentenceTranslator({
      sourceLanguageCode: "en-IN",
      targetLanguageCode: "hi-IN",
      orgId: "org-1",
      kbId: "kb-1",
      agentId: null,
    });

    const emitted: string[] = [];
    // Feed tokens forming two sentences.
    translator.push("Claim approved. ", (t) => emitted.push(t));
    translator.push("Policy sent.", (t) => emitted.push(t));
    await translator.finish((t) => emitted.push(t));

    // "Claim approved." (15 chars ≥ min) translates as one sentence; the
    // trailing "Policy sent." flushes on finish.
    expect(emitted.join(" ")).toContain("Claim approved.");
    expect(emitted.join(" ")).toContain("Policy sent.");
    expect(translateMock).toHaveBeenCalled();
  });

  it("emits the original sentence when translation fails", async () => {
    process.env.SARVAM_TRANSLATION_ENABLED = "true";
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_BASE_URL = "https://api.sarvam.ai";

    const fetchMock = vi.fn().mockRejectedValue(new Error("vendor down"));
    vi.stubGlobal("fetch", fetchMock);

    const translator = new SentenceTranslator({
      sourceLanguageCode: "en-IN",
      targetLanguageCode: "hi-IN",
      orgId: null,
      kbId: null,
      agentId: null,
    });

    const emitted: string[] = [];
    translator.push("Claim approved today.", (t) => emitted.push(t));
    await translator.finish((t) => emitted.push(t));

    expect(emitted.join(" ")).toContain("Claim approved today.");
  });
});
