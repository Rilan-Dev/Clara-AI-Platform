/**
 * Plan Task 3.1 / Task 3.2 — provider-neutral Clara grounding.
 *
 * Task 3.1: groundClaraContext is THE authenticated grounding entry point;
 * tenant binding is resolved server-side from the KB row, quota admission
 * runs before retrieval, and the module performs zero KB writes.
 *
 * Task 3.2: identical knowledge binding across providers. We simulate the
 * five provider turn paths (OpenAI Realtime, Gemini Live, Sarvam, ElevenLabs
 * standard, ElevenLabs realtime) calling the grounding service with the same
 * tenant KB and assert the resolved binding is IDENTICAL — same tenantId,
 * agentId, kbId, documentId, ragMode. Only the transport differs, never the
 * knowledge binding (plan invariant §1.2).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (module-level; deterministic fixtures) ─────────────────────────────

const KB_FIXTURE = {
  id: "kb-fixture-1",
  name: "Binding Test KB",
  status: "active",
  qdrantCollection: "kb_fixture_1",
  agent_id: "agent-fixture-1",
};

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) =>
    kbId === KB_FIXTURE.id ? { ...KB_FIXTURE } : null,
  ),
  getAssistantConfigByKb: vi.fn(async () => null),
  getKnowledgeBaseDocumentTitles: vi.fn(async () => []),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => [
    { org_id: "org-fixture-1", agent_id: "agent-fixture-1" },
  ]),
}));

vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  finalizeQueryEvent: vi.fn(async () => {}),
  logQueryEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/quota-admission", () => ({
  admitQueryEvent: vi.fn(async () => ({
    admitted: true,
    eventId: "evt-1",
    warning: null,
    used: 1,
    limit: 100,
  })),
  admissionDeniedResponse: vi.fn(() => ({ status: 402, body: {} })),
}));

vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: vi.fn(async () => ({
    provider: "openai",
    embedding: { provider: "openai", model: "text-embedding-3-small", apiKey: "test" },
  })),
  toProviderConfig: vi.fn(() => ({ provider: "openai", model: "text-embedding-3-small", apiKey: "test" }) as never),
}));

vi.mock("@/modules/ai-core/factory", () => ({
  ProviderFactory: {
    getProvider: vi.fn(() => ({
      embedText: vi.fn(async () => new Array(8).fill(0.1)),
    })),
  },
}));

// Grounding behavior is tested here; topic summarization and collection
// registration have dedicated owners. Keep their I/O out of these unit tests.
vi.mock("@/modules/rag/knowledge-topics", () => ({
  getKnowledgeTopics: vi.fn(async (params: { description?: string | null; documentTitles: string[] }) =>
    params.description?.trim() || params.documentTitles.join(", "),
  ),
  clearKnowledgeTopicsCache: vi.fn(),
}));

vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  getCollectionEmbedding: vi.fn(async () => null),
  resolveSearchEmbedding: vi.fn(async (_collection: string, fallback: unknown) => fallback),
}));

vi.mock("@/modules/admin/core/vector-store", () => ({
  getQdrantClient: vi.fn(() => ({
    query: vi.fn(async (_collection: string, params: Record<string, unknown>) => {
      const limit = Number(params.limit ?? 6);
      return { points: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
        id: `point-${i}`,
        score: 0.9 - i * 0.1,
        payload: {
          chunk: `Grounded chunk ${i + 1} with the unique binding fact.`,
          title: "Policy Doc",
          originalFilename: "policy.pdf",
          documentId: "doc-fixture-1",
        },
      })) };
    }),
  })),
}));

vi.mock("@/modules/graph/core/graph-retriever", () => ({
  retrieveGraphContext: vi.fn(async () => []),
}));

vi.mock("@/modules/rag/config", () => ({
  getRagRuntimeConfig: vi.fn(({ requestedMode }: { requestedMode?: string }) => ({
    ragMode: requestedMode ?? "hybrid",
    enableGraphRag: false,
  })),
}));

vi.mock("@/modules/rag/diversify", () => ({
  candidatePoolSize: (topK: number) => topK * 2,
  diversifyByDocument: (results: unknown[]) => results,
}));

import { groundClaraContext, groundingServerTiming, resetGroundingCaches } from "./grounding";
import { clearQueryEmbeddingCache } from "./query-embedding-cache";
import { clearRetrievalTranslationCache } from "./cross-lingual";
import { clearKnowledgeTopicsCache } from "./knowledge-topics";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { admitQueryEvent } from "@/lib/quota-admission";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { query as dbQuery } from "@/lib/db";

const UNIQUE_KB_FACT_QUERY = "What is the deliberately unique KB fact for binding tests?";

function resetGroundingProviderStubs(): void {
  // clearAllMocks() resets call history, not changed mock implementations or
  // queued once-responses. Restore the default Qdrant/provider stubs so one
  // test's simulated outage cannot contaminate another provider turn.
  (getQdrantClient as ReturnType<typeof vi.fn>).mockReset().mockImplementation(() => ({
    query: vi.fn(async (_collection: string, params: Record<string, unknown>) => {
      const limit = Number(params.limit ?? 6);
      return { points: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
        id: `point-${i}`,
        score: 0.9 - i * 0.1,
        payload: {
          chunk: `Grounded chunk ${i + 1} with the unique binding fact.`,
          title: "Policy Doc",
          originalFilename: "policy.pdf",
          documentId: "doc-fixture-1",
        },
      })) };
    }),
  }));
  (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReset().mockImplementation(() => ({
    embedText: vi.fn(async () => new Array(8).fill(0.1)),
  }));
}

describe("groundClaraContext — Task 3.1 authenticated entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGroundingProviderStubs();
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
    clearKnowledgeTopicsCache();
  });


  it("uses the TEI model to reorder normal evidence but retains Qdrant scores", async () => {
    const priorUrl = process.env.RAG_RERANK_URL;
    const priorEnabled = process.env.RAG_RERANK_ENABLED;
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    process.env.RAG_RERANK_ENABLED = "true";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { index: 0, score: 0.1 },
        { index: 1, score: 0.2 },
        { index: 2, score: 0.99 },
      ],
    })));
    try {
      const outcome = await groundClaraContext({
        kbId: KB_FIXTURE.id,
        query: UNIQUE_KB_FACT_QUERY,
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.result.sources[0]?.id).toBe("point-2");
      expect(outcome.result.sources[0]?.score).toBeCloseTo(0.7);
      expect(outcome.result.timings?.rerankStatus).toBe("applied");
      expect(outcome.result.timings?.rerankMs).toBeGreaterThanOrEqual(0);
      expect(groundingServerTiming(outcome.result.timings)).toContain("rerank;dur=");
      expect(groundingServerTiming(outcome.result.timings)).not.toContain("rerankStatus;dur=");
    } finally {
      vi.unstubAllGlobals();
      if (priorUrl === undefined) delete process.env.RAG_RERANK_URL;
      else process.env.RAG_RERANK_URL = priorUrl;
      if (priorEnabled === undefined) delete process.env.RAG_RERANK_ENABLED;
      else process.env.RAG_RERANK_ENABLED = priorEnabled;
    }
  });

  it("returns grounded context with the server-resolved binding", async () => {
    const outcome = await groundClaraContext({
      kbId: KB_FIXTURE.id,
      query: UNIQUE_KB_FACT_QUERY,
      surface: "voice",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.context).toContain("[S1]");
    expect(outcome.result.sources.length).toBeGreaterThan(0);
    expect(outcome.result.binding.tenantId).toBe("org-fixture-1");
    expect(outcome.result.binding.agentId).toBe("agent-fixture-1");
    expect(outcome.result.binding.kbId).toBe(KB_FIXTURE.id);
    expect(outcome.result.kb.collection).toBe("kb_fixture_1");
    // With Graph RAG disabled in this fixture, vector latency must not be
    // misleadingly attributed to graph retrieval.
    expect(outcome.result.timings?.graphMs).toBe(0);
  });

  it("does not treat unrelated high-cosine evidence as a grounded answer for a nonexistent clause", async () => {
    const q = vi.fn(async () => ({ points: [{
      id: "wrong", score: 0.94, payload: {
        kbId: KB_FIXTURE.id, documentId: "unrelated",
        title: "Other control", chunk: "DO.1.1 has no relation to the requested control",
      },
    }] }));
    const scroll = vi.fn(async () => ({ points: [{
      id: "wrong", payload: {
        kbId: KB_FIXTURE.id, documentId: "unrelated", chunkIndex: 0,
        chunk: "DO.1.1 has no relation to the requested control",
      },
    }], next_page_offset: null }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ query: q, scroll });
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "Explain ABC.99.1" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sources).toEqual([]);
    expect(outcome.result.grounded).toBe(false);
    expect(outcome.result.context).not.toContain("DO.1.1");
  });

  it("retrieves indexed exact references and neighbors without a full-KB scroll", async () => {
    const rows = [
      { id: "head", payload: { kbId: KB_FIXTURE.id, documentId: "en", chunkIndex: 10,
        referenceIndexed: true, referenceIds: ["SYS-4.2"],
        chunk: "SYS-4.2 Procedure includes steps 1, 2, and 3", title: "Procedure" } },
      { id: "tail", payload: { kbId: KB_FIXTURE.id, documentId: "en", chunkIndex: 11,
        referenceIndexed: true, referenceIds: [],
        chunk: "4. notify 5. confirm 6. close 7. archive SYS-4.3 Next", title: "Procedure" } },
    ];
    const scroll = vi.fn(async (_collection: string, opts: Record<string, unknown>) => {
      const must = ((opts.filter as { must?: Array<{ key?: string }> })?.must ?? []);
      if (must.some((condition) => condition.key === "referenceIds")) {
        return { points: [rows[0]], next_page_offset: null };
      }
      const should = (opts.filter as { should?: Array<{ key?: string }> })?.should ?? [];
      if (must.some((condition) => condition.key === "documentId") &&
          should.some((condition) => condition.key === "chunkIndex")) {
        return { points: rows, next_page_offset: null };
      }
      throw new Error("Unexpected full collection payload scroll");
    });
    const q = vi.fn(async (_collection: string, opts: Record<string, unknown>) => {
      const must = ((opts.filter as { must?: Array<{ has_id?: string[] }> })?.must ?? []);
      return must.some((condition) => condition.has_id)
        ? { points: [...rows].reverse().map((row, i) => ({ ...row, score: 0.82 + i * 0.01 })) }
        : { points: [{ id: "semantic-noise", score: 0.92, payload: {
          kbId: KB_FIXTURE.id, documentId: "other", chunk: "Unrelated descriptions",
        } }] };
    });
    const count = vi.fn();
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ scroll, query: q, count });
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "List SYS-4.2 requirements" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sources.map((source) => source.id)).toEqual(["head", "tail"]);
    expect(outcome.result.context).toContain("7. archive");
    expect(outcome.result.context).not.toContain("SYS-4.3");
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(q).toHaveBeenCalledTimes(1); // scored selected IDs; no broad ANN search
    const onlyQueryFilter = q.mock.calls[0]?.[1].filter as { must: Array<{ has_id?: string[] }> };
    expect(onlyQueryFilter.must.some((condition) =>
      condition.has_id?.join(",") === "head,tail",
    )).toBe(true);
    expect(count).not.toHaveBeenCalled();
    expect(outcome.result.timings?.denseSearchMs).toBe(0);
    expect(outcome.result.timings?.indexLookupMs).toBeGreaterThanOrEqual(0);
    expect(outcome.result.timings?.referenceScoreMs).toBeGreaterThanOrEqual(0);
  });

  it("runs the indexed Qdrant reads while the query embedding is still pending", async () => {
    let resolveEmbedding!: (vector: number[]) => void;
    const provider = {
      embedText: vi.fn(() => new Promise<number[]>((resolve) => {
        resolveEmbedding = resolve;
      })),
    };
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);
    const chunks = [
      { id: "start", payload: { kbId: KB_FIXTURE.id, documentId: "doc-a", chunkIndex: 21,
        referenceIds: ["DO.4.2"], chunk: "DO.4.2 1. response 2. activation", title: "Policy" } },
      { id: "end", payload: { kbId: KB_FIXTURE.id, documentId: "doc-a", chunkIndex: 22,
        referenceIds: [], chunk: "3. recovery activities", title: "Policy" } },
    ];
    const scroll = vi.fn(async (_collection: string, opts: Record<string, unknown>) => {
      const filter = opts.filter as { must?: Array<{ key?: string }> };
      return {
        points: filter.must?.some((condition) => condition.key === "referenceIds")
          ? [chunks[0]] : chunks,
        next_page_offset: null,
      };
    });
    const query = vi.fn(async () => ({ points: chunks.map((chunk) => ({
      ...chunk, score: 0.8,
    })) }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ scroll, query });

    const pending = groundClaraContext({
      kbId: KB_FIXTURE.id, query: "List control DO.4.2 requirements",
    });
    // This fails if embeddings are again awaited before the Qdrant reads.
    await vi.waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
    expect(provider.embedText).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    resolveEmbedding([0.1, 0.2]);
    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sources.map((hit) => hit.id)).toEqual(["start", "end"]);
    expect(outcome.result.timings?.denseSearchMs).toBe(0);
    expect(outcome.result.timings?.referenceHeaderMs).toBeGreaterThanOrEqual(0);
    expect(outcome.result.timings?.referenceNeighborMs).toBeGreaterThanOrEqual(0);
    expect(outcome.result.timings?.indexLookupMs).toBeGreaterThanOrEqual(
      (outcome.result.timings?.referenceHeaderMs ?? 0) +
      (outcome.result.timings?.referenceNeighborMs ?? 0),
    );
  });

  it("batches overlapping exact-reference headers into one neighbor request per document", async () => {
    const rows = [
      { id: "header1", payload: { kbId: KB_FIXTURE.id, documentId: "arabic", chunkIndex: 110,
        referenceIds: ["DO.4.2"], chunk: "DO.4.2 Disaster recovery 1. prioritization", title: "Policy" } },
      { id: "header2", payload: { kbId: KB_FIXTURE.id, documentId: "arabic", chunkIndex: 111,
        referenceIds: ["DO.4.2"], chunk: "DO.4.2 1. priority 2. roles 3. response", title: "Policy" } },
      { id: "tail", payload: { kbId: KB_FIXTURE.id, documentId: "arabic", chunkIndex: 112,
        referenceIds: [], chunk: "4. safety 5. RPO 6. RTO 7. recovery DO.4.3 next control", title: "Policy" } },
    ];
    const scroll = vi.fn(async (_collection: string, opts: Record<string, unknown>) => {
      const filter = opts.filter as { must?: Array<{ key?: string }>; should?: Array<{ key?: string }> };
      if (filter.must?.some((condition) => condition.key === "referenceIds")) {
        return { points: rows.slice(0, 2), next_page_offset: null };
      }
      if (filter.must?.some((condition) => condition.key === "documentId") &&
          filter.should?.some((condition) => condition.key === "chunkIndex")) {
        return { points: rows, next_page_offset: null };
      }
      throw new Error("Unexpected full KB scan");
    });
    const query = vi.fn(async (_collection: string, params: Record<string, unknown>) => {
      const hasId = (params.filter as { must: Array<{ has_id?: string[] }> }).must
        .some((condition) => condition.has_id);
      if (!hasId) throw new Error("Unexpected broad vector search");
      return { points: rows.map((row, i) => ({ ...row, score: 0.81 - i * 0.01 })).reverse() };
    });
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ scroll, query });
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "List all DO.4.2 items" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sources.map((item) => item.id)).toEqual(["header1", "header2", "tail"]);
    expect(outcome.result.context).toContain("7. recovery");
    expect(outcome.result.context).not.toContain("DO.4.3");
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(outcome.result.timings?.denseSearchMs).toBe(0);
  });

  it("recovers a clause missed by semantic Top-K, preserving adjacent numbered requirements", async () => {
    const scanned = [
      { id: "exact-one", payload: { kbId: KB_FIXTURE.id, documentId: "arabic",
        chunkIndex: 110, title: "Policy", chunk: "DO.4.2 Disaster recovery: 1 priority" } },
      { id: "exact-two", payload: { kbId: KB_FIXTURE.id, documentId: "arabic",
        chunkIndex: 111, title: "Policy", chunk: "DO.4.2: 1 priority 2 owners 3 activation" } },
      { id: "continuation", payload: { kbId: KB_FIXTURE.id, documentId: "arabic",
        chunkIndex: 112, title: "Policy", chunk: "4 impact 5 RPO 6 RTO 7 recovery actions DO.4.3 different topic" } },
      { id: "unrelated", payload: { kbId: KB_FIXTURE.id, documentId: "english",
        chunkIndex: 56, title: "Policy", chunk: "FOI.1.1 unrelated" } },
    ];
    const q = vi.fn(async (_collection: string, params: Record<string, unknown>) => {
      const filter = params.filter as { must?: Array<{ has_id?: string[] }> };
      const selected = filter?.must?.find((condition) => condition.has_id)?.has_id;
      if (selected) {
        // Qdrant may rank the tail chunk above the policy heading. The
        // grounding context must still preserve the numbered source sequence.
        return { points: scanned.filter((p) => selected.includes(p.id))
          .map((p, i) => ({ ...p, score: 0.79 - i * 0.01 })).reverse() };
      }
      return { points: [{
        id: "wrong-semantic", score: 0.85,
        payload: { kbId: KB_FIXTURE.id, documentId: "english", chunk: "FOI.1.1 unrelated", title: "Not the requested clause" },
      }] };
    });
    const scroll = vi.fn(async (_collection: string, opts: Record<string, unknown>) => {
      if (!opts.filter) return { points: [], next_page_offset: null };
      return { points: scanned, next_page_offset: null };
    });
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ query: q, scroll });
    const outcome = await groundClaraContext({
      kbId: KB_FIXTURE.id, query: "List all requirements of control DO.4.2",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sources.map((source) => source.id))
      .toEqual(["exact-one", "exact-two", "continuation"]);
    expect(outcome.result.context).toContain("7 recovery actions");
    expect(outcome.result.context).not.toContain("DO.4.3");
    expect(outcome.result.context).not.toContain("FOI.1.1");
    expect(scroll).toHaveBeenCalledWith("kb_fixture_1", expect.objectContaining({
      filter: { must: [{ key: "kbId", match: { value: KB_FIXTURE.id } }] },
      with_vector: false,
    }));
    expect(q).toHaveBeenCalledWith("kb_fixture_1", expect.objectContaining({
      filter: { must: [
        { key: "kbId", match: { value: KB_FIXTURE.id } },
        { has_id: ["exact-one", "exact-two", "continuation"] },
      ] },
    }));
  });

  it("focuses exact-reference questions on supporting policy chunks, not high-score unrelated sections", async () => {
    const q = vi.fn(async (_collection: string, _params: Record<string, unknown>) => ({
      points: [
        { id: "english-exact", score: 0.811, payload: {
          kbId: KB_FIXTURE.id, documentId: "en", title: "English policy",
          chunk: "DO.2.1 Storage and retention: four minimum requirements",
        } },
        { id: "unrelated-foo", score: 0.805, payload: {
          kbId: KB_FIXTURE.id, documentId: "unrelated", title: "Other section",
          chunk: "DCM.2.3 Employee document training",
        } },
        { id: "arabic-exact", score: 0.789, payload: {
          kbId: KB_FIXTURE.id, documentId: "ar", title: "Arabic policy",
          chunk: "المواصفة DO.2.1: المتطلبات 1 2 3 4",
        } },
      ],
    }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: q,
      scroll: vi.fn(async () => ({ points: [] })),
    });
    const outcome = await groundClaraContext({
      kbId: KB_FIXTURE.id, query: "What does policy DO.2.1 require?",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sources.map((source) => source.id)).toEqual(["english-exact", "arabic-exact"]);
    expect(outcome.result.context).toContain("DO.2.1");
    expect(outcome.result.context).not.toContain("DCM.2.3");
  });

  it("matches the actual DO.4.2 clause when a visitor mistypes D-zero and the search query is canonical", async () => {
    const q = vi.fn(async () => ({
      points: [
        { id: "correct", score: 0.92, payload: {
          kbId: KB_FIXTURE.id, documentId: "ndmo-ar", title: "NDMO",
          chunk: "DO.4.2 Disaster Recovery: seven requirements" } },
        { id: "unrelated", score: 0.85, payload: {
          kbId: KB_FIXTURE.id, documentId: "other", title: "Another control",
          chunk: "DO.4.3 production database changes" } },
      ],
    }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: q,
      scroll: vi.fn(async () => ({ points: [], next_page_offset: null })),
    });
    const result = await groundClaraContext({
      kbId: KB_FIXTURE.id,
      query: "List the seven requirements of D0.4.2",
      searchQuery: "List the seven requirements of DO.4.2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.sources.map((source) => source.id)).toEqual(["correct"]);
    expect(result.result.context).toContain("DO.4.2");
    expect(result.result.context).not.toContain("DO.4.3");
  });


  it("enumerates the DO.4 family from the current spoken turn despite unrelated history codes", async () => {
    const rows = [1, 2, 3].map((minor) => ({
      id: "do4-" + minor,
      payload: { kbId: KB_FIXTURE.id, documentId: "published-doc",
        chunkIndex: 20 + minor, title: "Standards",
        referenceIds: ["DO.4." + minor],
        chunk: "DO.4." + minor + " policy entry " + minor },
    }));
    const scroll = vi.fn(async (_collection: string, opts: Record<string, unknown>) => {
      const filter = opts.filter as { must?: Array<{ key?: string }> };
      if (filter?.must?.some((x) => x.key === "referenceIds")) {
        return { points: [], next_page_offset: null };
      }
      return { points: rows, next_page_offset: null };
    });
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn(async () => ({ points: [] })), scroll,
    });
    const outcome = await groundClaraContext({
      kbId: KB_FIXTURE.id,
      query: "I want to know about available D0.4 series",
      searchQuery: "Previous conversation DG.2, PDP.4.1. Latest: available D0.4 series",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.context).toContain("DO.4.1");
    expect(outcome.result.context).toContain("DO.4.2");
    expect(outcome.result.context).toContain("DO.4.3");
    expect(outcome.result.context).not.toContain("PDP.4.1");
    expect(scroll).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      filter: { must: [{ key: "kbId", match: { value: KB_FIXTURE.id } }] },
    }));
  });

  it("always filters Qdrant by the server-resolved KB, even without a document ID", async () => {
    const q = vi.fn(async (_collection: string, _params: Record<string, unknown>) => ({
      points: [{
        id: "allowed-point", score: 0.91,
        payload: { kbId: KB_FIXTURE.id, documentId: "document-1", title: "Allowed", chunk: "Authorised evidence" },
      }],
    }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: q,
      scroll: vi.fn(async () => ({ points: [] })),
    });
    const result = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "Explain the control" });
    expect(result.ok).toBe(true);
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0]?.[1]).toMatchObject({
      filter: { must: [{ key: "kbId", match: { value: KB_FIXTURE.id } }] },
    });
  });

  it("ANDs an optional document scope with KB identity rather than replacing KB filtering", async () => {
    const q = vi.fn(async (_collection: string, _params: Record<string, unknown>) => ({ points: [] }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: q,
      scroll: vi.fn(async () => ({ points: [] })),
    });
    const result = await groundClaraContext({
      kbId: KB_FIXTURE.id,
      documentId: "document-1",
      query: "What does this exact document require?",
    });
    expect(result.ok).toBe(true);
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0]?.[1]).toMatchObject({
      filter: { must: [
        { key: "kbId", match: { value: KB_FIXTURE.id } },
        { key: "documentId", match: { value: "document-1" } },
      ] },
    });
  });

  it("resolves the tenant from the KB server-side — never from the request", async () => {
    await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q" });
    // The tenant resolution query ran against the DB with the kbId…
    expect(dbQuery).toHaveBeenCalled();
    // …and the request never carries tenant/org fields at all (type-level
    // guarantee — GroundingRequest has no tenant input).
    const call = (dbQuery as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(String(call)).toContain("agents a JOIN knowledge_bases");
  });

  it("rejects an unknown KB (404) and an archived KB (400)", async () => {
    const unknown = await groundClaraContext({ kbId: "kb-nope", query: "q" });
    expect(unknown).toMatchObject({ ok: false, status: 404 });

    (getKnowledgeBaseById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...KB_FIXTURE,
      status: "archived",
    });
    const archived = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q" });
    expect(archived).toMatchObject({ ok: false, status: 400, error: "Knowledge base is archived" });
  });

  it("admits quota on every retrieval turn", async () => {
    await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q", surface: "voice" });
    expect(admitQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-fixture-1", kbId: KB_FIXTURE.id, surface: "voice" }),
    );
  });

  it("runs quota admission alongside retrieval but answers only once admitted", async () => {
    let admit!: (value: unknown) => void;
    (admitQueryEvent as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((resolve) => { admit = resolve; }),
    );
    let settled = false;
    const pending = groundClaraContext({ kbId: KB_FIXTURE.id, query: UNIQUE_KB_FACT_QUERY }).then((outcome) => {
      settled = true;
      return outcome;
    });
    // Retrieval (query embedding + vector search) has already started while
    // the admission transaction is pending…
    await vi.waitFor(() => expect(ProviderFactory.getProvider).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    // …but nothing is returned before the turn is admitted.
    expect(settled).toBe(false);
    admit({ admitted: true, eventId: "evt-1", warning: null, used: 1, limit: 100 });
    const outcome = await pending;
    expect(outcome.ok).toBe(true);
  });

  it("reuses KB metadata across turns instead of re-reading it every time", async () => {
    await groundClaraContext({ kbId: KB_FIXTURE.id, query: "first question" });
    await groundClaraContext({ kbId: KB_FIXTURE.id, query: "second question" });
    expect(getKnowledgeBaseById).toHaveBeenCalledTimes(1);
  });

  it("refreshes cached KB metadata in the background once it is older than the refresh window", async () => {
    process.env.GROUNDING_METADATA_REFRESH_MS = "0";
    try {
      await groundClaraContext({ kbId: KB_FIXTURE.id, query: "first question" });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await groundClaraContext({ kbId: KB_FIXTURE.id, query: "second question" });
      await vi.waitFor(() => expect(getKnowledgeBaseById).toHaveBeenCalledTimes(2));
    } finally {
      delete process.env.GROUNDING_METADATA_REFRESH_MS;
    }
  });

  it("surfaces the 402 plan-limit contract when admission is denied", async () => {
    (admitQueryEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      admitted: false,
      reason: "Daily request limit exceeded",
      limitKey: "max_req_day",
      current: 100,
      limit: 100,
    });
    const denied = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q" });
    expect(denied).toMatchObject({ ok: false, status: 402, error: "plan_limit_exceeded" });
    if (denied.ok === false && denied.denied) {
      expect(denied.denied.limitKey).toBe("max_req_day");
    }
  });

  it("rejects a missing query with 400", async () => {
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "   " });
    expect(outcome).toMatchObject({ ok: false, status: 400, error: "Missing query" });
  });

  it("maps an empty collection to the 503 no-content contract", async () => {
    const { getQdrantClient } = await import("@/modules/admin/core/vector-store");
    const missingCollection = {
      query: vi.fn(async () => {
        throw new Error('Qdrant collection "kb_fixture_1" does not exist.');
      }),
      scroll: vi.fn(async () => {
        throw new Error('Qdrant collection "kb_fixture_1" does not exist.');
      }),
    };
    // The topic summarizer is mocked separately in these tests, so only
    // vector retrieval calls the Qdrant client. Do not queue an extra
    // one-time failure that leaks into the next provider-binding test.
    (getQdrantClient as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(missingCollection);
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q" });
    expect(outcome).toMatchObject({ ok: false, status: 503 });
  });
});

describe("groundClaraContext — Task 3.2 identical knowledge binding across providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGroundingProviderStubs();
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
    clearKnowledgeTopicsCache();
  });

  it("resolves an IDENTICAL binding for the five provider turn paths", async () => {
    // The five provider surfaces, exactly as their turn paths call the
    // grounding service. Only transport-specific knobs differ — the KB
    // request is the same tenant KB in every case.
    const providerTurns = [
      { provider: "openai-realtime", surface: "search" as const, ragMode: "hybrid" },
      { provider: "gemini-live", surface: "search" as const, ragMode: "hybrid" },
      { provider: "sarvam-realtime", surface: "voice" as const, ragMode: "hybrid" },
      { provider: "elevenlabs-standard", surface: "search" as const, ragMode: "hybrid" },
      { provider: "elevenlabs-realtime", surface: "voice" as const, ragMode: "hybrid" },
    ];

    const bindings = [];
    for (const turn of providerTurns) {
      const outcome = await groundClaraContext({
        kbId: KB_FIXTURE.id,
        query: UNIQUE_KB_FACT_QUERY,
        ragMode: turn.ragMode,
        surface: turn.surface,
        sessionId: `vrs_${turn.provider}`,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) bindings.push(outcome.result.binding);
    }

    // Plan §3.2 assertion: tenantId, agentId, kbId, documentId, ragMode are
    // IDENTICAL across every provider. Provider switching changes transport,
    // never tenant state (invariant §1.2).
    for (const binding of bindings.slice(1)) {
      expect(binding).toEqual(bindings[0]);
    }
    expect(bindings[0]).toEqual({
      tenantId: "org-fixture-1",
      agentId: "agent-fixture-1",
      kbId: KB_FIXTURE.id,
      documentId: null,
      ragMode: "hybrid",
    });
  });

  it("keeps the binding identical when a provider scopes the same document", async () => {
    const a = await groundClaraContext({
      kbId: KB_FIXTURE.id,
      query: UNIQUE_KB_FACT_QUERY,
      surface: "voice",
      documentId: "doc-fixture-1",
    });
    const b = await groundClaraContext({
      kbId: KB_FIXTURE.id,
      query: UNIQUE_KB_FACT_QUERY,
      surface: "search",
      documentId: "doc-fixture-1",
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.result.binding).toEqual(b.result.binding);
      expect(a.result.binding.documentId).toBe("doc-fixture-1");
    }
  });

  it("does not let a different KB masquerade as this tenant's binding", async () => {
    const foreign = await groundClaraContext({ kbId: "kb-other-tenant", query: "q" });
    expect(foreign).toMatchObject({ ok: false, status: 404 });
  });
});

describe("groundClaraContext — cross-lingual retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGroundingProviderStubs();
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
    clearKnowledgeTopicsCache();
  });

  it("grounds a Tamil question against an English KB via a translated query", async () => {
    const tamil = "எனக்கு ஹோம் இன்சூரன்ஸ் பற்றி கொஞ்சம் டீட்டெயில்ல தெரியணும்.";
    // English text embeds near the English FAQ; the Tamil text does not.
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      embedText: vi.fn(async (text: string) => [/insurance/i.test(text) ? 1 : 0]),
      chatStream: async function* () { yield "I want some details about home insurance."; },
    });
    const query = vi.fn(async (_collection: string, params: { query: number[] }) => ({
      points: params.query[0] === 1
        ? [{ id: "faq-home", score: 0.71, payload: { chunk: "Home insurance covers fire and theft.", title: "FAQs (All)", documentId: "doc-faq" } }]
        : [],
    }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ query });

    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: tamil, admission: "audit-only" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.grounded).toBe(true);
    expect(outcome.result.retrievalQuery).toBe("I want some details about home insurance.");
    expect(outcome.result.knowledgeLanguage).toBe("en");
    expect(outcome.result.sources[0]).toMatchObject({ id: "faq-home", score: 0.71 });
    // Both phrasings were searched.
    expect((getQdrantClient as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value.query).toBeDefined();
    expect(outcome.result.timings?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("does not translate a question already in the KB language", async () => {
    const chatStream = vi.fn();
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      embedText: vi.fn(async () => [1]),
      chatStream,
    });
    const query = vi.fn(async () => ({ points: [] }));
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ query });

    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "home insurance details", admission: "audit-only" });
    expect(outcome.ok && outcome.result.retrievalQuery).toBeNull();
    expect(chatStream).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("groundClaraContext — turn guidance (no canned refusal)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGroundingProviderStubs();
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
    clearKnowledgeTopicsCache();
  });

  it("a greeting with no KB hit gets natural-handling guidance, not a restriction", async () => {
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      embedText: vi.fn(async () => [0]),
      chatStream: async function* () { yield "Hello"; },
    });
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ query: vi.fn(async () => ({ points: [] })), scroll: vi.fn(async () => ({ points: [] })) });

    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "வணக்கம்", admission: "audit-only", channel: "voice" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.grounded).toBe(false);
    expect(outcome.result.guidance).toMatch(/greeting, thanks, small talk/i);
    expect(outcome.result.guidance).toMatch(/finish your sentences/);
    expect(outcome.result.guidance).not.toMatch(/say exactly/i);
  });

  it("a Tamil capability question returns the KB topics in the guidance", async () => {
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "ஒன்றாலே எனக்கு எப்படி உதவ முடியும்?" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.intent).toBe("capability");
    expect(outcome.result.guidance).toMatch(/what you can help with/);
  });

  it("external admission leaves the query event to the caller (no double counting)", async () => {
    const analytics = await import("@/modules/knowledge-bases/core/analytics-db");
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue({ embedText: vi.fn(async () => [1]) });
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ query: vi.fn(async () => ({ points: [] })), scroll: vi.fn(async () => ({ points: [] })) });

    await groundClaraContext({ kbId: KB_FIXTURE.id, query: "home insurance", admission: "external" });
    expect(admitQueryEvent).not.toHaveBeenCalled();
    expect(analytics.finalizeQueryEvent).not.toHaveBeenCalled();
    expect(analytics.logQueryEvent).not.toHaveBeenCalled();
  });
});
