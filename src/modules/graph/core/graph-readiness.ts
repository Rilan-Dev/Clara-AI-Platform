import { query, queryOne } from "@/lib/db";
import { scopedGraphKbId } from "./graph-scope";

/** Only this schema is supported by the bounded source-identifier pilot. */
export const GRAPH_EXTRACTOR_VERSION = "identifier-hierarchy-v1";

export type GraphSnapshotStatus = {
  ready:boolean;
  reason:"verified"|"not_indexed"|"index_stale"|"snapshot_mismatch"|"schema_mismatch";
  collection:string;
};

export function validateGraphReadiness(row: {
  status:string; graph_scope_key:string; extractor_version:string;
  verified_at:string|null; source_chunks:number; graph_documents:number;
}|null,kbId:string,collection:string):GraphSnapshotStatus{
  const base={collection};
  if(!row)return {...base,ready:false,reason:"not_indexed"};
  if(row.graph_scope_key!==scopedGraphKbId(kbId,collection))
    return {...base,ready:false,reason:"snapshot_mismatch"};
  if(row.extractor_version!==GRAPH_EXTRACTOR_VERSION)
    return {...base,ready:false,reason:"schema_mismatch"};
  if(row.status!=="verified"||!row.verified_at||row.source_chunks<1||row.graph_documents<1)
    return {...base,ready:false,reason:"index_stale"};
  return {...base,ready:true,reason:"verified"};
}

/** Readiness is exact to the authorized KB and collection. */
export async function getGraphSnapshotStatus(kbId:string,collection:string):Promise<GraphSnapshotStatus>{
  if(!kbId||!collection)return {collection,ready:false,reason:"not_indexed"};
  const row=await queryOne<{
    status:string;graph_scope_key:string;extractor_version:string;
    verified_at:string|null;source_chunks:number;graph_documents:number;
  }>(
    "SELECT status,graph_scope_key,extractor_version,verified_at,source_chunks,graph_documents FROM rag_graph_snapshot_readiness WHERE kb_id=$1 AND collection_name=$2",
    [kbId,collection],
  );
  return validateGraphReadiness(row,kbId,collection);
}

/**
 * Insert a stale row for a new collection, or bump its generation if it
 * already exists. A reconciliation that observed an earlier generation
 * cannot mark a newer, concurrently changed Qdrant snapshot as verified.
 */
export async function invalidateGraphSnapshot(kbId:string,collection:string):Promise<void>{
  if(!kbId||!collection)throw Error("Graph invalidation requires an exact KB and collection");
  await query(
    `INSERT INTO rag_graph_snapshot_readiness
       (kb_id,collection_name,graph_scope_key,status,extractor_version,mutation_generation)
     VALUES($1,$2,$3,'stale',$4,1)
     ON CONFLICT (kb_id,collection_name) DO UPDATE SET
       status='stale',verified_at=NULL,updated_at=now(),
       mutation_generation=rag_graph_snapshot_readiness.mutation_generation+1`,
    [kbId,collection,scopedGraphKbId(kbId,collection),GRAPH_EXTRACTOR_VERSION],
  );
}
