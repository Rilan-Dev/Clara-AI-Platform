/**
 * RAG search handler used by authenticated chat and the public embed flow.
 *
 * Task 3.1: the actual grounding logic lives in the provider-neutral service
 * `src/modules/rag/grounding.ts` (groundClaraContext). This handler is now a
 * thin HTTP adapter: parse → call the ONE grounding entry point → serialize.
 * Realtime voice providers (OpenAI/Gemini hooks, ElevenLabs webhook, Sarvam
 * turns) all ground through that same service, so the tenant/KB/document/
 * ragMode binding is identical regardless of the requesting provider.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDocumentById } from "@/modules/admin/core";
import { searchHybrid } from "@/modules/admin/core/hybrid-search";
import { groundClaraContext } from "@/modules/rag/grounding";
import { admissionDeniedResponse } from "@/lib/quota-admission";
import type { ProviderConfig } from "@/modules/ai-core/types";

type RagPayload = {
  kbId?: string;
  documentId?: string;
  query?: string;
  topK?: number;
  ragMode?: "classic" | "hybrid" | "agentic";
};

export async function postRagSearch(
  request: NextRequest,
  providerOverride?: ProviderConfig,
): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RagPayload;
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    if (body.kbId) {
      const outcome = await groundClaraContext({
        kbId: body.kbId,
        query: body.query ?? "",
        documentId: body.documentId,
        ragMode: body.ragMode,
        topK: body.topK,
        surface: "search",
        embeddingOverride: providerOverride,
      });

      if (!outcome.ok) {
        if (outcome.status === 402 && outcome.denied) {
          return admissionDeniedResponse(outcome.denied);
        }
        return NextResponse.json(
          { error: outcome.error, ...(outcome.detail ? { detail: outcome.detail } : {}) },
          { status: outcome.status },
        );
      }

      return NextResponse.json({
        context: outcome.result.context,
        sources: outcome.result.sources,
        graphSources: outcome.result.graphSources,
        mode: outcome.result.mode,
        kb: outcome.result.kb,
      });
    }

    if (body.documentId) {
      const documentRecord = await getDocumentById(body.documentId);
      if (!documentRecord) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      const results = await searchHybrid(documentRecord.collectionName, query, Math.min(Number(body.topK ?? 6), 20));
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
