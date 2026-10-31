import { query, queryOne } from "@/lib/db";
import { scopedGraphKbId } from "./graph-scope";

/** Only this schema is supported by the bounded source-identifer pilot. */
export const GRAPH_EXTRACTOR_VERSION = "identifier-hierarchy-v1";

export type GraphSnapshotStatus = {
  ready: boolean; reason: "verified" | "not_indexed" | "index_stale" | "snapshot_mismatch" | "schema_mismatch";
  collection: string;
};

export function validateGraphReadiness(row: {
  status:string; graph_scope_key:string; extractor_version:string;
  verified_at:string|null; source_chunks:number; graph_documents:number;
} | null, kbId:string, collection:string):GraphSnapshotStatus {
  const base={collection};
  if (!row) return {...base, ready:false, reason:"not_indexed"};
  if (row.graph_scope_key!==scopedGraphKbId(kbId,collection))
    return {...base, ready:false, reason:"snapshot_mismatch"};
  if (row.extractor_version!==GRAPH_EXTRACTOR_VERSION)
    return {...base, ready:false, reason:"schema_mismatch"};
  if (row.status!=="verified" || !row.verified_at || row.source_chunks<1 || row.graph_documents<1)
    return {...base, ready:false, reason:"index_stale"};
  return {...base,ready:true,reason:"verified"};
}

/** The collection is ALWAYS resolved by the authorized server-side agent deployment. */
export async function getGraphSnapshotStatus(kbId:string,collection:string):Promise<GraphSnapshotStatus>{
  if(!kbId || !collection) return {collection,ready:false,reason:"not_indexed"};
  const row=await queryOne<{
    status:string;graph_scope_key:string;extractor_version:string;
    verified_at:string|null;source_chunks:number;graph_documents:number;
  }>(
    "SELECT status,graph_scope_key,extractor_version,verified_at,source_chunks,graph_documents FROM rag_graph_snapshot_readiness WHERE kb_id=$1 AND collection_name=$2",
    [kbId,collection],
  );
  return validateGraphReadiness(row,kbId,collection);
}

/** Called before any mutable live-vector write/delete; published snapshots are untouched. */
export async function invalidateGraphSnapshot(kbId:string,collection:string):Promise<void>{
  await query(
    "UPDATE rag_graph_snapshot_readiness SET status='stale',verified_at=NULL,updated_at=now() WHERE kb_id=$1 AND collection_name=$2",
    [kbId,collection],
  );
}
