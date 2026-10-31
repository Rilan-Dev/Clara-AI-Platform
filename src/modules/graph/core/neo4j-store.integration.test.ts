import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Neo4jGraphStore } from "./neo4j-store";
import { buildReferenceGraphExtraction } from "./reference-graph-extractor";

const pilot = process.env.NEO4J_TEST_ENABLED === "true";
describe.skipIf(!pilot)("Neo4j persistent graph integration (isolated pilot)", () => {
  it("persists evidence and relationships, isolates KBs, replaces and deletes document memberships", async () => {
    const store=new Neo4jGraphStore();
    const first="pilot-"+randomUUID(), second="pilot-"+randomUUID();
    const documentA="doc-"+randomUUID(), documentB="doc-"+randomUUID();
    const make=(kbId:string,documentId:string,chunk:string)=>
      buildReferenceGraphExtraction({kbId,documentId,title:"Pilot policy",chunks:[chunk]});
    try {
      await store.upsertExtraction(make(first,documentA,"DO.4.2 Disaster Recovery"));
      await store.upsertExtraction(make(second,documentA,"DO.4.2 Another tenant"));
      await store.upsertExtraction(make(first,documentB,"DO.4.3 Production Access Control"));
      const manifests=await store.listDocumentFingerprints(first);
      expect(manifests).toHaveLength(2);
      expect(manifests.every(m=>/^[0-9a-f]{64}$/.test(m.sourceFingerprint))).toBe(true);
      const a=await store.search({kbId:first,query:"DO.4.2",topK:4});
      expect(a.some(n=>n.label==="DO.4.2")).toBe(true);
      const control=a.find(n=>n.label==="DO.4.2");
      expect(control?.supportingChunks[0]?.text).toContain("Disaster Recovery");
      expect(control?.relations.some(r=>r.type==="HAS_SUBCONTROL")).toBe(true);
      expect(a.every(n=>n.supportingChunks.every(c=>c.documentId===documentA))).toBe(true);
      expect((await store.search({kbId:second,query:"DO.4.3",topK:4}))).toHaveLength(0);
      expect((await store.search({kbId:first,documentId:documentA,query:"DO.4.3",topK:4}))).toHaveLength(0);
      expect((await store.getStats(first)).documentCount).toBe(2);
      await store.upsertExtraction(make(first,documentA,"DO.5.1 Storage Performance"));
      expect((await store.listDocumentFingerprints(first)).length).toBe(2);
      expect(await store.search({kbId:first,query:"DO.4.2",topK:4})).toHaveLength(0);
      expect((await store.search({kbId:second,query:"DO.4.2",topK:4}))).toHaveLength(1);
      await store.deleteDocument(first,documentB);
      expect((await store.search({kbId:first,query:"DO.4.3",topK:4}))).toHaveLength(0);
    } finally {
      await store.deleteDocument(first,documentA);
      await store.deleteDocument(first,documentB);
      await store.deleteDocument(second,documentA);
    }
  }, 50000);
});
