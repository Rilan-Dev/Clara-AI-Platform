import { scopedGraphKbId } from "./graph-scope";
import { getGraphStore } from "./graph-store";
import { buildReferenceGraphExtraction } from "./reference-graph-extractor";

/**
 * Explicitly opted-in graph enrichment for a document that already indexed
 * successfully in Qdrant. It never enables graph retrieval by itself.
 * A controlled backfill is required before switching an agent to hybrid.
 */
export async function indexDocumentGraph(args: {
  kbId: string; collection?: string; documentId: string; title: string; chunks: readonly string[];
}, options?: {enabled?: boolean}): Promise<{state:"disabled"|"indexed"; nodes:number; edges:number}> {
  const enabled = options?.enabled ?? process.env.ENABLE_GRAPH_INDEXING === "true";
  if (!enabled) return {state:"disabled",nodes:0,edges:0};
  if (process.env.GRAPH_STORE_PROVIDER !== "neo4j")
    throw Error("Graph indexing requires explicitly configured Neo4j storage");
  const graph = buildReferenceGraphExtraction({...args, kbId: args.collection ? scopedGraphKbId(args.kbId, args.collection) : args.kbId});
  await getGraphStore("neo4j").upsertExtraction(graph);
  return {state:"indexed", nodes:graph.nodes.length,edges:graph.edges.length};
}
