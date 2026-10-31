import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getGraphSnapshotStatus } from "@/modules/graph/core/graph-readiness";

/** Tenant-scoped graph status. Never exposes raw source text or infrastructure credentials. */
export async function getKbGraphIndexHandler(req:NextRequest,kbId:string):Promise<NextResponse>{
  try{
    await ensureMigrated();
    const auth=await requireAuth(req);
    await requireKbPermission(auth,kbId,"document:read");
    const kb=await getKnowledgeBaseById(kbId);
    if(!kb)return NextResponse.json({error:"Knowledge base not found"},{status:404});
    const snapshot=await getGraphSnapshotStatus(kbId,kb.qdrantCollection);
    const providerConfigured=process.env.GRAPH_STORE_PROVIDER==="neo4j";
    const autoIndexing=providerConfigured && process.env.ENABLE_GRAPH_INDEXING==="true";
    const policyEnabled=process.env.ENABLE_RAG_RETRIEVAL_POLICY==="true";
    const graphRetrievalEnabled=providerConfigured && process.env.ENABLE_GRAPH_RAG==="true" && policyEnabled;
    return NextResponse.json({
      collection:kb.qdrantCollection,
      graph:{status:snapshot.reason,verified:snapshot.ready},
      ingestion:{vectorEnabled:true,graphAutoIndexing:autoIndexing},
      retrieval:{graphRuntimeConfigured:graphRetrievalEnabled,
        customerSwitchingAvailable:false},
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof NextResponse)return err;
    console.error("[kb-graph-index] status failed",err);
    return NextResponse.json({error:"Unable to read graph index status."},{status:500,
      headers:{"Cache-Control":"private, no-store"}});
  }
}
