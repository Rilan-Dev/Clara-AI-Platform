import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  validateEmbedRequest: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  dbQuery: vi.fn(),
  admitQueryEvent: vi.fn(),
  searchKbEmbedded: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/embed/core/validate-embed", () => ({
  validateEmbedRequest: mocks.validateEmbedRequest,
  buildCorsHeaders: vi.fn(() => ({})),
  handlePreflight: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
  getAssistantConfigByKb: vi.fn(),
  getKnowledgeBaseDocumentTitles: vi.fn(),
}));
vi.mock("@/modules/rag/cross-lingual", () => ({
  inferKnowledgeLanguage: vi.fn(),
  needsRetrievalTranslation: vi.fn(),
  translateQueryForRetrieval: vi.fn(),
}));
vi.mock("@/modules/embed/core/search", () => ({ searchKbEmbedded: mocks.searchKbEmbedded }));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  finalizeQueryEvent: vi.fn(),
}));
vi.mock("@/lib/quota-admission", () => ({ admitQueryEvent: mocks.admitQueryEvent }));
vi.mock("@/lib/db", () => ({ query: mocks.dbQuery }));
vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: vi.fn(),
  toProviderConfig: vi.fn(),
}));
vi.mock("@/modules/platform-health/core/incidents", () => ({
  noteEmbeddingRequestSucceeded: vi.fn(),
  recordEmbeddingRuntimeFailure: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  resolveSearchEmbedding: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/embedding-selfheal", () => ({
  selfHealBrokenCollectionEmbedding: vi.fn(),
}));
vi.mock("@/modules/ai-core/multilingual-embeddings", () => ({
  scoreThresholdFor: vi.fn(),
}));

import { POST } from "./route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/embed/search", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ query: "Confidential KB question" }),
  });
}

describe("public embed-search internal-phone boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PHONE_INTERNAL_SECRET", "server-bridge-secret");
    vi.stubEnv("CRON_SECRET", "");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.validateEmbedRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Public token required" }, { status: 401 }),
    });
    mocks.getKnowledgeBaseById.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a spoofed phone marker and KB id without embed validation bypass", async () => {
    const response = await POST(request({
      "x-phone-internal": "1",
      "x-kb-id": "kb-private",
    }));
    expect(response.status).toBe(403);
    expect(mocks.validateEmbedRequest).not.toHaveBeenCalled();
    expect(mocks.getKnowledgeBaseById).not.toHaveBeenCalled();
    expect(mocks.admitQueryEvent).not.toHaveBeenCalled();
    expect(mocks.searchKbEmbedded).not.toHaveBeenCalled();
  });

  it("rejects a wrong internal credential before any retrieval or quota charge", async () => {
    const response = await POST(request({
      "x-phone-internal": "1",
      "x-phone-secret": "wrong",
      "x-kb-id": "kb-private",
    }));
    expect(response.status).toBe(403);
    expect(mocks.dbQuery).not.toHaveBeenCalled();
  });

  it("rejects a forged KB-id header even without the internal marker", async () => {
    const response = await POST(request({ "x-kb-id": "kb-private" }));
    expect(response.status).toBe(403);
    expect(mocks.getKnowledgeBaseById).not.toHaveBeenCalled();
  });

  it("still requires normal public embed credentials for ordinary visitors", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.validateEmbedRequest).toHaveBeenCalledTimes(1);
  });

  it("accepts an authenticated phone request and uses only its KB id", async () => {
    const response = await POST(request({
      "x-phone-internal": "1",
      "x-phone-secret": "server-bridge-secret",
      "x-kb-id": "kb-private",
    }));
    expect(response.status).toBe(404);
    expect(mocks.validateEmbedRequest).not.toHaveBeenCalled();
    expect(mocks.getKnowledgeBaseById).toHaveBeenCalledWith("kb-private");
    expect(mocks.dbQuery).not.toHaveBeenCalled();
  });
});
