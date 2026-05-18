/**
 * src/modules/assistant/api/rag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RAG search handler — Phase 2 update.
 *
 * Accepts two search modes:
 *
 *   Mode A — KB-aware (Phase 2, preferred):
 *     { kbId: string, query: string, documentId?: string }
 *     Searches the full Qdrant collection for the KB (all documents).
 *     Optionally filters to a single document if documentId is supplied.
 *     Returns context with multi-document source attribution [S1], [S2], etc.
 *
 *   Mode B — Legacy (backward compatible):
 *     { documentId: string, query: string }
 *     Looks up the document's Qdrant collection from the old catalog and
 *     searches it. Works exactly as before for existing integrations.
 *
 * All voice hook calls should migrate to Mode A by passing kbId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getDocumentById } from "@/modules/admin/core";
import { searchHybrid } from "@/modules/admin/core/hybrid-search";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { logQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { getRagRuntimeConfig } from "@/modules/rag/config";
import { retrieveGraphContext } from "@/modules/graph/core/graph-retriever";

const SCORE_THRESHOLD = 0.25;
const DEFAULT_TOP_K   = 6;  // more results for multi-doc search

type RagPayload = {
  kbId?: string;
  documentId?: string;
  query?: string;
  topK?: number;
  ragMode?: "classic" | "hybrid" | "agentic";
};

export async function postRagSearch(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RagPayload;
    const query = (body.query ?? "").trim();
    const topK = Math.min(Number(body.topK ?? DEFAULT_TOP_K), 20);

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    // ── Mode A: KB-aware multi-document search ────────────────────────────────
    if (body.kbId) {
      const t0 = Date.now();
      const kb = await getKnowledgeBaseById(body.kbId);
      if (!kb) {
        return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      }
      if (kb.status !== "active") {
        return NextResponse.json({ error: "Knowledge base is archived" }, { status: 400 });
      }

      const resolved = await resolveAIConfig({ kbId: kb.id, surface: "rag-embedding" });
      const providerConfig = toProviderConfig(resolved);
      const runtime = getRagRuntimeConfig({ requestedMode: body.ragMode });

      // Build Qdrant filter: optionally scope to a single document
      const filter = body.documentId
        ? { must: [{ key: "documentId", match: { value: body.documentId } }] }
        : undefined;

      let vectorResults;
      try {
        vectorResults = await searchKbCollection(
          kb.qdrantCollection,
          query,
          topK,
          filter,
          providerConfig,
        );
      } catch (searchErr) {
        const msg = (searchErr as Error).message;
        if (msg.includes("does not exist")) {
          return NextResponse.json(
            {
              error: "This knowledge base has no indexed content yet. Please upload documents and wait for them to finish processing.",
              detail: msg,
            },
            { status: 503 },
          );
        }
        throw searchErr;
      }

      const graphHits = runtime.enableGraphRag
        ? await retrieveGraphContext({
            kbId: kb.id,
            query,
            topK: Math.min(topK, 4),
            documentId: body.documentId,
          })
        : [];

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
            .join("\n");
        })
        .join("\n\n");

      void logQueryEvent({
        kbId: kb.id,
        queryText: query,
        sourceCount: vectorResults.length + graphHits.length,
        latencyMs: Date.now() - t0,
      });

      const contextParts = [
        vectorResults
          .map((r, i) => {
            const title = r.payload?.title ? String(r.payload.title) : "Document";
            const filename = r.payload?.originalFilename ? String(r.payload.originalFilename) : "";
            const label = filename && filename !== title ? `${title} (${filename})` : title;
            return `[S${i + 1}] ${label}\n${r.snippet}`.trim();
          })
          .join("\n\n"),
      ];

      if (graphContext) {
        contextParts.push(`Graph context\n${graphContext}`);
      }

      const context = contextParts.filter(Boolean).join("\n\n");

      const sources = vectorResults.map((r, i) => ({
        index: i + 1,
        id: r.id,
        title: r.payload?.title ? String(r.payload.title) : "Document",
        originalFilename: r.payload?.originalFilename ? String(r.payload.originalFilename) : undefined,
        documentId: r.payload?.documentId ? String(r.payload.documentId) : undefined,
        score: r.score,
        snippet: r.snippet,
        sourceType: "vector",
      }));

      const graphSources = graphHits.map((hit, index) => ({
        index: index + 1,
        id: hit.id,
        title: hit.label,
        score: hit.score,
        snippet: hit.supportingChunks.map((chunk) => chunk.text).filter(Boolean).join("\n").slice(0, 500),
        sourceType: "graph",
        relations: hit.relations,
      }));

      return NextResponse.json({
        context,
        sources,
        graphSources,
        mode: runtime.ragMode,
        kb: { id: kb.id, name: kb.name, collection: kb.qdrantCollection },
      });
    }

    // ── Mode B: Legacy document-scoped search (backward compatible) ───────────
    if (body.documentId) {
      const documentRecord = await getDocumentById(body.documentId);
      if (!documentRecord) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      const results = await searchHybrid(documentRecord.collectionName, query, topK);
      const context = results
        .map((doc, i) => `[S${i + 1}] ${doc.title}\n${doc.snippet}`.trim())
        .join("\n\n");

      return NextResponse.json({
        context,
        sources: results,
        document: { id: documentRecord.id, title: documentRecord.title },
      });
    }

    return NextResponse.json(
      { error: "Provide either kbId (recommended) or documentId (legacy)" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[rag] postRagSearch:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
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

  const searchParams: Record<string, unknown> = {
    vector: embedding,
    limit: topK,
    with_payload: true,
    score_threshold: SCORE_THRESHOLD,
    ...(filter ? { filter } : {}),
  };

  let results;
  try {
    results = await client.search(collectionName, searchParams as Parameters<typeof client.search>[1]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      throw new Error(
        `Qdrant collection "${collectionName}" does not exist. Documents may still be processing — check the ingest worker status at /api/worker/ingest or re-upload your documents.`,
      );
    }
    throw err;
  }

  if (!Array.isArray(results) || results.length === 0) {
    const fallbackParams = { ...searchParams };
    delete fallbackParams.score_threshold;
    results = await client.search(collectionName, fallbackParams as Parameters<typeof client.search>[1]);
  }

  return (results as Array<{ id: string | number; score?: number; payload?: Record<string, unknown> }>)
    .map((r) => ({
      id: String(r.id),
      snippet: r.payload?.chunk ? String(r.payload.chunk) : "",
      score: r.score ?? 0,
      payload: r.payload as Record<string, unknown>,
    }))
    .sort((a, b) => b.score - a.score);
}
