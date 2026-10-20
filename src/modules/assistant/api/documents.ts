import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

import {
  getDocumentById,
  embedQuery,
  searchSimilarDocuments,
} from "@/modules/admin/core";

type OverviewRequestPayload = {
  documentId?: string;
  limit?: number;
};

export async function postDocumentOverview(request: NextRequest) {
  try {
    // Legacy document_catalog has no organization owner; only platform admins
    // may retrieve overviews until these sources are migrated into tenant KBs.
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);
    const body = (await request.json()) as OverviewRequestPayload;
    const documentId =
      typeof body.documentId === "string" ? body.documentId : undefined;
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(body.limit, 8)
        : 5;

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 },
      );
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const overviewQuery = [
      `Provide a concise overview of the document titled "${document.title}".`,
      "Focus on the most important facts, decisions, or takeaways.",
    ].join(" ");

    const embedding = await embedQuery(overviewQuery);
    const highlights = await searchSimilarDocuments(
      document.collectionName,
      embedding,
      limit,
    );

    const metadataLines: string[] = [
      `Title: ${document.title}`,
      `Collection: ${document.collectionName}`,
      `Source Type: ${document.sourceType}`,
    ];

    if (document.originalFilename) {
      metadataLines.push(`Filename: ${document.originalFilename}`);
    }
    if (document.sourceUrl) {
      metadataLines.push(`Source URL: ${document.sourceUrl}`);
    }
    metadataLines.push(
      `Created: ${new Date(document.createdAt).toLocaleString()}`,
    );
    metadataLines.push(
      `Last updated: ${new Date(document.updatedAt).toLocaleString()}`,
    );

    const bulletSummary = highlights
      .slice(0, 5)
      .map((hit) => `- ${hit.snippet.trim()}`)
      .join("\n");

    const generatedQuestions: string[] = [];
    generatedQuestions.push(`What are the key takeaways from "${document.title}"?`);
    for (const hit of highlights.slice(0, 4)) {
      const trimmed = hit.title.trim() || hit.snippet.slice(0, 80).trim();
      if (!trimmed) continue;
      const question = `Can you explain "${trimmed}" from the document?`;
      if (!generatedQuestions.includes(question)) {
        generatedQuestions.push(question);
      }
    }
    if (generatedQuestions.length < 3 && bulletSummary) {
      generatedQuestions.push(
        "Summarize the most important points from this document.",
      );
    }
    const limitedQuestions = generatedQuestions.slice(0, 4);

    const highlightBlock = highlights
      .map(
        (hit, index) =>
          `[H${index + 1}] ${hit.title}\n${hit.snippet.trim()}`,
      )
      .join("\n\n");

    const contextSections = [metadataLines.join("\n"), highlightBlock].filter(
      Boolean,
    );

    const context = contextSections.join("\n\n");

    const defaultVoiceIntro = [
      `You're speaking with Clara about "${document.title}".`,
      "Ask a question and I'll cite this document.",
    ].join("\n");

    return NextResponse.json({
      summary: bulletSummary,
      highlights,
      context,
      suggestedQuestions: limitedQuestions,
      voiceIntro: defaultVoiceIntro,
      metadata: {
        title: document.title,
        collectionName: document.collectionName,
        sourceType: document.sourceType,
        sourceUrl: document.sourceUrl,
        originalFilename: document.originalFilename,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const message =
      error instanceof Error ? error.message : "Failed to generate overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
