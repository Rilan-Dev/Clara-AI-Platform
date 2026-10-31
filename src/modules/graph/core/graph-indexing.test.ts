import { describe, expect, it, vi, beforeEach } from "vitest";
const upsert = vi.fn(async () => undefined);
vi.mock("./graph-store",()=>({getGraphStore:()=>({upsertExtraction:upsert})}));
import { indexDocumentGraph } from "./graph-indexing";
const sample = {kbId:"test-kb",documentId:"doc",title:"Guide",chunks:["DO.4.2 Disaster Recovery"]};
describe("graph indexing feature gate",()=>{
  beforeEach(()=>{upsert.mockClear();delete process.env.GRAPH_STORE_PROVIDER;});
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
