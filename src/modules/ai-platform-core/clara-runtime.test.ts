import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic boundaries for the migrated tools seam: the Unified Tool Runtime
// delegates rag_search execution to claraRuntime.retrieve → groundClaraContext
// (DB/Qdrant), and authorization to the existing ai-governance entitlement
// resolver (DB). Both are mocked so the SEAM contract — list()/invoke()
// delegation, legacy throw messages, tenant carriage — is unit-provable.
vi.mock("@/modules/rag/grounding", () => ({
  groundClaraContext: vi.fn(async () => ({
    ok: true as const,
    result: {
      context: "[S1] grounded evidence",
      grounded: true,
      sources: [],
      graphSources: [],
      mode: "hybrid",
      kb: { id: "kb-aaaaaaaa", name: "KB", collection: "col" },
      binding: { tenantId: "11111111-1111-4111-8111-111111111111", agentId: null, kbId: "kb-aaaaaaaa", documentId: null, ragMode: "hybrid" },
      scope: {
        assistantName: "Clara",
        welcomeMessage: "Hi",
        knowledgeBaseName: "KB",
        knowledgeBaseDescription: null,
        documentCount: 1,
        documentTitles: ["Doc"],
      },
      intent: "knowledge",
      guidance: "Answer from the evidence.",
      responseLanguage: "en",
      latencyMs: 8,
    },
    warning: null,
  })),
}));

vi.mock("@/modules/ai-governance/core/entitlements-db", () => ({
  resolvePlanAIEntitlements: vi.fn(async () => ({
    planId: "pro",
    planName: "Pro",
    capabilities: { chat: true, voice_chat: true, realtime_voice: true },
    allowedProviders: { openai: true, gemini: true, sarvam: true, elevenlabs: true },
    modelExceptions: [],
  })),
}));

import { groundClaraContext } from "@/modules/rag/grounding";
import { claraRuntime } from "./clara-runtime";
import { getClaraToolRuntime, RAG_SEARCH_TOOL_NAME } from "./clara-tools";

const mockedGrounding = vi.mocked(groundClaraContext);

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const KB_A = "kb-aaaaaaaa";

const incumbentContext = {
  orgId: TENANT_A,
  agentId: "agent-1",
  kbId: KB_A,
  userId: "user-1",
  sessionId: "session-1",
};

beforeEach(() => {
  mockedGrounding.mockClear();
});

describe("claraRuntime", () => {
  it("exposes the core runtime seams", () => {
    expect(typeof claraRuntime.resolveProvider).toBe("function");
    expect(typeof claraRuntime.resolveVoice).toBe("function");
    expect(typeof claraRuntime.retrieve).toBe("function");
    expect(typeof claraRuntime.createChatTurn).toBe("function");
    expect(typeof claraRuntime.startRealtimeSession).toBe("function");
    expect(typeof claraRuntime.tools.list).toBe("function");
    expect(typeof claraRuntime.tools.invoke).toBe("function");
  });

  it("exposes only the Clara-owned grounded tool surface", () => {
    expect(claraRuntime.tools.list().map((tool) => tool.name)).toEqual(["rag_search"]);
  });
});

describe("claraRuntime.tools — the migrated Phase 7-B seam", () => {
  it("list() serves the Unified Tool Runtime's discovery summaries (contract preserved)", () => {
    const listed = claraRuntime.tools.list();
    expect(listed).toEqual([
      {
        name: RAG_SEARCH_TOOL_NAME,
        description: "Retrieve tenant-bound evidence from Clara's active knowledge base.",
      },
    ]);
    // The seam delegates to the SAME application singleton the module exports.
    expect(getClaraToolRuntime().hasTool(RAG_SEARCH_TOOL_NAME)).toBe(true);
  });

  it("invoke() delegates to the registry and returns the incumbent GroundingOutcome payload", async () => {
    const outcome = await claraRuntime.tools.invoke(incumbentContext, RAG_SEARCH_TOOL_NAME, {
      query: "policy question",
    });

    // The domain payload IS the grounding outcome — the legacy return contract.
    expect(outcome).toMatchObject({ ok: true, warning: null });
    expect((outcome as { result: { grounded: boolean } }).result.grounded).toBe(true);

    // The underlying retrieval ran through the incumbent path with the
    // caller's tenant context and the incumbent options (channel voice,
    // surface voice, admission external).
    expect(mockedGrounding).toHaveBeenCalledTimes(1);
    const groundingRequest = mockedGrounding.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(groundingRequest).toMatchObject({
      kbId: KB_A,
      query: "policy question",
      searchQuery: "policy question",
      topK: 8,
      ragMode: "hybrid",
      surface: "voice",
      sessionId: "session-1",
      userId: "user-1",
      admission: "external",
      channel: "voice",
    });
  });

  it("invoke() preserves the legacy throw contract message-for-message", async () => {
    // Unknown tool → the exact legacy message.
    await expect(
      claraRuntime.tools.invoke(incumbentContext, "nonexistent_tool", {}),
    ).rejects.toThrow("Unsupported Clara tool: nonexistent_tool");

    // Missing/blank query on rag_search → the exact legacy message.
    await expect(
      claraRuntime.tools.invoke(incumbentContext, RAG_SEARCH_TOOL_NAME, {}),
    ).rejects.toThrow("rag_search requires a query.");
    await expect(
      claraRuntime.tools.invoke(incumbentContext, RAG_SEARCH_TOOL_NAME, { query: "   " }),
    ).rejects.toThrow("rag_search requires a query.");

    // Nothing reached the retrieval for the rejected calls.
    expect(mockedGrounding).not.toHaveBeenCalled();
  });

  it("invoke() carries the payload ragMode exactly as the incumbent seam did", async () => {
    await claraRuntime.tools.invoke(incumbentContext, RAG_SEARCH_TOOL_NAME, {
      query: "q",
      ragMode: "classic",
    });
    expect((mockedGrounding.mock.calls[0][0] as { ragMode: string }).ragMode).toBe("classic");

    await claraRuntime.tools.invoke(incumbentContext, RAG_SEARCH_TOOL_NAME, {
      query: "q2",
      ragMode: "agentic",
    });
    expect((mockedGrounding.mock.calls[1][0] as { ragMode: string }).ragMode).toBe("agentic");

    // Absent ragMode → hybrid (the incumbent default).
    await claraRuntime.tools.invoke(incumbentContext, RAG_SEARCH_TOOL_NAME, { query: "q3" });
    expect((mockedGrounding.mock.calls[2][0] as { ragMode: string }).ragMode).toBe("hybrid");
  });

  it("invoke() fails closed on missing tenant identity — no ambient fallback", async () => {
    await expect(
      claraRuntime.tools.invoke(
        { orgId: null, agentId: null, kbId: KB_A, userId: null, sessionId: null },
        RAG_SEARCH_TOOL_NAME,
        { query: "q" },
      ),
    ).rejects.toThrow(/tenant identity/i);
    expect(mockedGrounding).not.toHaveBeenCalled();
  });
});
