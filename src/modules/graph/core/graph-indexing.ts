import { scopedGraphKbId } from "./graph-scope";
import { getGraphStore } from "./graph-store";
import { buildReferenceGraphExtraction } from "./reference-graph-extractor";

/**
 * A KB-specific opt-in can enrich one production pilot without changing the
 * globally selected retrieval provider. GRAPH_STORE_PROVIDER=memory can
 * therefore remain in force for all agents while this KB writes to Neo4j.
 *
 * Exact KB matching is mandatory when GRAPH_INDEXING_KB_ID is configured.
 * A legacy global opt-in is still supported only with explicit Neo4j mode.
 */
export function graphIndexingEnabledForKb(kbId: string): boolean {
  if (!kbId || process.env.ENABLE_GRAPH_INDEXING !== "true") return false;
  const scopedKb = process.env.GRAPH_INDEXING_KB_ID?.trim();
  if (scopedKb) return scopedKb === kbId;
  return process.env.GRAPH_STORE_PROVIDER === "neo4j";
}

/** Clean graph provenance even if auto-ingestion was later switched off. */
export function graphStorageConfiguredForKb(kbId: string): boolean {
  const scopedKb = process.env.GRAPH_INDEXING_KB_ID?.trim();
  return process.env.GRAPH_STORE_PROVIDER === "neo4j" || Boolean(kbId && scopedKb && kbId === scopedKb);
}

/**
 * Explicitly opted-in graph enrichment for a document that already indexed
 * successfully in Qdrant. It never enables graph retrieval by itself.
 * A controlled backfill is required before switching an agent to hybrid.
 */
export async function indexDocumentGraph(args: {
  kbId: string; collection?: string; documentId: string; title: string; chunks: readonly string[];
}, options?: {enabled?: boolean}): Promise<{state:"disabled"|"indexed"; nodes:number; edges:number}> {
  const enabled = options?.enabled ?? graphIndexingEnabledForKb(args.kbId);
  if (!enabled) return {state:"disabled",nodes:0,edges:0};
  // Explicit one-KB ingestion does not implicitly activate graph retrieval
  // for the rest of the platform.
  if (!graphStorageConfiguredForKb(args.kbId))
    throw Error("Graph indexing requires explicitly configured Neo4j storage");
  const graph = buildReferenceGraphExtraction({...args, kbId: args.collection ? scopedGraphKbId(args.kbId, args.collection) : args.kbId});
  await getGraphStore("neo4j").upsertExtraction(graph);
  return {state:"indexed", nodes:graph.nodes.length,edges:graph.edges.length};
}
