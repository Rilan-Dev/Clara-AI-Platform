import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn(async () => {}) }));
vi.mock("@/modules/embed/core/validate-embed", () => ({
  validateEmbedRequest: vi.fn(async () => ({ ok: true, ctx: { kbId: "kb-1", orgId: "org-1", allowedOrigins: ["*"] } })),
  buildCorsHeaders: vi.fn(() => ({})),
  handlePreflight: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async () => ({ id: "kb-1", name: "KB", description: null })),
  getAssistantConfigByKb: vi.fn(async () => ({ maxTokens: 500, temperature: 0.2, outOfScopeReply: "n/a" })),
}));
const order: string[] = [];
const groundClaraContext = vi.fn(async (...args: unknown[]) => {
  void args;
  order.push("grounding");
  return {
    ok: true,
    result: {
      sources: [{ title: "Doc", snippet: "Evidence", score: 0.9, pageNumber: undefined as number | undefined }],
      intent: "knowledge",
      context: "",
      guidance: "Answer from the evidence.",
      responseLanguage: "en",
      timings: { metadataMs: 0, admissionMs: 0, configMs: 0, translationMs: 0, retrievalMs: 5, graphMs: 0, totalMs: 6 },
    },
  };
});
vi.mock("@/modules/rag/grounding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/rag/grounding")>()),
  groundClaraContext: (...args: unknown[]) => groundClaraContext(...args),
}));
const resolveAIConfig = vi.fn();
vi.mock("@/modules/ai-core/resolve", () => ({
  AIConfigResolutionError: class extends Error {},
  resolveAIConfig: (...a: unknown[]) => resolveAIConfig(...a),
  toProviderConfig: vi.fn((r: { provider: string; chatModel: string }) => ({ provider: r.provider, chatModel: r.chatModel, apiKey: "k" })),
}));
vi.mock("@/lib/quota-admission", () => ({
  admitQueryEvent: vi.fn(async () => {
    order.push("admission");
    return { admitted: true, eventId: "evt-1", warning: null };
  }),
  admissionDeniedResponse: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({ finalizeQueryEvent: vi.fn() }));
vi.mock("@/modules/knowledge-bases/core/config-builder", () => ({ buildSystemPrompt: vi.fn(() => "SYSTEM") }));
const chatStream = vi.fn(async function* () { yield "Hello"; });
const getProvider = vi.fn((config: unknown) => { void config; return { chatStream, getModelName: () => "m" }; });
vi.mock("@/modules/ai-core/factory", () => ({ ProviderFactory: { getProvider: (c: unknown) => getProvider(c) } }));

import { POST } from "./route";
import { clearResolveAIConfigCache } from "@/modules/ai-core/resolve-cache";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/embed/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("embed chat — realtime voice turns", () => {
  beforeEach(() => {
    clearResolveAIConfigCache();
    order.length = 0;
    groundClaraContext.mockClear();
    chatStream.mockClear();
    getProvider.mockClear();
  });

  it.each(["openai", "gemini"])("gives a %s brain the voice profile, keeping its own chat model", async (provider) => {
    resolveAIConfig.mockResolvedValue({
      provider, chatModel: `${provider}-chat`, flags: { publicEmbedEnabled: true }, allowedLanguages: ["en"],
    });
    const res = await POST(req({ messages: [{ role: "user", content: "What are the fees?" }], realtimeVoice: true }));
    expect(res.status).toBe(200);
    await res.text();
    expect(groundClaraContext).toHaveBeenCalledWith(expect.objectContaining({ channel: "voice", topK: 4 }));
    expect(getProvider).toHaveBeenCalledWith(expect.objectContaining({ chatModel: `${provider}-chat` }));
    expect(chatStream).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ reasoningEffort: null }));
    expect(res.headers.get("Server-Timing")).toContain("rag-retrieval;dur=5");
  });

  it("disables default Sarvam reasoning for responsive text replies", async () => {
    resolveAIConfig.mockResolvedValue({
      provider: "sarvam", chatModel: "sarvam-105b",
      flags: { publicEmbedEnabled: true }, allowedLanguages: ["en"],
    });
    const res = await POST(req({ messages: [{ role: "user", content: "List policies" }] }));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('"type":"token"');
    expect(chatStream).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      reasoningEffort: null,
    }));
  });

  it("emits an error event instead of treating an empty model response as success", async () => {
    resolveAIConfig.mockResolvedValue({
      provider: "sarvam", chatModel: "sarvam-105b",
      flags: { publicEmbedEnabled: true }, allowedLanguages: ["en"],
    });
    chatStream.mockImplementationOnce(async function* () {});
    const res = await POST(req({ messages: [{ role: "user", content: "List policies" }] }));
    const body = await res.text();
    expect(body).toContain('"type":"error"');
    expect(body).toContain('"type":"done"');
    expect(body).not.toContain('"type":"token"');
  });

  it("streams verified physical PDF page numbers on public citations", async () => {
    resolveAIConfig.mockResolvedValue({
      provider: "openai", chatModel: "gpt",
      flags: { publicEmbedEnabled: true }, allowedLanguages: ["en"],
    });
    groundClaraContext.mockResolvedValueOnce({
      ok: true,
      result: {
        sources: [
          { title: "NDMO Policy", snippet: "DO.4.2 Disaster Recovery",
            score: 0.92, pageNumber: 69, documentId: "private-doc-1" },
          { title: "Legacy Policy", snippet: "Recovered source without page",
            score: 0.81 },
        ],
        intent: "knowledge",
        context: "",
        guidance: "Answer from evidence.",
        responseLanguage: "en",
        timings: { metadataMs: 0, admissionMs: 0, configMs: 0,
          translationMs: 0, retrievalMs: 5, graphMs: 0, totalMs: 6 },
      },
    });
    const response = await POST(req({ messages: [{ role: "user", content: "List DO.4.2." }] }));
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split("\n")
      .filter(Boolean).map((line) => JSON.parse(line));
    const sourceEvent = events.find((event) => event.type === "sources");
    expect(sourceEvent.payload[0]).toMatchObject({
      index: 1, title: "NDMO Policy", pageNumber: 69,
    });
    expect(sourceEvent.payload[1]).not.toHaveProperty("pageNumber");
    expect(JSON.stringify(sourceEvent)).not.toContain("private-doc-1");
  });

  it("keeps complete source-table evidence and matching citations for public exhaustive lists", async () => {
    resolveAIConfig.mockResolvedValue({
      provider: "openai", chatModel: "gpt",
      flags: { publicEmbedEnabled: true }, allowedLanguages: ["en"],
    });
    const sources = [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: "v" + i, title: "Standards", snippet: "Vector excerpt " + i,
        score: 0.8, index: i + 1, sourceType: "vector",
      })),
      { id: "table-a", title: "Standards", snippet: "Source table row 1 through 9",
        score: 0, index: 9, sourceType: "structural" },
      { id: "table-b", title: "Standards", snippet: "Source table row 10 through 15",
        score: 0, index: 10, sourceType: "structural" },
    ];
    groundClaraContext.mockResolvedValueOnce({ ok: true, result: {
      sources,
      context: "[S1] Vector excerpt 0\\n\\n[S9] Source table row 1 through 9\\n\\n[S10] Source table row 10 through 15",
      intent: "knowledge", guidance: "Answer all grounded items.", responseLanguage: "en",
      timings: { metadataMs: 0, admissionMs: 0, configMs: 0,
        translationMs: 0, retrievalMs: 5, graphMs: 0, totalMs: 6 },
    } });
    const response = await POST(req({ messages: [{ role: "user", content: "List all 15 domains." }] }));
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split("\n").filter(Boolean).map(x => JSON.parse(x));
    const displayed = events.find(x => x.type === "sources")?.payload;
    expect(displayed).toHaveLength(10);
    expect(displayed[9]).toMatchObject({ index: 10 });
    const generation = chatStream.mock.calls.at(-1)?.[0] as Array<{role:string; content:string}>;
    expect(generation.map(x => x.content).join("\n")).toContain("[S10] Source table row 10 through 15");
  });

  it("starts retrieval before the admission transaction instead of after it", async () => {
    resolveAIConfig.mockResolvedValue({
      provider: "openai", chatModel: "gpt", flags: { publicEmbedEnabled: true }, allowedLanguages: ["en"],
    });
    const res = await POST(req({ messages: [{ role: "user", content: "Hi" }] }));
    await res.text();
    expect(order).toEqual(["grounding", "admission"]);
    expect(groundClaraContext).toHaveBeenCalledWith(expect.objectContaining({ channel: "chat", topK: 8 }));
  });
});
