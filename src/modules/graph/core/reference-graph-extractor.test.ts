import { describe, expect, it } from "vitest";
import { buildReferenceGraphExtraction } from "./reference-graph-extractor";

describe("source-backed, vendor-neutral graph extraction", () => {
  const args = {kbId:"tenant-a-kb", documentId:"doc1",title:"Policies"};
  it("creates explicit hierarchy with document-backed evidence", () => {
    const x=buildReferenceGraphExtraction({...args,chunks:[
      "DO.4.1 Data Backup Recovery. DO.4.2 Disaster Recovery.",
      "DO.4.3 Production Access Control. DG.2.1 Governance." ]});
    expect(x.nodes.map(n=>n.label)).toContain("DO.4");
    expect(x.nodes.map(n=>n.label)).toContain("DO.4.2");
    expect(x.edges.find(e=>e.target==="control:DO.4.2")?.source).toBe("control:DO.4");
    expect(x.nodes.find(n=>n.id==="control:DO.4.2")?.chunks?.[0]?.text).toContain("DO.4.2");
    expect(x.edges.every(e=>e.kbId===args.kbId && e.documentIds?.[0]===args.documentId)).toBe(true);
  });
  it("does not invent project relationship edges without source identifiers", () => {
    const x=buildReferenceGraphExtraction({...args,chunks:["Project Atlas depends on Site Bravo and Alice owns server."]});
    expect(x.nodes).toHaveLength(0);
    expect(x.edges).toHaveLength(0);
  });
  it("is idempotent for duplicated identifiers in one chunk", () => {
    const x=buildReferenceGraphExtraction({...args,chunks:["DO.4.2 and DO.4.2"]});
    expect(x.nodes).toHaveLength(2);
    expect(x.edges).toHaveLength(1);
  });
});
