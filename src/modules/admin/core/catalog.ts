import { randomUUID } from "node:crypto";

import {
  ensureCollectionExists,
  getQdrantClient,
} from "./vector-store";

const CATALOG_COLLECTION =
  process.env.QDRANT_CATALOG_COLLECTION ?? "document_catalog";

type CatalogPayload = {
  title: string;
  collectionName: string;
  sourceType: "upload" | "web" | "cli-file" | "cli-web";
  sourceUrl?: string;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRecord = CatalogPayload & {
  id: string;
};

async function ensureCatalogCollection(): Promise<void> {
  await ensureCollectionExists(CATALOG_COLLECTION, {
    vectorSize: 1,
    distance: "Cosine",
  });
}

function toDocumentRecord(
  id: string | number,
  payload: Record<string, unknown> | null | undefined,
): DocumentRecord | null {
  if (!payload) return null;

  const title = payload.title;
  const collectionName = payload.collectionName;
  const sourceType = payload.sourceType;

  if (
    typeof title !== "string" ||
    typeof collectionName !== "string" ||
    typeof sourceType !== "string"
  ) {
    return null;
  }

  return {
    id: String(id),
    title,
    collectionName,
    sourceType: sourceType as DocumentRecord["sourceType"],
    sourceUrl:
      typeof payload.sourceUrl === "string" ? payload.sourceUrl : undefined,
    originalFilename:
      typeof payload.originalFilename === "string"
        ? payload.originalFilename
        : undefined,
    createdAt:
      typeof payload.createdAt === "string"
        ? payload.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof payload.updatedAt === "string"
        ? payload.updatedAt
        : new Date().toISOString(),
  };
}

export async function addDocumentRecord(
  record: Omit<DocumentRecord, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<DocumentRecord> {
  await ensureCatalogCollection();
  const client = getQdrantClient();
  const id = record.id ?? randomUUID();
  const now = new Date().toISOString();

  await client.upsert(CATALOG_COLLECTION, {
    wait: true,
    points: [
      {
        id,
        vector: [0],
        payload: {
          title: record.title,
          collectionName: record.collectionName,
          sourceType: record.sourceType,
          sourceUrl: record.sourceUrl,
          originalFilename: record.originalFilename,
          createdAt: now,
          updatedAt: now,
        } satisfies CatalogPayload,
      },
    ],
  });

  return {
    id,
    title: record.title,
    collectionName: record.collectionName,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    originalFilename: record.originalFilename,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  await ensureCatalogCollection();
  const client = getQdrantClient();

  const results: DocumentRecord[] = [];
  let nextPageOffset: string | undefined;

  do {
    const response = await client.scroll(CATALOG_COLLECTION, {
      with_payload: true,
      limit: 100,
      offset: nextPageOffset,
    });

    for (const point of response.points ?? []) {
      const record = toDocumentRecord(point.id, point.payload as Record<
        string,
        unknown
      >);
      if (record) {
        results.push(record);
      }
    }

    nextPageOffset = response.next_page_offset
      ? String(response.next_page_offset)
      : undefined;
  } while (nextPageOffset);

  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getDocumentById(
  id: string,
): Promise<DocumentRecord | undefined> {
  await ensureCatalogCollection();
  const client = getQdrantClient();

  const response = await client.retrieve(CATALOG_COLLECTION, {
    ids: [id],
    with_payload: true,
  });

  const point = response[0];
  if (!point) return undefined;

  const record = toDocumentRecord(point.id, point.payload as Record<
    string,
    unknown
  >);
  return record ?? undefined;
}
