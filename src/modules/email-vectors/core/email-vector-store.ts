import { createHash } from "node:crypto";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { embedBatches } from "@/modules/admin/core/vector-store-kb";
import { getQdrantClient, ensureCollectionExists } from "@/modules/admin/core/vector-store";
import { embedQueryCached } from "@/modules/rag/query-embedding-cache";

export type EmailVectorChunk = {
  text: string;
  chunkIndex: number;
  sourceId: string;
};

export type EmailVectorMetadata = {
  orgId: string;
  accountId: string;
  messageId: string;
  sourceId: string;
  receivedAt: string;
  sender?: string;
  subject?: string;
  labels?: string[];
};

export type EmailVectorHit = {
  pointId: string;
  score: number;
  text: string;
  orgId: string;
  accountId: string;
  messageId: string;
  sourceId: string;
  receivedAt: string;
  sender?: string;
  subject?: string;
  labels?: string[];
};

function stablePointId(orgId: string, accountId: string, messageId: string, chunkIndex: number): string {
  const bytes = createHash("sha256")
    .update([orgId, accountId, messageId, String(chunkIndex)].join("\\0"))
    .digest()
    .subarray(0, 16);
  // RFC 4122 UUID variant/version bits; Qdrant accepts UUID point IDs.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function embeddingContext(orgId: string): Promise<{ config: ProviderConfig; collection: string }> {
  const resolved = await resolveAIConfig({ orgId, surface: "chat" });
  const config = toProviderConfig(resolved, "embedding");
  const provider = ProviderFactory.getProvider(config);
  const dimension = provider.getEmbeddingDimension();
  const modelKey = createHash("sha256")
    .update([config.provider, config.embeddingModel ?? "", String(dimension)].join("\\0"))
    .digest("hex")
    .slice(0, 12);
  const providerKey = String(config.provider).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 16);
  const orgKey = createHash("sha256").update(orgId).digest("hex").slice(0, 16);
  const collection = `email_vectors_${orgKey}_${providerKey}_${modelKey}`;
  await ensureCollectionExists(collection, { vectorSize: dimension, distance: "Cosine" });
  return { config, collection };
}

async function collectionsForOrg(orgId: string): Promise<string[]> {
  const orgKey = createHash("sha256").update(orgId).digest("hex").slice(0, 16);
  const prefix = `email_vectors_${orgKey}_`;
  const result = await getQdrantClient().getCollections();
  return result.collections.map((item) => item.name).filter((name) => name.startsWith(prefix));
}

function tenantAccountFilter(orgId: string, accountIds: string[]) {
  return {
    must: [
      { key: "orgId", match: { value: orgId } },
      { key: "accountId", match: { any: accountIds } },
    ],
  };
}

export async function upsertEmailVectors(input: {
  metadata: EmailVectorMetadata;
  chunks: EmailVectorChunk[];
}): Promise<{ upserted: number; staleCleanupApplied: boolean }> {
  const { metadata, chunks } = input;
  const { config, collection } = await embeddingContext(metadata.orgId);
  const client = getQdrantClient();

  if (chunks.length === 0) {
    await deleteEmailMessageVectors(metadata.orgId, metadata.accountId, metadata.messageId);
    return { upserted: 0, staleCleanupApplied: true };
  }

  const vectors = await embedBatches(
    chunks.map((chunk) => chunk.text),
    config,
    { orgId: metadata.orgId, documentId: metadata.messageId },
  );
  const points = chunks.map((chunk, index) => ({
    id: stablePointId(metadata.orgId, metadata.accountId, metadata.messageId, chunk.chunkIndex),
    vector: vectors[index],
    payload: {
      ...metadata,
      sourceId: chunk.sourceId,
      chunkIndex: chunk.chunkIndex,
      chunk: chunk.text,
      indexedAt: new Date().toISOString(),
    },
  }));

  await client.upsert(collection, { wait: true, points });

  const indices = chunks.map((chunk) => chunk.chunkIndex);
  await client.delete(collection, {
    wait: true,
    filter: {
      must: [
        { key: "orgId", match: { value: metadata.orgId } },
        { key: "accountId", match: { value: metadata.accountId } },
        { key: "messageId", match: { value: metadata.messageId } },
      ],
      must_not: [{ key: "chunkIndex", match: { any: indices } }],
    },
  });

  // A provider/model change creates a separate collection. Once the new
  // representation is written, remove obsolete copies from prior model
  // collections so old content is not retained or returned after a rollback.
  const priorCollections = await collectionsForOrg(metadata.orgId);
  for (const priorCollection of priorCollections) {
    if (priorCollection === collection) continue;
    await client.delete(priorCollection, {
      wait: true,
      filter: {
        must: [
          { key: "orgId", match: { value: metadata.orgId } },
          { key: "accountId", match: { value: metadata.accountId } },
          { key: "messageId", match: { value: metadata.messageId } },
        ],
      },
    });
  }

  return { upserted: points.length, staleCleanupApplied: true };
}

