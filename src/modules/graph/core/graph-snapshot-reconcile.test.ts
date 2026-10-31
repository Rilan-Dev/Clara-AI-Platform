import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),queryOne:vi.fn(),manifests:vi.fn()}));
vi.mock("@/lib/db",()=>({query:m.query,queryOne:m.queryOne}));
vi.mock("./neo4j-store",()=>({Neo4jGraphStore:class {
  listDocumentFingerprints=m.manifests;
}}));
import {fingerprintSourceDocuments} from "./graph-verification";
import {reconcileGraphSnapshotAfterIngest} from "./graph-snapshot-reconcile";

const kb="kb-authorized",collection="kb_live";
const points=[
  {payload:{kbId:kb,documentId:"doc-a",chunkIndex:0,chunk:"DO.4.2 example"}},
  {payload:{kbId:kb,documentId:"doc-a",chunkIndex:1,chunk:"DO.4.3 example"}},
];
const manifests=fingerprintSourceDocuments(points.map(p=>({
  documentId:p.payload.documentId,chunkIndex:p.payload.chunkIndex,text:p.payload.chunk,
})));
describe("scoped automatic graph reconciliation",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    process.env.GRAPH_INDEXING_KB_ID=kb;
    process.env.ENABLE_GRAPH_INDEXING="true";
    process.env.QDRANT_URL="http://qdrant:6333";
    m.queryOne.mockResolvedValueOnce({id:kb}).mockResolvedValueOnce({generation:"8"});
    m.query.mockResolvedValue([{mutation_generation:"8"}]);
    m.manifests.mockResolvedValue(manifests);
    vi.stubGlobal("fetch",vi.fn(async()=>({
      ok:true,json:async()=>({result:{points,next_page_offset:null}}),
    })));
  });
  afterEach(()=>{
    vi.unstubAllGlobals();
    delete process.env.GRAPH_INDEXING_KB_ID;
    delete process.env.ENABLE_GRAPH_INDEXING;
    delete process.env.QDRANT_URL;
  });
  it("verifies unchanged exact Qdrant source with graph manifests and CAS generation",async()=>{
    const r=await reconcileGraphSnapshotAfterIngest(kb,collection);
    expect(r).toEqual({verified:true,reason:"verified",sourceChunks:2,graphDocuments:1});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(m.manifests).toHaveBeenCalledWith(kb+"::"+collection);
    expect(m.query.mock.calls[0]?.[0]).toContain("mutation_generation=$7::bigint");
    expect(m.query.mock.calls[0]?.[1]).toEqual([
      kb,collection,kb+"::"+collection,"identifier-hierarchy-v1",2,1,"8",
    ]);
  });
  it("rejects a concurrent mutation rather than reporting stale data as verified",async()=>{
    m.query.mockResolvedValueOnce([]);
    const r=await reconcileGraphSnapshotAfterIngest(kb,collection);
    expect(r).toMatchObject({verified:false,reason:"source_changed"});
  });
  it("rejects graph manifests from earlier document versions",async()=>{
    m.manifests.mockResolvedValueOnce([{documentId:"old-doc",sourceFingerprint:"abc"}]);
    await expect(reconcileGraphSnapshotAfterIngest(kb,collection)).rejects.toThrow("Graph");
    expect(m.query).not.toHaveBeenCalled();
  });
  it("does not access DB or Neo4j for an unrelated KB",async()=>{
    await expect(reconcileGraphSnapshotAfterIngest("other-tenant",collection)).rejects.toThrow("not enabled");
    expect(m.queryOne).not.toHaveBeenCalled();
    expect(m.manifests).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
