import {describe,expect,it} from "vitest";
import {fingerprintSourceDocuments,assertGraphMatchesSource} from "./graph-verification";
const points=[{documentId:"d1",chunkIndex:1,text:"Second"},{documentId:"d1",chunkIndex:0,text:"First"},{documentId:"d2",chunkIndex:0,text:"Other"}];
describe("verifiable source-to-graph content identity",()=>{
 it("normalizes order within documents and compares exact content",()=>{
   const source=fingerprintSourceDocuments(points);
   const reordered=fingerprintSourceDocuments([...points].reverse());
   expect(source).toEqual(reordered);
   expect(()=>assertGraphMatchesSource(source,reordered)).not.toThrow();
 });
 it("rejects missing/extra docs or altered chunk text",()=>{
   const source=fingerprintSourceDocuments(points);
   expect(()=>assertGraphMatchesSource(source,source.slice(1))).toThrow();
   expect(()=>assertGraphMatchesSource(source,fingerprintSourceDocuments(points.map(p=>({...p,text:p.text+" changed"}))))).toThrow();
 });
 it("rejects ambiguous chunks",()=>{
   expect(()=>fingerprintSourceDocuments([...points,points[0]!])).toThrow("Duplicate");
   expect(()=>fingerprintSourceDocuments([{documentId:"",chunkIndex:0,text:"x"}])).toThrow("provenance");
 });
});
