import { describe, expect, it, vi, beforeEach } from "vitest";
const upsert = vi.fn(async (_extraction: {kbId:string}) => undefined);
vi.mock("./graph-store",()=>({getGraphStore:()=>({upsertExtraction:upsert})}));
import { indexDocumentGraph, graphIndexingEnabledForKb, graphStorageConfiguredForKb } from "./graph-indexing";
const sample = {kbId:"test-kb",documentId:"doc",title:"Guide",chunks:["DO.4.2 Disaster Recovery"]};
describe("graph indexing feature gate",()=>{
  beforeEach(()=>{
    upsert.mockClear();
    delete process.env.GRAPH_STORE_PROVIDER;
    delete process.env.GRAPH_INDEXING_KB_ID;
    delete process.env.ENABLE_GRAPH_INDEXING;
  });
  it("allows a single explicitly scoped KB to ingest into Neo4j while global retrieval stays on memory", async()=>{
    process.env.GRAPH_STORE_PROVIDER="memory";
    process.env.GRAPH_INDEXING_KB_ID="test-kb";
    process.env.ENABLE_GRAPH_INDEXING="true";
    expect(graphIndexingEnabledForKb("test-kb")).toBe(true);
    expect(graphIndexingEnabledForKb("other-tenant-kb")).toBe(false);
    expect(graphStorageConfiguredForKb("test-kb")).toBe(true);
    expect(graphStorageConfiguredForKb("other-tenant-kb")).toBe(false);
    const indexed=await indexDocumentGraph({...sample,collection:"current-v1"});
    const rejected=await indexDocumentGraph({...sample,kbId:"other-tenant-kb",collection:"current-v1"});
    expect(indexed.state).toBe("indexed");
    expect(rejected.state).toBe("disabled");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({kbId:"test-kb::current-v1"}));
  });
  it("requires explicit ENABLE_GRAPH_INDEXING even for the matching scope",async()=>{
    process.env.GRAPH_STORE_PROVIDER="memory";
    process.env.GRAPH_INDEXING_KB_ID="test-kb";
    expect(graphIndexingEnabledForKb("test-kb")).toBe(false);
    expect((await indexDocumentGraph(sample)).state).toBe("disabled");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("continues cleaning previous scoped graph data after automatic indexing is turned off",()=>{
    process.env.GRAPH_STORE_PROVIDER="memory";
    process.env.GRAPH_INDEXING_KB_ID="test-kb";
    expect(graphStorageConfiguredForKb("test-kb")).toBe(true);
    expect(graphIndexingEnabledForKb("test-kb")).toBe(false);
  });
  it("leaves legacy vector ingestion untouched by default",async()=>{
    expect(await indexDocumentGraph(sample,{enabled:false})).toMatchObject({state:"disabled"});
    expect(upsert).not.toHaveBeenCalled();
  });
  it("rejects a supposedly enabled graph without configured persistence",async()=>{
    await expect(indexDocumentGraph(sample,{enabled:true})).rejects.toThrow("Neo4j");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("isolates snapshots with the same KB id but different collections",async()=>{
    process.env.GRAPH_STORE_PROVIDER="neo4j";
    const live=await indexDocumentGraph({...sample,collection:"live-v1"},{enabled:true});
    const published=await indexDocumentGraph({...sample,collection:"published-v2"},{enabled:true});
    expect(live.state).toBe("indexed");
    expect(published.state).toBe("indexed");
    const calls=upsert.mock.calls;
    const scopes=calls.map(x=>(x[0] as {kbId:string}).kbId);
    expect(scopes[0]).not.toBe(scopes[1]);
    expect(scopes[0]).toContain("live-v1");
    expect(scopes[1]).toContain("published-v2");
  });
  it("indexes source-backed control hierarchy when opted in",async()=>{
    process.env.GRAPH_STORE_PROVIDER="neo4j";
    const result=await indexDocumentGraph(sample,{enabled:true});
    expect(result).toEqual({state:"indexed",nodes:2,edges:1});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({kbId:"test-kb",documentId:"doc"}));
  });
});
