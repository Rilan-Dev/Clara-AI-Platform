/**
 * src/modules/rag/grounding.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * THE authenticated Clara grounding entry point (plan Task 3.1).
 *
 * One service that every provider-controlled turn calls to obtain grounded
 * context. It ultimately resolves:
 *
 *     tenantId (org)  ← KB → agent → org, resolved SERVER-SIDE
 *     kbId            ← the requested KB, validated active
 *     documentId      ← optional Qdrant filter
 *     ragMode         ← runtime RAG policy (classic/hybrid/agentic + graph)
 *     query           ← the user question
 *   and returns grounded context + sources.
 *
 * Authorization properties (plan §3.1 acceptance):
 *   • the caller cannot select another tenant — orgId is derived from the KB
 *     row server-side, never accepted from the request;
 *   • the caller cannot select another KB — the kbId must resolve to an
 *     ACTIVE knowledge base owned by that tenant;
 *   • the caller cannot bypass authorization — quota admission (atomic
 *     check-and-insert) runs BEFORE any retrieval spend;
 *   • the provider cannot create vendor KB state — this module performs zero
 *     KB/collection writes; Qdrant stays Clara-owned and read-only here.
 *
 * Provider = how Clara talks. Clara KB = what Clara knows. This service is
 * the only "what Clara knows" door for realtime voice turns.
 *
 * Transport-neutral: returns a plain outcome object (no NextResponse), so
 * HTTP routes, provider webhooks, relays and future server-side turn
 * pipelines all share the exact same grounding path.
 */

import { getAssistantConfigByKb, getKnowledgeBaseById, getKnowledgeBaseDocumentTitles } from "@/modules/knowledge-bases/core/db";
import {
  finalizeQueryEvent,
  logQueryEvent,
} from "@/modules/knowledge-bases/core/analytics-db";
import { admitQueryEvent, type AdmissionDenied, type QuotaWarning } from "@/lib/quota-admission";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { query as dbQuery } from "@/lib/db";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { getRagRuntimeConfig } from "@/modules/rag/config";
import { retrieveGraphContext } from "@/modules/graph/core/graph-retriever";
import { candidatePoolSize, diversifyByDocument } from "@/modules/rag/diversify";
import type { QuerySurface } from "@/modules/knowledge-bases/core/analytics-db";

const SCORE_THRESHOLD = 0.25;
const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 20;
const GROUNDING_RESOLUTION_CACHE_TTL_MS = 30_000;

type CachedEmbeddingResolution = {
  expiresAt: number;
  value: Awaited<ReturnType<typeof resolveAIConfig>>;
};

const groundingResolutionCache = new Map<string, CachedEmbeddingResolution>();

async function resolveGroundingAIConfig(kbId: string, preferDraft = false) {
  const key = `rag-embedding:${kbId}|${preferDraft ? "draft" : "live"}`;
  const cached = groundingResolutionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await resolveAIConfig({ kbId, surface: "rag-embedding", preferDraft });
  groundingResolutionCache.set(key, {
    expiresAt: Date.now() + GROUNDING_RESOLUTION_CACHE_TTL_MS,
    value,
  });

  if (groundingResolutionCache.size > 512) {
    const now = Date.now();
    for (const [cacheKey, entry] of groundingResolutionCache) {
      if (entry.expiresAt <= now) groundingResolutionCache.delete(cacheKey);
    }
  }

  return value;
}

export type GroundingRagMode = "classic" | "hybrid" | "agentic";

export interface GroundingRequest {
  /** The Clara KB to ground against. Must be active and tenant-bound. */
  kbId: string;
  /** The user question. */
  query: string;
  /** Optional document scope INSIDE the KB (Qdrant filter). */
  documentId?: string | null;
  /** Requested RAG mode; runtime policy decides the effective mode. */
  ragMode?: GroundingRagMode | string | null;
  /** Retrieval width. */
  topK?: number;
  /** Audit/metering surface (search | voice | embed | workspace). */
  surface?: QuerySurface;
  /** Correlation with realtime voice sessions (plan Phase 2 identity). */
  sessionId?: string | null;
  /** Acting user when known (audit only, never used for tenant resolution). */
  userId?: string | null;
  /**
   * "quota" (default): atomic quota admission before retrieval — standard for
   * Clara-controlled turns. "audit-only": log the query event without quota
   * admission — for surfaces whose quota is metered elsewhere (ElevenLabs
   * Mode B admits its quota at post-call, admitting here would double-bill).
   */
  admission?: "quota" | "audit-only";
  /**
   * Embedding provider override — ONLY for internal flows (public demo) that
   * must pin the embedding backbone. Selects the EMBEDDING transport, never
   * the tenant/KB/knowledge.
   */
  embeddingOverride?: ProviderConfig;
  /**
   * Draft-preview mode (authenticated agent preview): resolve against the
   * CURRENT Main-branch draft and search the LIVE collection instead of the
   * published snapshot. Never set on public/embed surfaces.
   */
  preferDraft?: boolean;
}

