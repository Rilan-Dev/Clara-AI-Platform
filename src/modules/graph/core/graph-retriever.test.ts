import {describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({search:vi.fn(async()=>[])}));
vi.mock("./graph-store",()=>({getGraphStore:()=>({search:m.search})}));
import {retrieveGraphContext} from "./graph-retriever";
import {scopedGraphKbId} from "./graph-scope";
describe("published vector collection binds Neo4j graph scope",()=>{
  it("passes an immutable collection-scoped ID to Neo4j",async()=>{
    await retrieveGraphContext({kbId:"kb",collection:"published_v4",query:"DO.4.2",topK:3});
    expect(m.search).toHaveBeenCalledWith(expect.objectContaining({kbId:scopedGraphKbId("kb","published_v4"),query:"DO.4.2"}));
  });
});
