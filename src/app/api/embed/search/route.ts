/**
 * POST /api/embed/search
 * Returns raw KB chunks only — no LLM. Used by voice hook and phone calls.
 * Demo requests use Platform Admin -> Demo provider for embeddings.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { isAuthorizedPhoneInternal } from "@/modules/phone/core/internal-auth";
import {
  validateEmbedRequest,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb, getKnowledgeBaseById, getKnowledgeBaseDocumentTitles } from "@/modules/knowledge-bases/core/db";
import {
  inferKnowledgeLanguage,
  needsRetrievalTranslation,
  translateQueryForRetrieval,
} from "@/modules/rag/cross-lingual";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { admitQueryEvent } from "@/lib/quota-admission";
import { query as dbQuery } from "@/lib/db";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import {
  noteEmbeddingRequestSucceeded,
  recordEmbeddingRuntimeFailure,
} from "@/modules/platform-health/core/incidents";
import { resolveSearchEmbedding } from "@/modules/knowledge-bases/core/embedding-index";
import { selfHealBrokenCollectionEmbedding } from "@/modules/knowledge-bases/core/embedding-selfheal";
import { scoreThresholdFor } from "@/modules/ai-core/multilingual-embeddings";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { netTraceRequest } from "@/lib/net-trace";

// function demoProviderConfig(settings: Awaited<ReturnType<typeof getPlatformEnvSettings>>): ProviderConfig | null {
//   const provider = setting(settings, "DEMO_AI_PROVIDER").toLowerCase() || process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() || "openai";

//   if (provider === "openai") {
//     const apiKey = setting(settings, "DEMO_OPENAI_API_KEY") || process.env.DEMO_OPENAI_API_KEY?.trim() || "";
//     if (!apiKey) return null;
//     const embeddingModel = setting(settings, "DEMO_OPENAI_EMBEDDING_MODEL") ||
//       process.env.DEMO_OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
//     return {
//       provider: "openai",
//       apiKey,
//       chatModel: setting(settings, "DEMO_OPENAI_CHAT_MODEL") || process.env.DEMO_OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
//       embeddingModel,
//       embeddingDimension: embeddingModel === "text-embedding-3-large" ? 3072 : 1536,
//     };
//   }

//   if (provider === "gemini") {
//     const apiKey = setting(settings, "DEMO_GEMINI_API_KEY") || process.env.DEMO_GEMINI_API_KEY?.trim() || "";
//     if (!apiKey) return null;
//     return {
//       provider: "gemini",
//       apiKey,
//       chatModel: setting(settings, "DEMO_GEMINI_CHAT_MODEL") || process.env.DEMO_GEMINI_CHAT_MODEL?.trim() || "gemini-3.6-flash",
//       embeddingModel: setting(settings, "DEMO_GEMINI_EMBEDDING_MODEL") || process.env.DEMO_GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
//       embeddingDimension: 3072,
//     };
//   }

//   return null;
// }

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let corsHeaders: Record<string, string> = {};
  // Network-tab-style trace (lib/net-trace.ts): summary rows gated by
  // NET_TRACE, failure capture ALWAYS on; responses echo x-request-id so the
  // docker/vercel log row maps 1:1 to the browser devtools Network row.
  const trace = netTraceRequest({
    route: "embed/search",
    url: "/api/embed/search",
    headers: req.headers,
  });
  try {
    await ensureMigrated();

    const requestedInternal = req.headers.has("x-phone-internal") || req.headers.has("x-kb-id");
    const internalKbId = req.headers.get("x-kb-id")?.trim() ?? "";

    // A caller-supplied phone flag is not authentication. A forged internal
    // request must never fall through to an unscoped KB search.
    if (requestedInternal && (!internalKbId || !isAuthorizedPhoneInternal(req.headers))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let kbId: string;
    let providerOverride: ProviderConfig | undefined;
    // let isDemo = false;

    if (requestedInternal) {
      kbId = internalKbId;
    } else {
      const validation = await validateEmbedRequest(req);
      if (!validation.ok) return validation.response;
      kbId = validation.ctx.kbId;
      corsHeaders = buildCorsHeaders(req.headers.get("origin"), validation.ctx.allowedOrigins, req.nextUrl.origin);
      // isDemo = (req.headers.get("authorization") ?? "").trim() === "Bearer DEMO_MODE";
    }

    const body = (await req.json()) as { query?: string; limit?: number };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400, headers: corsHeaders });
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 6), 1), 12);
    trace.setReqBody({ query, limit: body.limit });
    trace.field("kb", kbId);
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404, headers: corsHeaders });
    }

    // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ────────────
    // Voice turns and phone calls hit this endpoint — they count too.
    // Advisory-locked check-and-insert: search requests cannot race past the
    // limit, and the audit row exists before any retrieval spend.
    const t0 = Date.now();
    const orgRows = await dbQuery<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
      [kbId]
    );
    const orgId = orgRows[0]?.org_id ?? null;
    trace.field("org", orgId ?? undefined);
    const searchAdmission = await admitQueryEvent({
      orgId,
      kbId,
      queryText: query,
      surface: "voice",
    });
    if (!searchAdmission.admitted) {
      const denied = searchAdmission;
      return NextResponse.json(
        { error: "plan_limit_exceeded", code: "plan_limit_exceeded", message: denied.reason,
          limitKey: denied.limitKey, current: denied.current, limit: denied.limit },
        { status: 402, headers: corsHeaders }
      );
    }

    // if (isDemo) {
    //   const settings = await getPlatformEnvSettings();
    //   providerOverride = demoProviderConfig(settings) ?? undefined;
    //   if (!providerOverride) {
    //     return NextResponse.json(
    //       { error: "Demo AI provider is not configured. Configure the provider and API key in Platform Admin → Demo." },
    //       { status: 503, headers: corsHeaders },
    //     );
    //   }
    // }

    const [resolved, documentTitles, assistantConfig] = await Promise.all([
      providerOverride ? Promise.resolve(null) : resolveAIConfig({ kbId, surface: "chat" }),
      getKnowledgeBaseDocumentTitles(kbId).catch(() => [] as string[]),
      getAssistantConfigByKb(kbId).catch(() => null),
    ]);
    // Embedding work runs on the embedding backbone (V1 split — a Sarvam
    // brain keeps its Qdrant collections on OpenAI/Gemini embeddings).
    const baseConfig = providerOverride ?? toProviderConfig(resolved!, "embedding");
    // Query with the model that built the collection (multilingual or standard).
    const searchCollection = resolved?.knowledgeCollection ?? kb.qdrantCollection;
    const providerConfig = providerOverride ?? (await resolveSearchEmbedding(searchCollection, baseConfig, kbId));
    const multilingualIndex = providerConfig.provider === "tei";

    // Cross-lingual retrieval: a caller asking in Tamil/Hindi/… about an
    // English KB is also searched with a KB-language translation.
    const knowledgeLanguage = inferKnowledgeLanguage(
      documentTitles,
      assistantConfig?.defaultLanguage ?? resolved?.defaultLanguage,
    );
    const translatedQuery = !multilingualIndex && needsRetrievalTranslation({ query, kbLanguage: knowledgeLanguage })
      ? translateQueryForRetrieval({
          query,
          kbLanguage: knowledgeLanguage,
          translationMode: resolved?.translationMode,
          orgId,
          kbId,
          agentId: resolved?.agentId ?? null,
          providerConfig: baseConfig,
        }).then((t) => t.query)
      : null;

    let results;
    try {
      results = await searchKbEmbedded(searchCollection, query, limit, {
        providerConfig,
        translatedQuery,
        scoreThreshold: scoreThresholdFor(providerConfig.provider, providerConfig.embeddingModel, 0.25),
      });
    } catch (searchErr) {
      // Retrieval failed (e.g. embedding provider unreachable). Five duties:
      // 1. Finalise the already-admitted query event so the audit trail never
      //    keeps orphaned `pending` rows (mirrors the chat route's pattern).
      // 2. Record a runtime platform-health incident so the admin banner /
      //    email fires without anyone watching the container logs.
      // 3. Self-heal when the collection's registered embedding provider has
      //    a dead credential but the platform default points elsewhere —
      //    enqueue the re-index and tell the visitor migration is underway.
      // 4. Return a friendly message — raw provider/edge errors (which can
      //    reference regions, keys or upstream internals) must not leak to
      //    public embed visitors.
      // 5. Capture the raw cause Network-tab style (always on, lib/net-trace)
      //    so the docker/vercel log row carries the same detail the browser
      //    devtools Network row would show — without exposing it to visitors.
      const healed = await selfHealBrokenCollectionEmbedding({
        kbId,
        collectionName: searchCollection,
        providerConfig,
        error: searchErr,
      }).catch(() => null);
      const publicMessage =
        healed?.message ??
        "Knowledge-base search failed. Please verify the embedding configuration and try again.";
      trace.fail(healed?.cause ?? searchErr, {
        status: 502,
        resBody: { error: publicMessage },
      });
      void recordEmbeddingRuntimeFailure(healed?.cause ?? searchErr, { surface: "public embed search" });
      void finalizeQueryEvent(searchAdmission.admitted ? searchAdmission.eventId : null, {
        answerText: "",
        sourceCount: 0,
        latencyMs: Date.now() - t0,
        status: "error",
      });
      return NextResponse.json(
        { error: publicMessage },
        { status: 502, headers: { ...corsHeaders, "x-request-id": trace.id } },
      );
    }

    // Successful retrieval proves the embedding pipeline is alive — clear any
    // runtime-failing embedding incident (rate-limited no-op when healthy).
    void noteEmbeddingRequestSucceeded();

    // Voice / phone queries are part of the audit trail (no LLM answer is
    // generated here — the voice provider composes the spoken response).
    // WS-1.2: the row was atomically admitted before retrieval — finalise it.
    void finalizeQueryEvent(searchAdmission.admitted ? searchAdmission.eventId : null, {
      answerText: "",
      sourceCount: results.length,
      latencyMs: Date.now() - t0,
      status: "ok",
    });

    const context = results.map((r, i) => `[S${i + 1}] ${r.title}\n${r.snippet}`).join("\n\n");
    const sources = results.map((r, i) => ({
      index: i + 1,
      id: r.id,
      title: r.title,
      snippet: r.snippet.slice(0, 300),
      score: r.score,
      documentId: r.documentId,
    }));

    trace.end({ status: 200, resBody: { sources: sources.length } });
    return NextResponse.json({ context, sources, kbId }, { headers: { ...corsHeaders, "x-request-id": trace.id } });
  } catch (err) {
    // Unclassified error — same hygiene as the chat route: raw internals
    // only in the server log (always-on capture); visitors get a curated 500.
    const publicMessage =
      "Knowledge-base search failed. Please verify the embedding configuration and try again.";
    trace.fail(err, { status: 500, resBody: { error: publicMessage } });
    void recordEmbeddingRuntimeFailure(err, { surface: "public embed search" });
    return NextResponse.json(
      { error: publicMessage },
      { status: 500, headers: { ...corsHeaders, "x-request-id": trace.id } },
    );
  }
}
