/**
 * Read-only three-mode RAG smoke on one verified KB snapshot.
 * Vector: real Qdrant nearest-neighbor search using an existing source
 * chunk's indexed embedding (query-by-example, NOT a generated text embedding).
 * Graph: actual Neo4j query over the same KB+collection.
 * Hybrid: independently retrieve both and merge source-evidence identifiers.
 * Does NOT change agent policies or global runtime flags.
 */
import { retrieveGraphContext } from "../src/modules/graph/core/graph-retriever";
import { getGraphSnapshotStatus } from "../src/modules/graph/core/graph-readiness";
import { pool } from "../src/lib/db";
import { closeNeo4jDriver } from "../src/modules/graph/core/neo4j-store";

type Point={id:string;score?:number;payload?:{kbId?:string;documentId?:string;chunkIndex?:number;chunk?:string;title?:string}};
const kbId=process.env.GRAPH_PILOT_KB_ID||"";
const collection=process.env.GRAPH_PILOT_COLLECTION||"";
const base=(process.env.GRAPH_PILOT_QDRANT_URL||"http://qdrant:6333")+"/collections/"+encodeURIComponent(collection);
const headers={"Content-Type":"application/json",...(process.env.QDRANT_API_KEY?{"api-key":process.env.QDRANT_API_KEY}:{})};
async function call<T>(url:string,data:unknown):Promise<T>{
  const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(data),signal:AbortSignal.timeout(14000)});
  if(!r.ok)throw Error("Qdrant query failed: HTTP "+r.status);
  return await r.json() as T;
}
async function all():Promise<Point[]>{
  const points:Point[]=[];let offset:string|number|null=null;
  do {
    const r=await call<{result:{points:Point[];next_page_offset?:string|number|null}}>(base+"/points/scroll",{
      limit:256,...(offset===null?{}:{offset}),filter:{must:[{key:"kbId",match:{value:kbId}}]},
      with_payload:["kbId","documentId","chunkIndex","chunk","title"],with_vector:false,
    });
    points.push(...r.result.points);
    if(points.length>4096)throw Error("Pilot sample limit exceeded");
    offset=r.result.next_page_offset??null;
  }while(offset!==null);
  return points;
}
function key(d:string|undefined,n:number|undefined){return d!=null && Number.isSafeInteger(n)?d+":"+n:null;}
async function main(){
  if(!kbId || !collection || process.env.GRAPH_STORE_PROVIDER!=="neo4j")
    throw Error("Exact pilot KB+collection and Neo4j backend required");
  const ready=await getGraphSnapshotStatus(kbId,collection);
  if(!ready.ready)throw Error("Graph snapshot not ready: "+ready.reason);
  const points=await all();
  const codes=["DO.4.1","DO.4.2","DO.4.3"];
  const cases=[];
  for(const code of codes){
    const seed=points.find(p=>p.payload?.chunk?.includes(code) && p.payload?.title==="Data Standards Document")
      ??points.find(p=>p.payload?.chunk?.includes(code));
    if(!seed)throw Error("No Qdrant vector seed for "+code);
    const started=Date.now();
    const [vector,graph]=await Promise.all([
      call<{result:{points:Point[]}}>(base+"/points/query",{
        query:seed.id,limit:8,
        filter:{must:[{key:"kbId",match:{value:kbId}}]},
        with_payload:["kbId","documentId","chunkIndex","title"],with_vector:false,
      }).then(r=>r.result.points),
      retrieveGraphContext({kbId,collection,query:code,topK:4}),
    ]);
    if(vector.some(v=>v.payload?.kbId!==kbId))throw Error("Cross-KB vector match");
    if(!graph.length || graph.every(g=>!g.supportingChunks.length))
      throw Error("Graph source evidence missing for "+code);
    const vectorIds=vector.map(v=>key(v.payload?.documentId,v.payload?.chunkIndex)).filter(Boolean);
    const graphIds=graph.flatMap(g=>g.supportingChunks.map(c=>key(c.documentId,Number(c.chunkId)))).filter(Boolean);
    const fused=[...new Set([...vectorIds,...graphIds])];
    if(vectorIds.length<1 || graphIds.length<1 || fused.length<1)throw Error("One of three modes lacks evidence");
    cases.push({
      query:code,vector:{hits:vector.length,topScore:Math.round((vector[0]?.score??0)*10000)/10000,
        topDoc:vector[0]?.payload?.title,sourceChunks:vectorIds.length},
      graph:{hits:graph.length,sourceChunks:graphIds.length,relations:graph.reduce((sum,g)=>sum+g.relations.length,0),
        matchedCode:graph.some(g=>g.label===code)},
      hybrid:{distinctSourceChunks:fused.length,vectorEvidence:vectorIds.length,graphEvidence:graphIds.length,
        sharedEvidence:vectorIds.filter(id=>graphIds.includes(id)).length},
      retrievalMs:Date.now()-started,
    });
  }
  console.log(JSON.stringify({result:"three_mode_pilot_retrieval_pass",queryType:"stored_vector_query_by_example",
    snapshot:ready.reason,documents:new Set(points.map(p=>p.payload?.documentId)).size,points:points.length,
    modes:["vector","graph","hybrid"],cases,publishedAgentChanged:false,vectorIndexModified:false}));
}
main().catch(err=>{console.error("RAG_MODE_TEST_FAILED",err.message);process.exitCode=1})
  .finally(async()=>{await closeNeo4jDriver();await pool.end()});
