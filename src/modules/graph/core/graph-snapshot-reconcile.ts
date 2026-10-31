/**
 * Verify the exact Neo4j graph from the current Qdrant collection after an
 * opted-in KB upload, without changing any agent's published retrieval policy.
 * The mutation generation prevents a concurrent upload from being incorrectly
 * marked verified by a previous ingestion.
 */
import { query, queryOne } from "@/lib/db";
import { scopedGraphKbId } from "./graph-scope";
import { GRAPH_EXTRACTOR_VERSION } from "./graph-readiness";
import { fingerprintSourceDocuments, assertGraphMatchesSource, type SourceChunk } from "./graph-verification";
import { Neo4jGraphStore } from "./neo4j-store";

async function sourceFromQdrant(kbId:string,collection:string):Promise<SourceChunk[]>{
  const url=process.env.QDRANT_URL?.replace(/\/+$/,"");
  if(!url)throw Error("QDRANT_URL is required for graph reconciliation");
  const source:SourceChunk[]=[];
  let offset:string|number|null=null;
  do {
    const response=await fetch(url+"/collections/"+encodeURIComponent(collection)+"/points/scroll",{
      method:"POST",
      headers:{"content-type":"application/json",
        ...(process.env.QDRANT_API_KEY?{"api-key":process.env.QDRANT_API_KEY}:{})},
      body:JSON.stringify({
        limit:256,...(offset===null?{}:{offset}),
        filter:{must:[{key:"kbId",match:{value:kbId}}]},
        with_payload:["kbId","documentId","chunkIndex","chunk"],with_vector:false,
      }),
      signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)throw Error("Qdrant graph readiness scan failed: HTTP "+response.status);
    const body=await response.json() as {
      result?:{points?:Array<{payload?:Record<string,unknown>}>;next_page_offset?:string|number|null}
    };
    if(!body.result?.points)throw Error("Invalid Qdrant graph readiness scan");
    for(const pt of body.result.points){
      const p=pt.payload??{};
      if(p.kbId!==kbId||typeof p.documentId!=="string"||
        typeof p.chunk!=="string"||!Number.isSafeInteger(p.chunkIndex))
        throw Error("Graph readiness found invalid source chunk provenance");
      source.push({documentId:p.documentId,chunkIndex:p.chunkIndex as number,text:p.chunk});
      if(source.length>4096)throw Error("Graph auto-verification limit exceeded");
    }
    offset=body.result.next_page_offset??null;
  } while(offset!==null);
  return source;
}

export async function reconcileGraphSnapshotAfterIngest(kbId:string,collection:string):Promise<{
  verified:boolean;reason:"verified"|"source_changed";
  sourceChunks:number;graphDocuments:number;
}> {
  // This is deliberately not a global Graph RAG switch.
  if(!kbId||!collection||process.env.GRAPH_INDEXING_KB_ID!==kbId||
    process.env.ENABLE_GRAPH_INDEXING!=="true")
    throw Error("Graph auto-verification is not enabled for this exact knowledge base");
  const owned=await queryOne<{id:string}>(
    "SELECT id FROM knowledge_bases WHERE id=$1 AND qdrant_collection=$2 AND status='active'",
    [kbId,collection],
  );
  if(!owned)throw Error("Graph reconciliation KB and collection are not currently authorized");
  const marker=await queryOne<{generation:string}>(
    "SELECT mutation_generation::text AS generation FROM rag_graph_snapshot_readiness WHERE kb_id=$1 AND collection_name=$2",
    [kbId,collection],
  );
  if(!marker)throw Error("Missing graph mutation generation");
  const sourceChunks=await sourceFromQdrant(kbId,collection);
  const source=fingerprintSourceDocuments(sourceChunks);
  const graph=new Neo4jGraphStore();
  const manifests=await graph.listDocumentFingerprints(scopedGraphKbId(kbId,collection));
  assertGraphMatchesSource(source,manifests);
  // Double-read Qdrant to detect drift during graph verification.
  const second=fingerprintSourceDocuments(await sourceFromQdrant(kbId,collection));
  assertGraphMatchesSource(source,second);
  // Compare-and-swap: stale observations cannot certify later mutations.
  const written=await query<{mutation_generation:string}>(`
    UPDATE rag_graph_snapshot_readiness
    SET graph_scope_key=$3,status='verified',extractor_version=$4,
      source_chunks=$5,graph_documents=$6,verified_at=now(),updated_at=now()
    WHERE kb_id=$1 AND collection_name=$2 AND mutation_generation=$7::bigint
    RETURNING mutation_generation::text AS mutation_generation
  `,[kbId,collection,scopedGraphKbId(kbId,collection),GRAPH_EXTRACTOR_VERSION,
    sourceChunks.length,source.length,marker.generation]);
  return {verified:written.length===1,reason:written.length===1?"verified":"source_changed",
    sourceChunks:sourceChunks.length,graphDocuments:source.length};
}
