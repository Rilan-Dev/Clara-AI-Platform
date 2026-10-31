import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import { getGraphStore } from "./graph-store";
import { buildReferenceGraphExtraction } from "./reference-graph-extractor";
describe("memory graph store isolation",()=>{
  it("never merges the same identifier across knowledge bases",async()=>{
    const a=randomUUID(),b=randomUUID(),da=randomUUID(),db=randomUUID();
    const store=getGraphStore("memory");
    const x=(kbId:string,documentId:string,source:string)=>
      buildReferenceGraphExtraction({kbId,documentId,title:"Test",chunks:[source]});
    await store.upsertExtraction(x(a,da,"DO.4.2 example from A"));
    await store.upsertExtraction(x(b,db,"DO.4.2 example from B"));
    const left=await store.search({kbId:a,query:"DO.4.2",topK:3});
    const right=await store.search({kbId:b,query:"DO.4.2",topK:3});
    expect(left.map(n=>n.supportingChunks[0]?.text).join(" ")).toContain("from A");
    expect(left.map(n=>n.supportingChunks[0]?.text).join(" ")).not.toContain("from B");
    expect(right.map(n=>n.supportingChunks[0]?.text).join(" ")).toContain("from B");
    await store.deleteDocument(a,da);
    expect(await store.search({kbId:a,query:"DO.4.2",topK:3})).toHaveLength(0);
    expect((await store.search({kbId:b,query:"DO.4.2",topK:3})).length).toBeGreaterThan(0);
    await expect(()=>getGraphStore("unexpected")).toThrow("Unsupported");
    await store.deleteDocument(b,db);
  });
});
