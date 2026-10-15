import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params?: unknown[]) => undefined),
  incidents: [] as Array<Record<string, unknown>>,
  fetch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ execute: mocks.execute }));
vi.mock("@/lib/db/migrate", () => ({ loadRuntimeSettingsOnStartup: vi.fn(async () => undefined) }));
vi.mock("@/modules/ai-core/model-catalog", () => ({
  findChatModel: (id: string) => id === "gemini-2.5-flash"
    ? { inputUsdPerMTokens: 0.3, outputUsdPerMTokens: 2.5, contextTokens: 1_048_576 }
    : undefined,
  findEmbeddingModel: (id: string) => id === "gemini-embedding-001"
    ? { inputUsdPerMTokens: 0.075, dimension: 3072 }
    : undefined,
}));
vi.mock("@/modules/voice-core/model-catalog", () => ({
  findTTSModel: () => undefined,
  normalizeProviderBaseUrl: (value: string | undefined, fallback: string) => value || fallback,
}));
vi.mock("@/modules/platform-health/core/incidents", () => ({
  recordRuntimeIncident: vi.fn(async (incident: Record<string, unknown>) => { mocks.incidents.push(incident); }),
}));

import { syncLiveProviderCatalog } from "./live-catalog";

describe("Gemini live catalogue reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.execute.mockResolvedValue(undefined);
    mocks.incidents.length = 0;
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.OPENAI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("enriches discovered Gemini rows with static pricing and vector dimensions without treating metadata as availability", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
        ] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    await syncLiveProviderCatalog();

    const geminiUpserts = mocks.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO platform_ai_provider_models") &&
      String(sql).includes("ON CONFLICT"));
    const chat = geminiUpserts.find(([, params]) => params?.[0] === "gemini" && params?.[3] === "gemini-2.5-flash");
    const embedding = geminiUpserts.find(([, params]) => params?.[0] === "gemini" && params?.[3] === "gemini-embedding-001");
    expect(JSON.parse(String(chat?.[1]?.[5]))).toMatchObject({
      catalogSource: "vendor_live", inputUsdPerMTokens: 0.3, outputUsdPerMTokens: 2.5,
    });
    expect(JSON.parse(String(embedding?.[1]?.[5]))).toMatchObject({
      catalogSource: "vendor_live", inputUsdPerMTokens: 0.075, dimension: 3072,
    });
    expect(geminiUpserts.length).toBe(2);
  });

  it("preserves last-known Gemini rows when discovery fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("vendor unavailable"));

    await syncLiveProviderCatalog();

    expect(mocks.execute.mock.calls.some(([sql, params]) =>
      String(sql).includes("SET enabled = FALSE") && params?.[0] === "gemini",
    )).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({
      key: "ai-catalog:gemini", healthy: false,
    }));
  });

  it("reconciles stale Gemini rows after a successful empty discovery", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    await syncLiveProviderCatalog();

    expect(mocks.execute.mock.calls.some(([sql, params]) =>
      String(sql).includes("SET enabled = FALSE") &&
      params?.[0] === "gemini" && params?.[3] instanceof Array && params[3].length === 0,
    )).toBe(true);
  });

  it("does not upsert or disable stale rows when Gemini pagination exceeds its safety limit", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        const token = new URL(String(url)).searchParams.get("pageToken") ?? "";
        return new Response(JSON.stringify({
          models: [{ name: `models/gemini-page-${token || "first"}`, supportedGenerationMethods: ["generateContent"] }],
          nextPageToken: token ? `next-${token}` : "next",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    await syncLiveProviderCatalog();

    expect(mocks.execute.mock.calls.some(([sql, params]) =>
      String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "gemini",
    )).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) =>
      String(sql).includes("SET enabled = FALSE") && params?.[0] === "gemini",
    )).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({
      key: "ai-catalog:gemini", healthy: false,
    }));
  });
});
