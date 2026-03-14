/**
 * src/modules/admin/core/vector-store-kb.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extended Qdrant upsert that writes kbId + documentId into every chunk payload.
 * This enables:
 *   1. Multi-document RAG search over a full collection (no filter needed)
 *   2. Per-document filtering: { must: [{ key:"documentId", match:{value:docId} }] }
 *   3. Source attribution in answers: payload.originalFilename, payload.title
 *   4. Clean deletion of a single document's chunks from Qdrant by documentId filter
 *
 * The existing upsertDocuments() in vector-store.ts remains unchanged so that
 * legacy code paths (admin ingest scripts) continue to work.
 */

import { randomUUID } from "node:crypto";
import { getQdrantClient, ensureCollectionExists } from "./vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";

// Re-use batch config from env
const EMBED_BATCH_SIZE = (() => {
  const v = Number(process.env.EMBED_BATCH_SIZE ?? "20");
  return Number.isFinite(v) && v > 0 ? v : 20;
})();

const EMBED_BATCH_DELAY_MS = (() => {
  const v = Number(process.env.EMBED_BATCH_DELAY ?? "300");
  return Number.isFinite(v) && v >= 0 ? v : 300;
})();

const EMBED_MAX_RETRIES = (() => {
  const v = Number(process.env.EMBED_MAX_RETRIES ?? "4");
  return Number.isFinite(v) && v >= 0 ? v : 4;
})();

const UPSERT_BATCH_SIZE = (() => {
  const v = Number(process.env.UPSERT_BATCH_SIZE ?? "200");
  return Number.isFinite(v) && v > 0 ? v : 200;
})();

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

/** Metadata injected into every Qdrant point for a KB-aware document */
export type KbChunkMeta = {
  kbId:             string;
  documentId:       string;
  title:            string;
  originalFilename: string;
};

// ── embed with retry ──────────────────────────────────────────────────────────

async function embedWithRetry(
  text: string,
  providerConfig: ProviderConfig,
  attempt = 0,
): Promise<number[]> {
  try {
    return await ProviderFactory.getProvider(providerConfig).embedText(text);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const status = typeof e?.status === "number" ? e.status
      : String(e?.message ?? "").includes("429") ? 429 : 0;
    if (status === 429 && attempt < EMBED_MAX_RETRIES) {
      const wait = Math.min(1_000 * 2 ** attempt, 30_000);
      console.warn(`[vs-kb] rate-limited, retrying in ${wait}ms (attempt ${attempt + 1})`);
      await sleep(wait);
      return embedWithRetry(text, providerConfig, attempt + 1);
    }
    throw err;
  }
}

async function embedBatches(
  texts: string[],
  providerConfig: ProviderConfig,
): Promise<number[][]> {
  const results: number[][] = [];
  const totalBatches = Math.ceil(texts.length / EMBED_BATCH_SIZE);
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
    console.log(`[vs-kb] embedding batch ${batchNum}/${totalBatches} (${batch.length} chunks)`);
    const embeddings = await Promise.all(
      batch.map((text) => embedWithRetry(text, providerConfig)),
    );
    results.push(...embeddings);
    if (i + EMBED_BATCH_SIZE < texts.length && EMBED_BATCH_DELAY_MS > 0) {
      await sleep(EMBED_BATCH_DELAY_MS);
    }
  }
  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Embed and upsert text chunks into a KB-scoped Qdrant collection.
 *
 * Every point in Qdrant will have payload:
 *   { kbId, documentId, title, originalFilename, chunk, chunkIndex, uploadedAt }
 *
 * This allows:
 *   • Full-collection search (all docs in this KB) — no filter
 *   • Single-document search — filter by documentId
 *   • Source citation — payload.title, payload.originalFilename
 */
export async function upsertDocumentsKb(
  collectionName: string,
  textChunks: string[],
  meta: KbChunkMeta
): Promise<void> {
  if (textChunks.length === 0) return;

  const client = getQdrantClient();
  const resolved = await resolveAIConfig({ kbId: meta.kbId, surface: "rag-embedding" });
  const providerConfig = toProviderConfig(resolved);
  const provider = ProviderFactory.getProvider(providerConfig);

  await ensureCollectionExists(collectionName, {
    vectorSize: provider.getEmbeddingDimension(),
  });

  const embeddings = await embedBatches(textChunks, providerConfig);
  const uploadedAt = new Date().toISOString();

  const points = textChunks.map((chunk, index) => ({
    id: randomUUID(),
    vector: embeddings[index]!,
    payload: {
      // KB & document attribution (Phase 2 additions)
      kbId:             meta.kbId,
      documentId:       meta.documentId,
      title:            meta.title,
      originalFilename: meta.originalFilename,
      // Chunk content
      chunk,
      chunkIndex: index,
      uploadedAt,
    },
  }));

  const totalBatches = Math.ceil(points.length / UPSERT_BATCH_SIZE);
  for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
    const batch   = points.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    console.log(`[vs-kb] upserting batch ${batchNum}/${totalBatches} (${batch.length} points) → "${collectionName}"`);
    try {
      await client.upsert(collectionName, { wait: true, points: batch });
    } catch (err: unknown) {
      const e = err as Error & { data?: unknown; status?: number };
      throw new Error(
        `[vs-kb] upsert batch ${batchNum} failed for "${collectionName}": ` +
        `${e.message} ${e.status ? `(HTTP ${e.status})` : ""} ${e.data ? `| ${JSON.stringify(e.data)}` : ""}`
      );
    }
  }

  console.log(`[vs-kb] ✅ upserted ${points.length} points into "${collectionName}"`);
}

