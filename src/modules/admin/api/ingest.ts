import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

import {
  chunkText,
  parseDocumentFromBuffer,
  loadWebPage,
  addDocumentRecord,
  generateCollectionName,
  ensureCollectionExists,
  upsertDocuments,
  type DocumentChunk,
} from "@/modules/admin/core";

export async function postIngest(request: NextRequest) {
  try {
    // The legacy catalog creates global, unowned Qdrant collections.
    // A token's presence is not authority to ingest arbitrary documents/URLs.
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);
    const formData = await request.formData();
    const titleEntry = formData.get("title");
    const urlEntry = formData.get("url");
    const title =
      typeof titleEntry === "string" && titleEntry.trim().length > 0
        ? titleEntry.trim()
        : undefined;
    const sourceUrl =
      typeof urlEntry === "string" && urlEntry.trim().length > 0
        ? urlEntry.trim()
        : undefined;

    const fileEntry = formData.get("file");
    const hasFile = fileEntry instanceof File && fileEntry.size > 0;
    const hasUrl = Boolean(sourceUrl);

    if (!hasFile && !hasUrl) {
      return NextResponse.json(
        { error: "Provide either a document file or a source URL to ingest." },
        { status: 400 },
      );
    }

    let chunks: DocumentChunk[] = [];
    let documentTitle = title ?? "Untitled";
    let originalFilename: string | undefined;

    if (hasFile) {
      const file = fileEntry as File;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      originalFilename = file.name;

      try {
        const document = await parseDocumentFromBuffer(buffer, originalFilename, file.type || undefined);
        const content = document.text.trim();

        if (!content) {
          return NextResponse.json(
            { error: `Unable to extract readable text from ${originalFilename}.` },
            { status: 422 },
          );
        }

        const segments = chunkText(content);
        if (segments.length === 0) {
          return NextResponse.json(
            { error: `Document ${originalFilename} produced no text chunks to ingest.` },
            { status: 422 },
          );
        }

        documentTitle = title ?? document.title ?? "Untitled";
        chunks = segments.map((segment, index) => ({
          text: segment,
          title: documentTitle,
          url: sourceUrl,
          metadata: {
            ...document.metadata,
            sourceType: "upload",
            originalFilename,
            mimeType: file.type || undefined,
            order: index,
            uploadedAt: new Date().toISOString(),
          },
        }));
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : "Unable to parse the uploaded document.";
        return NextResponse.json(
          {
            error: `Document processing failed for ${originalFilename}: ${message}`,
          },
          { status: 422 },
        );
      }
    }

    if (!hasFile && hasUrl && sourceUrl) {
      let webDocument;
      try {
        webDocument = await loadWebPage(sourceUrl);
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch the provided URL.",
          },
          { status: 422 },
        );
      }

      const content = webDocument.text.trim();
      if (!content) {
        return NextResponse.json(
          { error: "The provided URL contains no readable text content." },
          { status: 422 },
        );
      }

      const segments = chunkText(content);
      if (segments.length === 0) {
        return NextResponse.json(
          { error: "The provided URL produced no text chunks to ingest." },
          { status: 422 },
        );
      }

      documentTitle = title ?? webDocument.title ?? "Untitled";
      chunks = segments.map((segment, index) => ({
        text: segment,
        title: documentTitle,
        url: webDocument.url,
        metadata: {
          ...webDocument.metadata,
          sourceType: "web",
          order: index,
        },
      }));
    }

    const collectionName = generateCollectionName(documentTitle);
    await ensureCollectionExists(collectionName);
    await upsertDocuments(collectionName, chunks);

    const record = await addDocumentRecord({
      title: documentTitle,
      collectionName,
      sourceType: hasFile ? "upload" : "web",
      sourceUrl,
      originalFilename,
    });

    return NextResponse.json({
      message: `Ingested ${chunks.length} chunks into ${documentTitle}.`,
      chunks: chunks.length,
      document: record,
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Unexpected ingestion error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
