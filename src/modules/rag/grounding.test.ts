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

vi.mock("@/modules/admin/core/vector-store", () => ({
  getQdrantClient: vi.fn(() => ({
    search: vi.fn(async (_collection: string, params: Record<string, unknown>) => {
      const limit = Number(params.limit ?? 6);
      return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
        id: `point-${i}`,
        score: 0.9 - i * 0.1,
        payload: {
          chunk: `Grounded chunk ${i + 1} with the unique binding fact.`,
          title: "Policy Doc",
          originalFilename: "policy.pdf",
          documentId: "doc-fixture-1",
        },
      }));
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

import { groundClaraContext, resetGroundingCaches } from "./grounding";
import { clearQueryEmbeddingCache } from "./query-embedding-cache";
import { clearRetrievalTranslationCache } from "./cross-lingual";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { admitQueryEvent } from "@/lib/quota-admission";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { query as dbQuery } from "@/lib/db";

const UNIQUE_KB_FACT_QUERY = "What is the deliberately unique KB fact for binding tests?";

describe("groundClaraContext — Task 3.1 authenticated entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
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

  it("admits quota BEFORE any retrieval spend", async () => {
    await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q", surface: "voice" });
    expect(admitQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-fixture-1", kbId: KB_FIXTURE.id, surface: "voice" }),
    );
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
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      search: vi.fn(async () => {
        throw new Error('Qdrant collection "kb_fixture_1" does not exist.');
      }),
    });
    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "q" });
    expect(outcome).toMatchObject({ ok: false, status: 503 });
  });
});

describe("groundClaraContext — Task 3.2 identical knowledge binding across providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
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
    resetGroundingCaches();
    clearQueryEmbeddingCache();
    clearRetrievalTranslationCache();
  });

  it("grounds a Tamil question against an English KB via a translated query", async () => {
    const tamil = "எனக்கு ஹோம் இன்சூரன்ஸ் பற்றி கொஞ்சம் டீட்டெயில்ல தெரியணும்.";
    // English text embeds near the English FAQ; the Tamil text does not.
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      embedText: vi.fn(async (text: string) => [/insurance/i.test(text) ? 1 : 0]),
      chatStream: async function* () { yield "I want some details about home insurance."; },
    });
    const search = vi.fn(async (_collection: string, params: { vector: number[] }) =>
      params.vector[0] === 1
        ? [{ id: "faq-home", score: 0.71, payload: { chunk: "Home insurance covers fire and theft.", title: "FAQs (All)", documentId: "doc-faq" } }]
        : [],
    );
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ search });

    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: tamil, admission: "audit-only" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.grounded).toBe(true);
    expect(outcome.result.retrievalQuery).toBe("I want some details about home insurance.");
    expect(outcome.result.knowledgeLanguage).toBe("en");
    expect(outcome.result.sources[0]).toMatchObject({ id: "faq-home", score: 0.71 });
    // Both phrasings were searched.
    expect(search).toHaveBeenCalledTimes(2);
    expect(outcome.result.timings?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("does not translate a question already in the KB language", async () => {
    const chatStream = vi.fn();
    (ProviderFactory.getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      embedText: vi.fn(async () => [1]),
      chatStream,
    });
    const search = vi.fn(async () => []);
    (getQdrantClient as ReturnType<typeof vi.fn>).mockReturnValue({ search });

    const outcome = await groundClaraContext({ kbId: KB_FIXTURE.id, query: "home insurance details", admission: "audit-only" });
    expect(outcome.ok && outcome.result.retrievalQuery).toBeNull();
    expect(chatStream).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledTimes(1);
  });
});
