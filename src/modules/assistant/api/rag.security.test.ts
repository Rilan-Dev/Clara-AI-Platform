import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  groundClaraContext: vi.fn(),
  groundingServerTiming: vi.fn(() => ""),
  admissionDeniedResponse: vi.fn(),
}));

vi.mock("@/modules/rag/grounding", () => ({
  groundClaraContext: mocks.groundClaraContext,
  groundingServerTiming: mocks.groundingServerTiming,
}));
vi.mock("@/lib/quota-admission", () => ({
  admissionDeniedResponse: mocks.admissionDeniedResponse,
}));

import { postRagSearch } from "./rag";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/rag/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("shared RAG legacy boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unowned document-catalog searches without touching grounding", async () => {
    const response = await postRagSearch(
      request({ documentId: "unowned-catalog-document", query: "private data" }),
    );

    expect(response.status).toBe(410);
    expect(mocks.groundClaraContext).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: "Document-only RAG search is no longer available; provide an authorized kbId.",
    });
  });

  it("continues forwarding KB-bound calls to the provider-neutral grounding service", async () => {
    mocks.groundClaraContext.mockResolvedValueOnce({
      ok: true,
      result: {
        context: "allowed context",
        sources: [],
        graphSources: [],
        grounded: true,
        outOfScopeReply: "",
        mode: "classic",
        kb: { id: "kb-1", name: "Authorized", collection: "kb_1" },
        scope: {},
        intent: "knowledge",
        guidance: "",
        responseLanguage: "en",
        knowledgeLanguage: "en",
        latencyMs: 1,
      },
    });
    const response = await postRagSearch(request({ kbId: "kb-1", query: "hello" }));

    expect(response.status).toBe(200);
    expect(mocks.groundClaraContext).toHaveBeenCalledWith(
      expect.objectContaining({ kbId: "kb-1", query: "hello" }),
    );
  });
});
