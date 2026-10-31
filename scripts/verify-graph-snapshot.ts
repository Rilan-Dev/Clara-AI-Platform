/**
 * Operator-only, fail-closed Graph RAG snapshot verification.
 * Compare ALL authorized Qdrant source chunks with Neo4j fingerprint manifests
 * for one exact KB/collection. Never grants permission or publishes an agent.
 *
 * node --env-file=.env --env-file=.env.graph-pilot --import tsx scripts/verify-graph-snapshot.ts
 */
import { query, queryOne, pool } from "../src/lib/db";
import { scopedGraphKbId } from "../src/modules/graph/core/graph-scope";
import { GRAPH_EXTRACTOR_VERSION } from "../src/modules/graph/core/graph-readiness";
import { fingerprintSourceDocuments, assertGraphMatchesSource, type SourceChunk } from "../src/modules/graph/core/graph-verification";
import { Neo4jGraphStore, closeNeo4jDriver } from "../src/modules/graph/core/neo4j-store";

const kbId=process.env.GRAPH_PILOT_KB_ID?.trim()||"";
const collection=process.env.GRAPH_PILOT_COLLECTION?.trim()||"";
const qdrant=process.env.GRAPH_PILOT_QDRANT_URL?.trim()||"http://127.0.0.1:6333";
async function readVectorSource():Promise<SourceChunk[]> {
  const points:SourceChunk[]=[];
  let offset:string|number|null=null;
  do {
    const body={
      limit:256,...(offset==null?{}:{offset}),
      filter:{must:[{key:"kbId",match:{value:kbId}}]},
      with_payload:["kbId","documentId","chunkIndex","chunk"],with_vector:false,
    };
    const resp=await fetch(qdrant+"/collections/"+encodeURIComponent(collection)+"/points/scroll",{
      method:"POST",headers:{"content-type":"application/json",
        ...(process.env.QDRANT_API_KEY?{"api-key":process.env.QDRANT_API_KEY}:{})},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
    });
    if(!resp.ok)throw Error("Cannot verify Qdrant snapshot: HTTP "+resp.status);
    const data=await resp.json() as {result?:{points?:Array<{payload?:Record<string,unknown>}>;next_page_offset?:string|number|null}};
    if(!data.result?.points)throw Error("Invalid Qdrant snapshot response");
    for(const point of data.result.points){
      const p=point.payload??{};
      if(p.kbId!==kbId || typeof p.documentId!=="string" ||
        !Number.isSafeInteger(p.chunkIndex) || typeof p.chunk!=="string")
        throw Error("Source snapshot has incomplete or cross-KB provenance");
      points.push({documentId:p.documentId,chunkIndex:p.chunkIndex as number,text:p.chunk});
      if(points.length>4096)throw Error("Pilot verification limit exceeded");
    }
    offset=data.result.next_page_offset??null;
  }while(offset!=null);
  return points;
}

async function main() {
  if(!kbId || !collection || process.env.GRAPH_STORE_PROVIDER!=="neo4j" ||
     process.env.GRAPH_VERIFY_CONFIRM!=="VERIFY_EXACT_GRAPH_SNAPSHOT")
    throw Error("Explicit KB, collection, Neo4j and GRAPH_VERIFY_CONFIRM are required");
  if(!/^https?:\/\/(?:127\.0\.0\.1|localhost|qdrant)(?::\d+)?$/.test(qdrant))
    throw Error("Only local Qdrant is permitted");
  const owned=await queryOne<{id:string}>(`
    SELECT k.id FROM knowledge_bases k
    WHERE k.id=$1 AND
      (k.qdrant_collection=$2 OR EXISTS (
        SELECT 1 FROM agent_deployment_kb_snapshots snap
        WHERE snap.kb_id=k.id AND snap.collection_name=$2
      ))`,[kbId,collection]);
  if(!owned)throw Error("Collection does not belong to this knowledge base or a published snapshot");
  // Create an initial stale marker if this is the first backfill. Capture
  // the generation BEFORE scanning; a concurrently started upload bumps it.
  await query(`INSERT INTO rag_graph_snapshot_readiness
    (kb_id,collection_name,graph_scope_key,status,extractor_version,mutation_generation)
    VALUES ($1,$2,$3,'stale',$4,0)
    ON CONFLICT (kb_id,collection_name) DO NOTHING`,
    [kbId,collection,scopedGraphKbId(kbId,collection),GRAPH_EXTRACTOR_VERSION]);
  const marker=await queryOne<{generation:string}>(
    "SELECT mutation_generation::text AS generation FROM rag_graph_snapshot_readiness WHERE kb_id=$1 AND collection_name=$2",
    [kbId,collection]);
  if(!marker)throw Error("Graph readiness marker missing");
  const sourceChunks=await readVectorSource();
  const source=fingerprintSourceDocuments(sourceChunks);
  const graph=new Neo4jGraphStore();
  const persisted=await graph.listDocumentFingerprints(scopedGraphKbId(kbId,collection));
  assertGraphMatchesSource(source,persisted);
  const second=fingerprintSourceDocuments(await readVectorSource());
  assertGraphMatchesSource(source,second);
  // After proof, store an exact KB+collection readiness decision; no
  // retrieval setting, agent deployment or Qdrant point is modified.
  const written=await query(`
    UPDATE rag_graph_snapshot_readiness
    SET graph_scope_key=$3,status='verified',extractor_version=$4,
        source_chunks=$5,graph_documents=$6,verified_at=now(),updated_at=now()
    WHERE kb_id=$1 AND collection_name=$2 AND mutation_generation=$7::bigint
    RETURNING mutation_generation
  `,[kbId,collection,scopedGraphKbId(kbId,collection),GRAPH_EXTRACTOR_VERSION,
    sourceChunks.length,source.length,marker.generation]);
  if(written.length!==1)throw Error("Graph snapshot changed during verification; retry after ingestion");
  console.log(JSON.stringify({status:"verified",sourceDocuments:source.length,
    graphDocuments:persisted.length,collection,mode:"identifier_hierarchy_only",
    publishedAgentChanged:false}));
}
main().catch(e=>{console.error("GRAPH_SNAPSHOT_VERIFICATION_FAILED",e.message);process.exitCode=1})
  .finally(async()=>{await closeNeo4jDriver();await pool.end()});
