import { closeNeo4jDriver } from "../src/modules/graph/core/neo4j-store";
/** Operator-only read-only graph QA; prints metadata, never source paragraphs. */
import { getGraphStore } from "../src/modules/graph/core/graph-store";
async function main() {
  const kbId=process.env.GRAPH_PILOT_KB_ID;
  if (!kbId || process.env.GRAPH_STORE_PROVIDER!=="neo4j") throw Error("Explicit pilot scope and Neo4j mode required");
  const store=getGraphStore("neo4j");
  const probes=["DO.4.1","DO.4.2","DO.4.3"];
  const outcome=[];
  for(const code of probes){
    const hits=await store.search({kbId,query:code,topK:5});
    const target=hits.find(h=>h.label===code);
    outcome.push({code,found:!!target,sourceChunks:target?.supportingChunks.length??0,
      relations:target?.relations.filter(r=>r.type==="HAS_SUBCONTROL").length??0});
  }
  const stats=await store.getStats(kbId);
  console.log(JSON.stringify({probes:outcome,stats,sourceEvidencePresent:outcome.every(q=>q.found&&q.sourceChunks>0),
    vectorIndexModified:false}));
  if(outcome.some(q=>!q.found||!q.sourceChunks))process.exitCode=1;
}
main().catch(e=>{console.error("GRAPH_SMOKE_FAILED",e.message);process.exitCode=1}).finally(()=>closeNeo4jDriver());
