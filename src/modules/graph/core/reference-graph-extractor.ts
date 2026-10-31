import { createHash } from "node:crypto";
import type { DocumentGraphExtraction, GraphChunkRef, GraphNodeInput } from "./types";

/**
 * Non-LLM pilot extractor: graph edges encode only a hierarchy proven by the
 * syntax of an actual source identifier (e.g., DO.4 -> DO.4.2).
 * No invented business/person/dependency relationships. Later extraction
 * providers must honor the same KB/document/evidence contract.
 */
const IDENTIFIER = /\b[A-Za-z]{2,15}(?:\.\d{1,4}){1,5}\b/g;
export function buildReferenceGraphExtraction(args: {
  kbId: string; documentId: string; title: string; chunks: readonly string[];
}): DocumentGraphExtraction {
  const { kbId, documentId, title, chunks } = args;
  if (!kbId || !documentId) throw Error("Graph extraction requires a KB and document");
  const nodes = new Map<string, GraphNodeInput>();
  const edges = new Map<string, DocumentGraphExtraction["edges"][number]>();
  for (const [index, text] of chunks.entries()) {
    for (const match of text.matchAll(IDENTIFIER)) {
      const code = match[0]!.toUpperCase();
      const segments = code.split(".");
      // Keep the exact source chunk as evidence, in bounded size.
      const evidence: GraphChunkRef = {
        chunkId: String(index), documentId, title,
        text: text.slice(Math.max(0, (match.index ?? 0) - 150), (match.index ?? 0) + 1200),
      };
      const id = "control:" + code;
      const existing = nodes.get(id);
      if (!existing) {
        nodes.set(id, {id, kbId, label:code, type:"concept",
          aliases:[code],documentIds:[documentId],chunks:[evidence]});
      } else if ((existing.chunks?.length ?? 0) < 6 &&
          !existing.chunks?.some(c=>c.chunkId===evidence.chunkId)) {
        existing.chunks!.push(evidence);
      }
      if (segments.length > 2) {
        const parentCode = segments.slice(0,-1).join(".");
        const parentId = "control:" + parentCode;
        const parent = nodes.get(parentId);
        if (!parent) nodes.set(parentId, {id:parentId,kbId,label:parentCode,type:"concept",
          aliases:[parentCode],documentIds:[documentId],chunks:[evidence]});
        else if ((parent.chunks?.length??0)<6 && !parent.chunks?.some(c=>c.chunkId===evidence.chunkId))
          parent.chunks!.push(evidence);
        const edgeId = "hierarchy:"+parentId+":"+id;
        if (!edges.has(edgeId)) edges.set(edgeId,{id:edgeId,kbId,
          source:parentId,target:id,type:"HAS_SUBCONTROL",
          documentIds:[documentId],weight:1,evidence:[evidence]});
      }
    }
  }
  const sourceFingerprint = createHash("sha256").update(JSON.stringify(chunks)).digest("hex");
  return {kbId,documentId,title,sourceFingerprint,nodes:[...nodes.values()],edges:[...edges.values()]};
}
