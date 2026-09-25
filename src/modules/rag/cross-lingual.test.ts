import { beforeEach, describe, expect, it, vi } from "vitest";

const chatStream = vi.fn();
vi.mock("@/modules/ai-core/factory", () => ({
  ProviderFactory: { getProvider: vi.fn(() => ({ chatStream })) },
}));
const translateQueryForRag = vi.fn();
vi.mock("@/modules/language-core/pipeline", () => ({
  translateQueryForRag: (...args: unknown[]) => translateQueryForRag(...args),
}));

import {
  clearRetrievalTranslationCache,
  inferKnowledgeLanguage,
  needsRetrievalTranslation,
  scriptLanguages,
  translateQueryForRetrieval,
} from "./cross-lingual";

const TAMIL = "எனக்கு ஹோம் இன்சூரன்ஸ் பற்றி கொஞ்சம் டீட்டெயில்ல தெரியணும்.";

function stream(text: string) {
  return (async function* () { yield text; })();
}

describe("script detection", () => {
  it("maps scripts to candidate languages", () => {
    expect(scriptLanguages(TAMIL)).toEqual(["ta"]);
    expect(scriptLanguages("मुझे बीमा चाहिए")?.[0]).toBe("hi");
    expect(scriptLanguages("ما هو التأمين")?.[0]).toBe("ar");
    expect(scriptLanguages("home insurance details")).toBeNull();
  });

  it("infers the KB language from document titles", () => {
    expect(inferKnowledgeLanguage(["FAQs (All)"], "ta")).toBe("en");
    expect(inferKnowledgeLanguage(["Preguntas frecuentes"], "es")).toBe("es");
    expect(inferKnowledgeLanguage(["காப்பீடு கேள்விகள்"], "en")).toBe("ta");
    expect(inferKnowledgeLanguage([], "hi")).toBe("hi");
  });

  it("asks for a translation only when the query and KB languages differ", () => {
    expect(needsRetrievalTranslation({ query: TAMIL, kbLanguage: "en" })).toBe(true);
    expect(needsRetrievalTranslation({ query: TAMIL, kbLanguage: "ta" })).toBe(false);
    expect(needsRetrievalTranslation({ query: "home insurance details", kbLanguage: "en" })).toBe(false);
    expect(needsRetrievalTranslation({ query: "enakku home insurance venum", kbLanguage: "en", detectedLanguage: "ta" })).toBe(true);
    expect(needsRetrievalTranslation({ query: "home insurance", kbLanguage: "ta" })).toBe(true);
  });
});

describe("translateQueryForRetrieval", () => {
  beforeEach(() => {
    clearRetrievalTranslationCache();
    chatStream.mockReset();
    translateQueryForRag.mockReset();
    delete process.env.RAG_QUERY_TRANSLATION;
  });

  it("translates with the embedding provider and caches the result", async () => {
    chatStream.mockImplementation(() => stream("I want some details about home insurance."));
    const first = await translateQueryForRetrieval({ query: TAMIL, kbLanguage: "en", providerConfig: { provider: "openai" } });
    expect(first).toMatchObject({ query: "I want some details about home insurance.", method: "llm" });

    const second = await translateQueryForRetrieval({ query: TAMIL, kbLanguage: "en", providerConfig: { provider: "openai" } });
    expect(second.method).toBe("cache");
    expect(chatStream).toHaveBeenCalledTimes(1);
  });

  it("uses the organisation's Sarvam translation when enabled", async () => {
    translateQueryForRag.mockResolvedValue({ translated: true, effectiveQuery: "home insurance details" });
    const result = await translateQueryForRetrieval({ query: TAMIL, kbLanguage: "en", translationMode: "query" });
    expect(result).toMatchObject({ query: "home insurance details", method: "sarvam" });
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("never throws — failures fall back to the untranslated search", async () => {
    chatStream.mockImplementation(() => { throw new Error("provider down"); });
    const result = await translateQueryForRetrieval({ query: TAMIL, kbLanguage: "en", providerConfig: { provider: "openai" } });
    expect(result).toMatchObject({ query: null, method: "none" });
  });

  it("can be switched off with RAG_QUERY_TRANSLATION=off", async () => {
    process.env.RAG_QUERY_TRANSLATION = "off";
    const result = await translateQueryForRetrieval({ query: TAMIL, kbLanguage: "en" });
    expect(result.query).toBeNull();
    expect(chatStream).not.toHaveBeenCalled();
  });
});
