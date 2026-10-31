import { closeNeo4jDriver } from "../src/modules/graph/core/neo4j-store";
/**
 * Operator-only backfill for one explicitly approved KB. Does not modify Qdrant
 * or switch any published agent's retrieval policy. Run using tsx on a trusted
 * server, never expose this command as a public API.
 */
import { buildReferenceGraphExtraction } from "../src/modules/graph/core/reference-graph-extractor";
import { getGraphStore } from "../src/modules/graph/core/graph-store";
import { scopedGraphKbId } from "../src/modules/graph/core/graph-scope";

type Point = {id:string; payload?:Record<string,unknown>};
async function main() {
  const kbId=process.env.GRAPH_PILOT_KB_ID?.trim();
  const collection=process.env.GRAPH_PILOT_COLLECTION?.trim();
  const qdrant=process.env.GRAPH_PILOT_QDRANT_URL?.trim() || "http://127.0.0.1:6333";
  if (!kbId || !collection || process.env.GRAPH_STORE_PROVIDER!=="neo4j" ||
      process.env.GRAPH_PILOT_CONFIRM!=="READ_ONLY_VECTOR_BACKFILL")
    throw Error("Set GRAPH_PILOT_KB_ID, GRAPH_PILOT_COLLECTION, GRAPH_STORE_PROVIDER=neo4j and explicit confirmation");
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost|qdrant)(?::\d+)?$/.test(qdrant))
    throw Error("Pilot accepts local Qdrant only");
  const points:Point[]=[];
  let offset:string|number|null=null;
  do {
    const payload={
      limit:256,
      ...(offset == null ? {} : {offset}),
      filter:{must:[{key:"kbId",match:{value:kbId}}]},
      with_payload:["kbId","documentId","chunkIndex","chunk","title"], with_vector:false,
    };
    const response=await fetch(qdrant+"/collections/"+encodeURIComponent(collection)+"/points/scroll",{
      method:"POST",
      headers:{"content-type":"application/json",...(process.env.QDRANT_API_KEY?{"api-key":process.env.QDRANT_API_KEY}:{})},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
    });
    if(!response.ok) throw Error("Authorized Qdrant scan failed: HTTP "+response.status);
    const result=(await response.json()) as {result?:{points?:Point[];next_page_offset?:string|number|null}};
    if(!result.result?.points) throw Error("Malformed Qdrant scroll response");
    points.push(...result.result.points);
    if(points.length>2048) throw Error("Pilot KB exceeds 2048-point safe scan ceiling");
    offset=result.result.next_page_offset??null;
  }while(offset!=null);
  const documents=new Map<string,Array<{chunk:string;index:number;title:string}>>();
  for(const point of points) {
    const p=point.payload??{};
    if(p.kbId!==kbId || typeof p.documentId!=="string" || typeof p.chunk!=="string" ||
      !Number.isSafeInteger(p.chunkIndex)) continue;
    const rows=documents.get(p.documentId)??[];
    rows.push({chunk:p.chunk,index:p.chunkIndex as number,title:typeof p.title==="string"?p.title:"Document"});
    documents.set(p.documentId,rows);
  }
  if(points.length===0 || documents.size===0) throw Error("No scoped, indexed pilot documents found");
  const store=getGraphStore("neo4j");
  const graphKbId=scopedGraphKbId(kbId,collection);
  let nodes=0,edges=0;
  for(const [documentId,rows] of documents) {
    rows.sort((a,b)=>a.index-b.index);
    const extraction=buildReferenceGraphExtraction({kbId:graphKbId,documentId,
      title:rows[0]!.title,chunks:rows.map(r=>r.chunk)});
    await store.upsertExtraction(extraction);
    nodes+=extraction.nodes.length;edges+=extraction.edges.length;
  }
  const stats=await store.getStats(graphKbId);
  console.log(JSON.stringify({result:"pilot_graph_backfill_completed",scannedPoints:points.length,
    scannedDocuments:documents.size,extractedNodes:nodes,extractedEdges:edges,
    storedStats:stats,mode:"identifier_hierarchy_only",publishedAgentChanged:false}));
}
main().catch(error=>{console.error("PILOT_BACKFILL_FAILED",error.message);process.exitCode=1}).finally(()=>closeNeo4jDriver());
