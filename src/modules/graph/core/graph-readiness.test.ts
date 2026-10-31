import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({queryOne:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/db",()=>m);
import {scopedGraphKbId} from "./graph-scope";
import {getGraphSnapshotStatus,invalidateGraphSnapshot,validateGraphReadiness,GRAPH_EXTRACTOR_VERSION} from "./graph-readiness";
const kb="kb1",live="kb_1_live",published="kb_1_published_v1";
const verified=(collection=live)=>({
  graph_scope_key:scopedGraphKbId(kb,collection),status:"verified",
  extractor_version:GRAPH_EXTRACTOR_VERSION,verified_at:new Date().toISOString(),
  source_chunks:22,graph_documents:2,
});
describe("immutable published Graph RAG readiness",()=>{
  beforeEach(()=>{vi.clearAllMocks();});
  it("does not reuse a live graph for a different published vector snapshot",()=>{
    expect(scopedGraphKbId(kb,live)).not.toBe(scopedGraphKbId(kb,published));
    expect(validateGraphReadiness(verified(live),kb,published)).toMatchObject({ready:false,reason:"snapshot_mismatch"});
  });
  it("rejects missing, stale, empty and incompatible graph manifests",()=>{
    expect(validateGraphReadiness(null,kb,live).ready).toBe(false);
    expect(validateGraphReadiness({...verified(),status:"stale"},kb,live).ready).toBe(false);
    expect(validateGraphReadiness({...verified(),graph_documents:0},kb,live).ready).toBe(false);
    expect(validateGraphReadiness({...verified(),extractor_version:"old"},kb,live).reason).toBe("schema_mismatch");
  });
  it("verifies only exact collection-scoped, version-matched evidence",()=>{
    expect(validateGraphReadiness(verified(),kb,live)).toMatchObject({ready:true,reason:"verified"});
    expect(validateGraphReadiness(verified(),kb,published).ready).toBe(false);
  });
  it("requests only scoped status from Postgres and invalidates on mutation",async()=>{
    m.queryOne.mockResolvedValueOnce(verified());
    const result=await getGraphSnapshotStatus(kb,live);
    expect(result.ready).toBe(true);
    expect(m.queryOne).toHaveBeenCalledWith(expect.stringContaining("WHERE kb_id=$1 AND collection_name=$2"),[kb,live]);
    await invalidateGraphSnapshot(kb,live);
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining("status='stale'"),[kb,live]);
  });
});