export interface GroundedSource {
  index: number;
  id: string;
  title: string;
  originalFilename?: string;
  documentId?: string;
  score: number;
  snippet: string;
  sourceType: "vector";
}

export interface GraphSource {
  index: number;
  id: string;
  title: string;
  score: number;
  snippet: string;
  sourceType: "graph";
  relations: unknown;
}

/** Server-resolved knowledge binding — the plan §3.2 assertion target. */
export interface KnowledgeBinding {
  tenantId: string | null;
  agentId: string | null;
  kbId: string;
  documentId: string | null;
  ragMode: string;
}

export interface GroundingScope {
  assistantName: string;
  welcomeMessage: string;
  knowledgeBaseName: string;
  knowledgeBaseDescription: string | null;
  documentCount: number;
  documentTitles: string[];
}

export type GroundingIntent = "capability" | "knowledge" | "out_of_scope";

export interface GroundedContext {
  /** Assembled grounded context string ([S1]…/[G1]… blocks). */
  context: string;
  /** True only when retrieval produced sufficiently relevant evidence. */
  grounded: boolean;
  /** Provider-neutral response for out-of-scope questions. */
  outOfScopeReply: string;
  sources: GroundedSource[];
  graphSources: GraphSource[];
  mode: string;
  kb: { id: string; name: string; collection: string };
  /** Server-resolved binding — identical across providers for the same KB. */
  binding: KnowledgeBinding;
  /** Dynamic assistant scope used for onboarding/capability turns. */
  scope: GroundingScope;
  /** Lightweight intent classification performed before retrieval. */
  intent: GroundingIntent;
  /** Best-effort local language detected from the visitor query. */
  responseLanguage: string;
  latencyMs: number;
}

export type GroundingOutcome =
  | { ok: true; result: GroundedContext; warning: QuotaWarning | null }
  | {
      ok: false;
      status: number;
      error: string;
      detail?: string;
      /** Present when status is 402 — the plan_limit_exceeded contract. */
      denied?: AdmissionDenied;
    };

