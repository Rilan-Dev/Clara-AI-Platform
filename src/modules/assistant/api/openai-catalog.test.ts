import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  OPENAI_REALTIME_VOICES,
  fetchOpenAIModelCatalog,
  isOpenAIRealtimeModel,
  isSupportedOpenAIRealtimeVoice,
} from "./openai-catalog";

describe("OpenAI realtime capability catalog", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("contains unique realtime voice IDs", () => {
    const ids = OPENAI_REALTIME_VOICES.map((voice) => voice.id);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z][a-z0-9-]*$/.test(id))).toBe(true);
  });

  it("accepts supported realtime voices and rejects legacy TTS-only values", () => {
    expect(isSupportedOpenAIRealtimeVoice("marin")).toBe(true);
    expect(isSupportedOpenAIRealtimeVoice("cedar")).toBe(true);
    expect(isSupportedOpenAIRealtimeVoice("nova")).toBe(false);
    expect(isSupportedOpenAIRealtimeVoice("fable")).toBe(false);
    expect(isSupportedOpenAIRealtimeVoice("not-a-voice")).toBe(false);
  });

  it("identifies realtime models without hard-coding a model allow-list", () => {
    expect(isOpenAIRealtimeModel("gpt-realtime-2.1-mini")).toBe(true);
    expect(isOpenAIRealtimeModel("gpt-realtime-2.1")).toBe(true);
    expect(isOpenAIRealtimeModel("gpt-5.6-luna")).toBe(false);
  });

  it("fetches the live model catalog from OpenAI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: "gpt-realtime-2.1-mini", object: "model", owned_by: "openai" },
        { id: "gpt-5.6-luna", object: "model", owned_by: "openai" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const catalog = await fetchOpenAIModelCatalog("test-key");
    expect(catalog.models).toHaveLength(2);
    expect(catalog.realtimeModels.map((model) => model.id)).toEqual(["gpt-realtime-2.1-mini"]);
    expect(catalog.voices.length).toBe(OPENAI_REALTIME_VOICES.length);
    expect(catalog.voiceCatalogSource).toBe("openai-realtime-api-contract");
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({
      headers: { Authorization: "Bearer test-key" },
      cache: "no-store",
    }));
  });

  it("fails clearly when OpenAI model discovery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 })));
    await expect(fetchOpenAIModelCatalog("bad-key")).rejects.toThrow("OpenAI model discovery failed (401)");
  });
});
