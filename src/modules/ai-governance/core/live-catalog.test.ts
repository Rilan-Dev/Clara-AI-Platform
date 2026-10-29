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



async function syncCatalogFreshModule(): Promise<void> {
  vi.resetModules();
  const { syncLiveProviderCatalog } = await import("./live-catalog");
  await syncLiveProviderCatalog();
}

describe("Live provider catalogue reconciliation", () => {
  beforeEach(() => {
    // clearAllMocks (NOT resetAllMocks): on Vitest 2.x resetAllMocks strips
    // the vi.fn(impl) implementations from the vi.mock factories above, so
    // loadRuntimeSettingsOnStartup() returned undefined from the second test
    // onward and every sync died on "undefined.catch" before touching a
    // vendor. clearAllMocks keeps implementations and only clears call logs.
    vi.clearAllMocks();
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

    await syncCatalogFreshModule();

    const geminiUpserts = mocks.execute.mock.calls.filter(([sql, params]) =>
      String(sql).includes("INSERT INTO platform_ai_provider_models") &&
      String(sql).includes("ON CONFLICT") &&
      params?.[0] === "gemini");
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

  it("preserves Gemini rows when a successful HTTP response has a malformed page shape", async () => {
    mocks.fetch.mockImplementation(async (url: string) => String(url).includes("generativelanguage.googleapis.com")
      ? new Response(JSON.stringify({}), { status: 200 })
      : new Response("[]", { status: 200 }));
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "gemini")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "gemini")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:gemini", healthy: false }));
  });

  it("preserves OpenAI rows when a successful HTTP response has a malformed page shape", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ object: "list" }), { status: 200 }));
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "openai")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "openai")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:openai", healthy: false }));
  });

  it("preserves last-known Gemini rows when discovery fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("vendor unavailable"));

    await syncCatalogFreshModule();

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

    await syncCatalogFreshModule();

    expect(mocks.execute.mock.calls.some(([sql, params]) =>
      String(sql).includes("SET enabled = FALSE") &&
      params?.[0] === "gemini" && params?.[3] instanceof Array && params[3].length === 0,
    )).toBe(true);
  });

  it("preserves discovered Sarvam chat rows when both discovery endpoints fail", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    process.env.SARVAM_API_KEY = "test-sarvam-key";
    mocks.fetch.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "sarvam" && params?.[1] === "chat" && params?.[2] === "chat")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:sarvam", healthy: false }));
  });

  it("treats a successful empty Sarvam discovery as authoritative", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    process.env.SARVAM_API_KEY = "test-sarvam-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/v2/models")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response("[]", { status: 200 });
    });
    await syncCatalogFreshModule();
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes("/v1/models"))).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "sarvam" && params?.[1] === "chat" && params?.[2] === "chat")).toBe(true);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:sarvam", healthy: true }));
  });

  it("preserves OpenAI rows when model pagination repeats its cursor", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("api.openai.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "gpt-test" }], has_more: true, last_id: "cursor-fixed" }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "openai")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "openai")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:openai", healthy: false }));
  });

  it("preserves OpenAI rows when model pagination exceeds the page limit", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("api.openai.com/v1/models")) {
        const after = new URL(String(url)).searchParams.get("after") ?? "";
        return new Response(JSON.stringify({ data: [{ id: "gpt-" + (after || "first") }], has_more: true, last_id: "cursor-" + (after || "first") }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "openai")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "openai")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:openai", healthy: false }));
  });

  it("preserves ElevenLabs rows when a page claims more results without a cursor", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1/models")) return new Response("[]", { status: 200 });
      if (String(url).includes("/v2/voices")) return new Response(JSON.stringify({ voices: [{ voice_id: "voice-first" }], has_more: true }), { status: 200 });
      return new Response("[]", { status: 200 });
    });
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "elevenlabs")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "elevenlabs")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:elevenlabs", healthy: false }));
  });

  it("preserves ElevenLabs rows when voice pagination repeats a token", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1/models")) return new Response("[]", { status: 200 });
      if (String(url).includes("/v2/voices")) {
        const token = new URL(String(url)).searchParams.get("next_page_token") ?? "";
        return new Response(JSON.stringify({ voices: [{ voice_id: token || "voice-first" }], has_more: true, next_page_token: "repeat-token" }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "elevenlabs")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "elevenlabs")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:elevenlabs", healthy: false }));
  });

  it("preserves ElevenLabs rows when voice pagination reaches its page limit", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1/models")) return new Response("[]", { status: 200 });
      if (String(url).includes("/v2/voices")) {
        const token = new URL(String(url)).searchParams.get("next_page_token") ?? "";
        return new Response(JSON.stringify({ voices: [{ voice_id: token || "voice-first" }], has_more: true, next_page_token: "page-" + (token || "first") }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    await syncCatalogFreshModule();
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("INSERT INTO platform_ai_provider_models") && params?.[0] === "elevenlabs")).toBe(false);
    expect(mocks.execute.mock.calls.some(([sql, params]) => String(sql).includes("SET enabled = FALSE") && params?.[0] === "elevenlabs")).toBe(false);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:elevenlabs", healthy: false }));
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

    await syncCatalogFreshModule();

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

  it("accepts the live OpenAI /v1/models single-page shape without has_more (production regression)", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("api.openai.com/v1/models")) {
        // Exact production shape (verified 2026-10-29 against api.openai.com):
        // { object, data } — NO has_more, NO last_id; the limit param is ignored
        // and every model arrives in a single page.
        return new Response(JSON.stringify({
          object: "list",
          data: [
            { id: "gpt-4o", owned_by: "openai" },
            { id: "text-embedding-3-small", owned_by: "openai" },
            { id: "text-embedding-3-large", owned_by: "openai" },
            { id: "gpt-realtime-2", owned_by: "openai" },
            { id: "whisper-1", owned_by: "openai" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    await syncCatalogFreshModule();

    const upserts = mocks.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO platform_ai_provider_models"));
    expect(upserts.some(([, p]) => p?.[0] === "openai" && p?.[2] === "chat" && p?.[3] === "gpt-4o")).toBe(true);
    expect(upserts.some(([, p]) => p?.[0] === "openai" && p?.[2] === "embedding" && p?.[3] === "text-embedding-3-small")).toBe(true);
    expect(upserts.some(([, p]) => p?.[0] === "openai" && p?.[2] === "embedding" && p?.[3] === "text-embedding-3-large")).toBe(true);
    expect(upserts.some(([, p]) => p?.[0] === "openai" && p?.[2] === "realtime" && p?.[3] === "gpt-realtime-2")).toBe(true);
    expect(upserts.some(([, p]) => p?.[0] === "openai" && p?.[2] === "transcription" && p?.[3] === "whisper-1")).toBe(true);
    // Discovered rows are stamped vendor_live so the admin pickers list them.
    const embeddingMeta = upserts.find(([, p]) => p?.[3] === "text-embedding-3-small")?.[1]?.[5];
    expect(JSON.parse(String(embeddingMeta))).toMatchObject({ catalogSource: "vendor_live" });
    // Classic endpoint: exactly ONE page fetched — no cursor pagination loop.
    expect(mocks.fetch.mock.calls.filter(([url]) =>
      String(url).includes("api.openai.com/v1/models")).length).toBe(1);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:openai", healthy: true }));
  });

  it("accepts a null next_page_token on the final ElevenLabs voices page (production regression)", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1/models")) {
        // /v1/models is a bare JSON array in production.
        return new Response(JSON.stringify([
          { model_id: "eleven_flash_v2_5", name: "Eleven Flash v2.5", can_do_text_to_speech: true },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url).includes("/v2/voices")) {
        // Exact production final-page shape (verified 2026-10-29 against
        // api.elevenlabs.io): has_more false + next_page_token null.
        return new Response(JSON.stringify({
          voices: [{ voice_id: "voice-1", name: "Voice One", category: "generated" }],
          has_more: false,
          next_page_token: null,
          total_count: 1,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    await syncCatalogFreshModule();

    const upserts = mocks.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO platform_ai_provider_models"));
    expect(upserts.some(([, p]) => p?.[0] === "elevenlabs" && p?.[2] === "voice" && p?.[3] === "voice-1")).toBe(true);
    expect(upserts.some(([, p]) => p?.[0] === "elevenlabs" && p?.[2] === "tts" && p?.[3] === "eleven_flash_v2_5")).toBe(true);
    // Final page: exactly ONE voices request — the null cursor must not loop.
    expect(mocks.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/v2/voices")).length).toBe(1);
    expect(mocks.incidents).toContainEqual(expect.objectContaining({ key: "ai-catalog:elevenlabs", healthy: true }));
  });
});