// ── Per-chunk operations (for Chunk Viewer UI) ──────────────────────────────

export type KbChunk = {
  pointId:          string;
  chunkIndex:       number;
  chunk:            string;
  uploadedAt:       string;
  title:            string;
  originalFilename: string;
  documentId:       string;
};

/**
 * Scroll all chunks for a single document out of Qdrant (no vectors).
 * Returns chunks sorted by chunkIndex.
 */
export async function listDocumentChunks(
  collectionName: string,
  documentId: string
): Promise<KbChunk[]> {
  const client = getQdrantClient();
  const chunks: KbChunk[] = [];
  let offset: string | number | null | undefined = undefined;

  do {
    const result = await client.scroll(collectionName, {
      filter: { must: [{ key: "documentId", match: { value: documentId } }] },
      limit: 100,
      ...(offset !== undefined ? { offset } : {}),
      with_payload: true,
      with_vector: false,
    });

    for (const point of result.points) {
      const p = point.payload as Record<string, unknown>;
      chunks.push({
        pointId:          String(point.id),
        chunkIndex:       Number(p.chunkIndex ?? 0),
        chunk:            String(p.chunk ?? ""),
        uploadedAt:       String(p.uploadedAt ?? ""),
        title:            String(p.title ?? ""),
        originalFilename: String(p.originalFilename ?? ""),
        documentId:       String(p.documentId ?? documentId),
      });
    }

    offset = result.next_page_offset ?? null;
  } while (offset !== null && offset !== undefined);

  return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
}

/** Delete a single Qdrant point by its UUID point ID. */
export async function deleteChunk(
  collectionName: string,
  pointId: string
): Promise<void> {
  const client = getQdrantClient();
  await client.delete(collectionName, { wait: true, points: [pointId] });
}

/**
 * Re-embed updated text and upsert back with the same pointId.
 * Preserves chunkIndex and all other metadata.
 */
export async function updateChunk(
  collectionName: string,
  pointId: string,
  newText: string,
  chunkIndex: number,
  meta: KbChunkMeta
): Promise<void> {
  const resolved = await resolveAIConfig({ kbId: meta.kbId, surface: "rag-embedding" });
  const providerConfig = toProviderConfig(resolved);
  const embedding = await embedWithRetry(newText, providerConfig);

  const client = getQdrantClient();
  await client.upsert(collectionName, {
    wait: true,
    points: [{
      id:      pointId,
      vector:  embedding,
      payload: {
        kbId:             meta.kbId,
        documentId:       meta.documentId,
        title:            meta.title,
        originalFilename: meta.originalFilename,
        chunk:            newText,
        chunkIndex,
        uploadedAt:       new Date().toISOString(),
      },
    }],
  });
}

/**
 * Embed a new chunk text and insert it as a new Qdrant point.
 * Returns the generated pointId (UUID).
 */
export async function addChunk(
  collectionName: string,
  text: string,
  chunkIndex: number,
  meta: KbChunkMeta
): Promise<string> {
  const resolved = await resolveAIConfig({ kbId: meta.kbId, surface: "rag-embedding" });
  const providerConfig = toProviderConfig(resolved);
  const embedding = await embedWithRetry(text, providerConfig);

  const client = getQdrantClient();
  const pointId = randomUUID();

  await client.upsert(collectionName, {
    wait: true,
    points: [{
      id:      pointId,
      vector:  embedding,
      payload: {
        kbId:             meta.kbId,
        documentId:       meta.documentId,
        title:            meta.title,
        originalFilename: meta.originalFilename,
        chunk:            text,
        chunkIndex,
        uploadedAt:       new Date().toISOString(),
      },
    }],
  });

  return pointId;
}

/**
 * Delete all Qdrant points belonging to a specific document.
 * Called when a document is deleted from the DB.
 */
export async function deleteDocumentChunks(
  collectionName: string,
  documentId: string
): Promise<void> {
  const client = getQdrantClient();
  try {
    await client.delete(collectionName, {
      wait: true,
      filter: {
        must: [{ key: "documentId", match: { value: documentId } }],
      },
    });
    console.log(`[vs-kb] deleted chunks for documentId="${documentId}" from "${collectionName}"`);
  } catch (err) {
    console.warn(`[vs-kb] could not delete chunks for documentId=${documentId}:`, (err as Error).message);
  }
}
