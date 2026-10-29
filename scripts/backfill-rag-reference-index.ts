#!/usr/bin/env npx tsx
/**
 * One-time maintenance for existing working-KB Qdrant points.
 *
 * No re-embedding and no changes to published immutable snapshots. Dry-run by
 * default. --apply is required to update payloads. Never accepts collection
 * names from the operator: source is derived from the requested KB in the DB.
 *
 * npx tsx scripts/backfill-rag-reference-index.ts --kb-id UUID
 * npx tsx scripts/backfill-rag-reference-index.ts --kb-id UUID --apply
 */
import { loadEnvConfig } from "@next/env";
import { getKnowledgeBaseById } from "../src/modules/knowledge-bases/core/db";
import { getActiveReindexJob } from "../src/modules/knowledge-bases/core/embedding-index";
import { getQdrantClient } from "../src/modules/admin/core/vector-store";
import { ensureReferencePayloadIndexes } from "../src/modules/admin/core/vector-store-kb";
import { extractStructuredReferences } from "../src/modules/rag/reference-evidence";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const idAt = args.indexOf("--kb-id");
  const kbId = idAt >= 0 ? args[idAt + 1] : undefined;
  const apply = args.includes("--apply");
  if (!kbId || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(kbId)
    || args.some((arg, i) => arg !== "--kb-id" && (i !== idAt + 1) && arg !== "--apply")) {
    throw new Error("Usage: npx tsx scripts/backfill-rag-reference-index.ts --kb-id UUID [--apply]");
  }
  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) throw new Error("Knowledge base does not exist");
  if (await getActiveReindexJob(kbId)) {
    throw new Error("KB reindex is active; finish or cancel it before backfilling reference payloads.");
  }
  const collection = kb.qdrantCollection;
  if (!collection || collection.startsWith("pub_")) {
    throw new Error("Refusing to mutate missing or published snapshot collection");
  }
  const client = getQdrantClient();
  if (apply) await ensureReferencePayloadIndexes(collection);

  // Fail closed if the live collection contains any foreign or unlabelled
  // points. The script must never update another KB's metadata.
  const [total, owned] = await Promise.all([
    client.count(collection, { exact: true }),
    client.count(collection, {
      exact: true,
      filter: { must: [{ key: "kbId", match: { value: kbId } }] },
    }),
  ]);
  if (total.count !== owned.count) throw new Error(
    "Collection ownership check failed: foreign or unlabelled Qdrant points found.",
  );

  let offset: string | number | undefined;
  let scanned = 0;
  let backfilled = 0;
  let references = 0;
  do {
    const page = await client.scroll(collection, {
      ...(offset == null ? {} : { offset }),
      limit: 128,
      filter: { must: [{ key: "kbId", match: { value: kbId } }] },
      with_payload: ["chunk", "kbId", "referenceIndexed"],
      with_vector: false,
    });
    const batches = new Map<string, { references: string[]; ids: Array<string | number> }>();
    for (const point of page.points) {
      scanned++;
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      if (payload.kbId !== kbId) throw new Error("Unexpected foreign point in KB scan");
      if (payload.referenceIndexed === true) continue;
      if (typeof payload.chunk !== "string") throw new Error("Missing text: cannot index reference identifiers safely");
      const ids = extractStructuredReferences(payload.chunk);
      references += ids.length;
      const key = JSON.stringify(ids);
      const batch = batches.get(key) ?? { references: ids, ids: [] };
      batch.ids.push(point.id);
      batches.set(key, batch);
      backfilled++;
    }
    if (apply) {
      // Set only these two payload fields, preserving existing metadata and
      // vectors. Group identical identifier sets to minimize Qdrant writes.
      for (const batch of batches.values()) {
        await client.setPayload(collection, {
          wait: true,
          points: batch.ids,
          payload: { referenceIds: batch.references, referenceIndexed: true },
        });
      }
    }
    const next = page.next_page_offset;
    offset = typeof next === "string" || typeof next === "number" ? next : undefined;
  } while (offset != null);

  // Keep output non-sensitive: never print chunk text or credentials.
  console.log(JSON.stringify({
    kbId, collection, mode: apply ? "applied" : "dry-run",
    scanned, pointsNeedingBackfill: backfilled, clauseIdentifiersDetected: references,
  }, null, 2));
  if (!apply && backfilled) console.log("No writes performed. Re-run with --apply to index existing points.");
}

main().catch((error: unknown) => {
  console.error("[rag-reference-index] " + (error as Error).message);
  process.exitCode = 1;
});