/** Resolve the tenant (org) + agent that own a KB — server-side only. */
async function resolveKbTenant(
  kbId: string,
): Promise<{ orgId: string | null; agentId: string | null }> {
  const rows = await dbQuery<{ org_id: string; agent_id: string }>(
    `SELECT a.org_id, a.id AS agent_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
    [kbId],
  );
  const orgId = rows[0]?.org_id ?? null;
  const agentId = rows[0]?.agent_id ?? null;
  return { orgId, agentId };
}

function detectResponseLanguage(query: string, allowedLanguages: string[]): string {
  const normalized = query.normalize("NFKC").toLowerCase();
  const allowed = new Set(allowedLanguages.map((value) => value.trim().toLowerCase()).filter(Boolean));

  // Explicit output-language requests override the language of the question.
  if (allowed.has("ta") && /\b(answer|reply|respond|speak|talk|tell) (me )?(in )?tamil\b/.test(normalized)) return "ta";
  if (allowed.has("hi") && /\b(answer|reply|respond|speak|talk|tell) (me )?(in )?hindi\b/.test(normalized)) return "hi";
  if (allowed.has("te") && /\b(answer|reply|respond|speak|talk|tell) (me )?(in )?telugu\b/.test(normalized)) return "te";
  if (allowed.has("en") && /\b(answer|reply|respond|speak|talk|tell) (me )?(in )?english\b/.test(normalized)) return "en";
  if (allowed.has("ta") && /(தமிழில்|தமிழ்ல|தமிழாக)/.test(normalized)) return "ta";
  if (allowed.has("hi") && /(हिंदी में|हिंदीमे)/.test(normalized)) return "hi";
  if (allowed.has("te") && /(తెలుగులో|తెలుగులోనే)/.test(normalized)) return "te";

  if (allowed.has("ta") && /[\u0B80-\u0BFF]/.test(normalized)) return "ta";
  if (allowed.has("hi") && /[\u0900-\u097F]/.test(normalized)) return "hi";
  if (allowed.has("te") && /[\u0C00-\u0C7F]/.test(normalized)) return "te";

  // Small, local heuristic for common romanized Indian-language prompts.
  // It is intentionally conservative: English remains the fallback.
  if (allowed.has("ta") && /\b(enakku|enna|eppadi|sollu|venum|panna|help)\b/.test(normalized)) return "ta";
  if (allowed.has("hi") && /\b(mujhe|kaise|batao|chahiye|madad)\b/.test(normalized)) return "hi";
  if (allowed.has("te") && /\b(naaku|ela|cheppu|kavali|sahayam)\b/.test(normalized)) return "te";
  return allowed.has("en") ? "en" : allowedLanguages[0]?.trim().toLowerCase() || "en";
}

function isCapabilityQuery(query: string): boolean {
  const normalized = query.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  // This classifier identifies onboarding/capability intent only; it never
  // encodes customer topics. It deliberately covers common English, Tamil,
  // and mixed/romanized Tamil formulations so these turns do not depend on
  // semantic retrieval finding a matching FAQ passage.
  const patterns = [
    /\bwhat (can|do) you (do|help|answer)\\b/,
    /\bhow can you help\\b/,
    /\bwhat can i ask\\b/,
    /\bwhat (topics|questions) (do you|can you) (cover|answer)\\b/,
    /\bhow do you help\\b/,
    /என்ன மாதிரி .*help/,
    /எந்தந்த .*help/,
    /எப்படி .*help/,
    /என்ன .*கேட்க/,
    /என்னென்ன .*கேட்க/,
    /என்னென்ன .*தெரியும்/,
    /எதைப் பற்றி .*பதில்/,
    /எதை பற்றி .*பதில்/,
    /எந்த .*விஷய/,
    /எந்தந்த .*விஷய/,
    /என்ன மாதிரி .*பண்ண முடியும்/,
    /எப்படி .*உதவி/,
    /enna .*help/,
    /eppadi .*help/,
    /enna maathiri .*help/,
    /enna ketkalam/,
    /enna topics/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

type SearchHit = {
  id: string;
  snippet: string;
  score: number;
  payload?: Record<string, unknown>;
};

async function searchKbCollection(
  collectionName: string,
  query: string,
  topK: number,
  filter?: Record<string, unknown>,
  providerConfig?: ProviderConfig,
): Promise<SearchHit[]> {
  const client = getQdrantClient();
  const embedding = await ProviderFactory.getProvider(providerConfig).embedText(query);

  // Fetch a wider candidate pool so a document-scoped filter isn't required
  // just to keep a smaller document's chunks from being crowded out by a
  // larger one in the same KB collection.
  const fetchLimit = filter ? topK : candidatePoolSize(topK);

  const searchParams: Record<string, unknown> = {
    vector: embedding,
    limit: fetchLimit,
    with_payload: true,
    score_threshold: SCORE_THRESHOLD,
    ...(filter ? { filter } : {}),
  };

  let results;
  try {
    results = await client.search(
      collectionName,
      searchParams as Parameters<typeof client.search>[1],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      throw new Error(
        `Qdrant collection "${collectionName}" does not exist. Documents may still be processing — check the ingest worker status at /api/worker/ingest or re-upload your documents.`,
      );
    }
    throw err;
  }

  // A zero-hit result is intentionally treated as "no grounded answer".
  // Never remove the score threshold as a fallback: weak semantic matches
  // must not become context for an out-of-scope question.

  const mapped = (
    results as Array<{ id: string | number; score?: number; payload?: Record<string, unknown> }>
  )
    .map((r) => ({
      id: String(r.id),
      snippet: r.payload?.chunk ? String(r.payload.chunk) : "",
      score: r.score ?? 0,
      payload: r.payload as Record<string, unknown>,
    }))
    .sort((a, b) => b.score - a.score);

  if (filter) return mapped;

  return diversifyByDocument(mapped, {
    getDocId: (r) => (r.payload?.documentId ? String(r.payload.documentId) : undefined),
    getScore: (r) => r.score,
    topK,
  });
}

/**
 * The one authenticated Clara grounding entry point.
 *
 * Deterministic binding: for the same kbId (+ optional documentId), the
 * resolved tenantId/agentId/kbId/documentId/ragMode are IDENTICAL regardless
 * of which voice provider initiated the turn — that invariance is what plan
 * Task 3.2 asserts.
 */
export async function groundClaraContext(request: GroundingRequest): Promise<GroundingOutcome> {
  const query = (request.query ?? "").trim();
  if (!query) {
    return { ok: false, status: 400, error: "Missing query" };
  }
  const topK = Math.min(Number(request.topK ?? DEFAULT_TOP_K), MAX_TOP_K);

  const t0 = Date.now();
  const [kb, assistantConfig, documentTitles, tenant] = await Promise.all([
    getKnowledgeBaseById(request.kbId),
    getAssistantConfigByKb(request.kbId),
    getKnowledgeBaseDocumentTitles(request.kbId),
    resolveKbTenant(request.kbId),
  ]);
  if (!kb) {
    return { ok: false, status: 404, error: "Knowledge base not found" };
  }
  if (kb.status !== "active") {
    return { ok: false, status: 400, error: "Knowledge base is archived" };
  }

  const scope: GroundingScope = {
    assistantName: assistantConfig?.assistantName ?? kb.name,
    welcomeMessage: assistantConfig?.welcomeMessage ?? "",
    knowledgeBaseName: kb.name,
    knowledgeBaseDescription:
      typeof (kb as { description?: unknown }).description === "string"
        ? (kb as { description: string }).description
        : null,
    documentCount: documentTitles.length,
    documentTitles,
  };

  // ── Tenant binding: derived server-side from the KB row, never from input.
  const { orgId, agentId } = tenant;
  const responseLanguage = detectResponseLanguage(
    query,
    assistantConfig?.allowedLanguages ?? ["en"],
  );
  // Capability/onboarding turns are intentionally resolved before vector search.
  // They should work even when the KB contains no FAQ phrased like the visitor's
  // question, and their answer is derived from the current assistant/KB config.
  if (isCapabilityQuery(query)) {
    const capabilityLines = [
      scope.welcomeMessage.trim(),
      scope.knowledgeBaseDescription?.trim(),
      scope.documentTitles.length > 0
        ? `Available knowledge sources: ${scope.documentTitles.join(", ")}.`
        : "",
    ].filter(Boolean);

    return {
      ok: true,
      warning: null,
      result: {
        context: capabilityLines.join("\n\n"),
        grounded: false,
        outOfScopeReply:
          assistantConfig?.outOfScopeReply ??
          "I can only answer questions about the topics I have been set up for.",
        sources: [],
        graphSources: [],
        mode: getRagRuntimeConfig({ requestedMode: request.ragMode ?? undefined }).ragMode,
        kb: { id: kb.id, name: kb.name, collection: kb.qdrantCollection },
        binding: {
          tenantId: orgId,
          agentId,
          kbId: kb.id,
          documentId: request.documentId ?? null,
          ragMode: getRagRuntimeConfig({ requestedMode: request.ragMode ?? undefined }).ragMode,
        },
        scope,
        intent: "capability",
        responseLanguage,
        latencyMs: Date.now() - t0,
      },
    };
  }


  // ── Atomic quota admission (org-wide, rolling 24h) BEFORE retrieval spend.
  // Audit-only surfaces log the event AFTER retrieval instead (their quota
  // is metered at a different point in the turn lifecycle).
  const admissionMode = request.admission ?? "quota";
  let admission: Awaited<ReturnType<typeof admitQueryEvent>> | null = null;
  if (admissionMode === "quota") {
    admission = await admitQueryEvent({
      orgId,
      kbId: kb.id,
      queryText: query,
      surface: request.surface ?? "search",
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      ...(request.userId !== undefined ? { userId: request.userId } : {}),
    });
    if (!admission.admitted) {
      return { ok: false, status: 402, error: "plan_limit_exceeded", denied: admission };
    }
  }

  // ── Embedding config: resolved from KB AI policy; the override only pins
  // the embedding transport (public demo), never the knowledge.
  const resolved = await resolveGroundingAIConfig(kb.id, request.preferDraft === true);
  const providerConfig =
    request.embeddingOverride ?? toProviderConfig(resolved!, "embedding");

  const runtime = getRagRuntimeConfig({
    requestedMode: (request.ragMode ?? undefined) as string | undefined,
  });

  const filter = request.documentId
    ? { must: [{ key: "documentId", match: { value: request.documentId } }] }
    : undefined;

  const graphPromise = runtime.enableGraphRag
    ? retrieveGraphContext({
        kbId: kb.id,
        query,
        topK: Math.min(topK, 4),
        documentId: request.documentId ?? undefined,
      })
    : Promise.resolve([]);

  let vectorResults: SearchHit[];
  try {
    vectorResults = await searchKbCollection(
      resolved.knowledgeCollection ?? kb.qdrantCollection,
      query,
      topK,
      filter,
      providerConfig,
    );
  } catch (searchErr) {
    const msg = (searchErr as Error).message;
    if (msg.includes("does not exist")) {
      return {
        ok: false,
        status: 503,
        error:
          "This knowledge base has no indexed content yet. Please upload documents and wait for them to finish processing.",
        detail: msg,
      };
    }
    throw searchErr;
  }

  // Vector and graph retrieval are independent; the graph request is started
  // before vector search so hybrid/agentic turns overlap remote latency.
  const graphHits = await graphPromise;

  const graphContext = graphHits
    .map((hit, index) => {
      const relations = hit.relations
        .slice(0, 3)
        .map((relation) => `${relation.source} -[${relation.type}]-> ${relation.target}`)
        .join("; ");
      const evidence = hit.supportingChunks
        .slice(0, 2)
        .map((chunk) => chunk.text)
        .filter(Boolean)
        .join("\n");

      return [
        `[G${index + 1}] ${hit.label}`,
        `Type: ${hit.type}`,
        relations ? `Relations: ${relations}` : "",
        evidence ? `Evidence: ${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\\n");
    })
    .join("\\n\\n");

  if (admissionMode === "quota") {
    void finalizeQueryEvent(admission && admission.admitted ? admission.eventId : null, {
      answerText: "",
      sourceCount: vectorResults.length + graphHits.length,
      latencyMs: Date.now() - t0,
      status: "ok",
    });
  } else {
    // Audit-only: same audit row shape, no quota semantics (§11.10 — query
    // text + snippet count, never snippet bodies).
    void logQueryEvent({
      kbId: kb.id,
      orgId,
      queryText: query,
      sourceCount: vectorResults.length + graphHits.length,
      surface: request.surface ?? "voice",
      status: "ok",
      answerText: null,
    }).catch((error) => {
      console.warn("[grounding] audit-only query event failed:", (error as Error).message);
    });
  }

  const contextParts = [
    vectorResults
      .map((r, i) => {
        const title = r.payload?.title ? String(r.payload.title) : "Document";
        const filename = r.payload?.originalFilename ? String(r.payload.originalFilename) : "";
        const label = filename && filename !== title ? `${title} (${filename})` : title;
        return `[S${i + 1}] ${label}
${r.snippet}`.trim();
      })
      .join("\n\n"),
  ];

  if (graphContext) {
    contextParts.push(`Graph context
${graphContext}`);
  }

  const context = contextParts.filter(Boolean).join("\n\n");

  const sources: GroundedSource[] = vectorResults.map((r, i) => ({
    index: i + 1,
    id: r.id,
    title: r.payload?.title ? String(r.payload.title) : "Document",
    originalFilename: r.payload?.originalFilename ? String(r.payload.originalFilename) : undefined,
    documentId: r.payload?.documentId ? String(r.payload.documentId) : undefined,
    score: r.score,
    snippet: r.snippet,
    sourceType: "vector",
  }));

  const graphSources: GraphSource[] = graphHits.map((hit, index) => ({
    index: index + 1,
    id: hit.id,
    title: hit.label,
    score: hit.score,
    snippet: hit.supportingChunks
      .map((chunk) => chunk.text)
      .filter(Boolean)
      .join(" ")
      .slice(0, 500),
    sourceType: "graph",
    relations: hit.relations,
  }));

  return {
    ok: true,
    warning: admission && admission.admitted ? admission.warning : null,
    result: {
      context,
      sources,
      graphSources,
      mode: runtime.ragMode,
      grounded: sources.length > 0 || graphSources.length > 0,
      outOfScopeReply:
        resolved.assistantConfig?.outOfScopeReply ??
        "I can only answer questions about the topics I have been set up for.",
      kb: {
        id: kb.id,
        name: kb.name,
        collection: resolved.knowledgeCollection ?? kb.qdrantCollection,
      },
      scope,
      intent: "knowledge",
      responseLanguage,
      binding: {
        tenantId: orgId,
        agentId,
        kbId: kb.id,
        documentId: request.documentId ?? null,
        ragMode: runtime.ragMode,
      },
      latencyMs: Date.now() - t0,
    },
  };
}
