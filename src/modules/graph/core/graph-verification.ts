import { createHash } from "node:crypto";

export type SourceChunk = {documentId:string;chunkIndex:number;text:string};
export type SourceDoc = {documentId:string;sourceFingerprint:string};
export function fingerprintSourceDocuments(chunks:SourceChunk[]):SourceDoc[] {
  const grouped=new Map<string,Array<{index:number;text:string}>>();
  for(const c of chunks){
    if(!c.documentId || !Number.isSafeInteger(c.chunkIndex) || c.chunkIndex<0 || !c.text)
      throw Error("Graph snapshot verification requires complete document, index and text provenance");
    const items=grouped.get(c.documentId)??[];
    items.push({index:c.chunkIndex,text:c.text});
    grouped.set(c.documentId,items);
  }
  return [...grouped].map(([documentId,items])=>{
    items.sort((a,b)=>a.index-b.index);
    if(items.some((v,i)=>i>0 && items[i-1]?.index===v.index))
      throw Error("Duplicate source chunk indices prevent verification");
    const texts=items.map(v=>v.text);
    return {documentId,sourceFingerprint:createHash("sha256").update(JSON.stringify(texts)).digest("hex")};
  }).sort((a,b)=>a.documentId.localeCompare(b.documentId));
}
export function assertGraphMatchesSource(source:SourceDoc[],graph:SourceDoc[]):void {
  if(!source.length || source.length!==graph.length)
    throw Error("Graph does not cover all source documents");
  const known=new Map(graph.map(d=>[d.documentId,d.sourceFingerprint]));
  if(known.size!==graph.length || source.some(d=>known.get(d.documentId)!==d.sourceFingerprint))
    throw Error("Graph source-document fingerprints differ from vector snapshot");
}