export async function updateEmailVectorMetadata(input: {
  orgId: string;
  accountId: string;
  messageId: string;
  metadata: { sender?: string; subject?: string; labels?: string[]; receivedAt?: string; sourceId?: string };
}): Promise<void> {
  const client = getQdrantClient();
  const collections = await collectionsForOrg(input.orgId);
  for (const collection of collections) {
    await client.setPayload(collection, {
      wait: true,
      payload: input.metadata,
      filter: {
        must: [
          { key: "orgId", match: { value: input.orgId } },
          { key: "accountId", match: { value: input.accountId } },
          { key: "messageId", match: { value: input.messageId } },
        ],
      },
    });
  }
}

export async function deleteEmailMessageVectors(orgId: string, accountId: string, messageId: string): Promise<void> {
  const client = getQdrantClient();
  const collections = await collectionsForOrg(orgId);
  for (const collection of collections) {
    await client.delete(collection, {
      wait: true,
      filter: {
        must: [
          { key: "orgId", match: { value: orgId } },
          { key: "accountId", match: { value: accountId } },
          { key: "messageId", match: { value: messageId } },
        ],
      },
    });
  }
}

export async function purgeEmailAccountVectors(orgId: string, accountId: string): Promise<void> {
  const client = getQdrantClient();
  const collections = await collectionsForOrg(orgId);
  for (const collection of collections) {
    await client.delete(collection, {
      wait: true,
      filter: {
        must: [
          { key: "orgId", match: { value: orgId } },
          { key: "accountId", match: { value: accountId } },
        ],
      },
    });
  }
}

export async function purgeEmailOrgVectors(orgId: string): Promise<void> {
  const client = getQdrantClient();
  const collections = await collectionsForOrg(orgId);
  for (const collection of collections) {
    await client.delete(collection, {
      wait: true,
      filter: { must: [{ key: "orgId", match: { value: orgId } }] },
    });
  }
}

export async function searchEmailVectors(input: {
  orgId: string;
  allowedAccountIds: string[];
  query: string;
  limit: number;
}): Promise<EmailVectorHit[]> {
  const { config, collection } = await embeddingContext(input.orgId);
  const queryVector = await embedQueryCached(config, input.query);
  const results = await getQdrantClient().search(collection, {
    vector: queryVector,
    limit: input.limit,
    with_payload: ["orgId", "accountId", "messageId", "sourceId", "receivedAt", "sender", "subject", "labels", "chunk"],
    filter: tenantAccountFilter(input.orgId, input.allowedAccountIds),
  });
  return results.flatMap((hit) => {
    const payload = hit.payload as Record<string, unknown> | null | undefined;
    if (!payload || payload.orgId !== input.orgId || !input.allowedAccountIds.includes(String(payload.accountId))) return [];
    return [{
      pointId: String(hit.id),
      score: hit.score,
      text: typeof payload.chunk === "string" ? payload.chunk : "",
      orgId: String(payload.orgId),
      accountId: String(payload.accountId),
      messageId: String(payload.messageId),
      sourceId: String(payload.sourceId),
      receivedAt: String(payload.receivedAt),
      ...(typeof payload.sender === "string" ? { sender: payload.sender } : {}),
      ...(typeof payload.subject === "string" ? { subject: payload.subject } : {}),
      ...(Array.isArray(payload.labels) ? { labels: payload.labels.filter((v): v is string => typeof v === "string") } : {}),
    }];
  });
}
