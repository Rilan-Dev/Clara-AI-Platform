import { afterAll, describe, expect, it } from "vitest";
import { QdrantClient } from "@qdrant/js-client-rest";
import { randomUUID } from "node:crypto";

const integrationUrl = process.env.QDRANT_INTEGRATION_URL?.trim();
const integrationApiKey = process.env.QDRANT_INTEGRATION_API_KEY?.trim();
const integrationDescribe = integrationUrl ? describe : describe.skip;

integrationDescribe("email vector Qdrant tenant/account filter integration", () => {
  const client = integrationUrl
    ? new QdrantClient({
        url: integrationUrl,
        apiKey: integrationApiKey || undefined,
        checkCompatibility: false,
      })
    : null;
  const collection = `email_vectors_it_${randomUUID().replace(/-/g, "")}`;

  afterAll(async () => {
    if (!client) return;
    try {
      await client.deleteCollection(collection);
    } catch {
      // Cleanup is best-effort if collection creation itself failed.
    }
  });

  it("filters by both organization and the explicit account allowlist", async () => {
    if (!client) throw new Error("Qdrant integration client is not configured");
    await client.createCollection(collection, {
      vectors: { size: 3, distance: "Cosine" },
    });
    await client.upsert(collection, {
      wait: true,
      points: [
        {
          id: randomUUID(),
          vector: [1, 0, 0],
          payload: { orgId: "org-1", accountId: "account-a", messageId: "message-a" },
        },
        {
          id: randomUUID(),
          vector: [0.99, 0.01, 0],
          payload: { orgId: "org-1", accountId: "account-b", messageId: "message-b" },
        },
        {
          id: randomUUID(),
          vector: [0.98, 0.02, 0],
          payload: { orgId: "org-2", accountId: "account-a", messageId: "message-c" },
        },
      ],
    });

    const results = await client.search(collection, {
      vector: [1, 0, 0],
      limit: 10,
      with_payload: ["orgId", "accountId", "messageId"],
      filter: {
        must: [
          { key: "orgId", match: { value: "org-1" } },
          { key: "accountId", match: { any: ["account-a"] } },
        ],
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.payload).toMatchObject({
      orgId: "org-1",
      accountId: "account-a",
      messageId: "message-a",
    });

    await client.delete(collection, {
      wait: true,
      filter: {
        must: [
          { key: "orgId", match: { value: "org-1" } },
          { key: "accountId", match: { value: "account-a" } },
        ],
      },
    });
    const remaining = await client.count(collection, { exact: true });
    expect(remaining.count).toBe(2);
  });
});
