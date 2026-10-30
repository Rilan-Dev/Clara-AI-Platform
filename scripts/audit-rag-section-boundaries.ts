/**
 * Read-only, offline section-boundary audit for existing private KB excerpts.
 *
 * Accepts JSON-lines from stdin: {"text":"...","documentId":"opaque"}.
 * It NEVER contacts Clara, Qdrant, embedding providers or an LLM. No source
 * text, user questions, IDs, tokens, or document titles are printed.
 *
 * This measures a sample of ALREADY CHUNKED legacy excerpts; it does NOT
 * reconstruct original files, benchmark vector retrieval or prove gains.
 *
 * Usage (on the private operator workstation / server):
 *   some-authorized-jsonl-producer | npx tsx scripts/audit-rag-section-boundaries.ts
 */
import { createInterface } from "node:readline";
import { chunkSectionAwareText, chunkText } from "../src/modules/admin/core/ingest/chunker";

export type SectionAuditRecord = { text: string; documentId?: string };
export type SectionAuditSummary = {
  mode: "read-only-legacy-excerpt-audit";
  sourceChunks: number;
  documents: number;
  headingBearingChunks: number;
  chunksWithInternalHeading: number;
  chunksWithMultipleHeadings: number;
  legacyChunksCrossingDetectedBoundary: number;
  segmentsAfterResplitting: number;
  /** Fraction of supplied already-chunked excerpts crossing a recognized boundary. */
  detectedBoundaryCrossingRate: number;
  limitation: string;
};

const HEADER = /\b[A-Z]{2,8}\.\d{1,3}(?:\.\d{1,3}){1,2}\s+(?=[A-Z][a-z]{2,}\b)/g;
const LIMITATION = "Pre-chunked excerpt audit only: cannot reconstruct original document, infer actual page boundaries, or establish citation accuracy.";

export function auditLegacySectionChunks(records: readonly SectionAuditRecord[]): SectionAuditSummary {
  let headingBearingChunks = 0;
  let chunksWithInternalHeading = 0;
  let chunksWithMultipleHeadings = 0;
  let crossing = 0;
  let resegments = 0;
  const documents = new Set<string>();
  for (const { text, documentId } of records) {
    if (documentId) documents.add(documentId);
    const matches = Array.from(text.matchAll(HEADER));
    if (matches.length) headingBearingChunks++;
    if (matches.some((m) => (m.index ?? 0) > 0)) chunksWithInternalHeading++;
    if (matches.length > 1) chunksWithMultipleHeadings++;
    // Legacy chunker may split spans for length alone; count only explicitly
    // detected internal section starts as crossing.
    if (matches.some((m) => (m.index ?? 0) > 0)) crossing++;
    resegments += matches.length ? chunkSectionAwareText(text).length : chunkText(text).length;
  }
  return {
    mode: "read-only-legacy-excerpt-audit",
    sourceChunks: records.length,
    documents: documents.size,
    headingBearingChunks,
    chunksWithInternalHeading,
    chunksWithMultipleHeadings,
    legacyChunksCrossingDetectedBoundary: crossing,
    segmentsAfterResplitting: resegments,
    detectedBoundaryCrossingRate: records.length ? Math.round((crossing / records.length) * 10000) / 10000 : 0,
    limitation: LIMITATION,
  };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).length || process.stdin.isTTY) {
    throw new Error("Usage: authorized JSONL source | npx tsx scripts/audit-rag-section-boundaries.ts (stdin only)");
  }
  const items: SectionAuditRecord[] = [];
  let totalChars = 0;
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    if (items.length >= 5000) throw new Error("Too many chunks (limit 5000)");
    totalChars += line.length;
    if (totalChars > 9_000_000) throw new Error("Oversized input");
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== "object" || typeof (parsed as {text?:unknown}).text !== "string") {
      throw new Error("Expected JSONL records with a text string");
    }
    const row = parsed as { text: string; documentId?: unknown };
    if (row.text.length > 100_000) throw new Error("Oversized chunk");
    items.push({ text: row.text, ...(typeof row.documentId === "string" ? { documentId: row.documentId } : {}) });
  }
  if (!items.length) throw new Error("No source chunks supplied");
  console.log(JSON.stringify(auditLegacySectionChunks(items), null, 2));
}

if (process.argv[1]?.endsWith("/audit-rag-section-boundaries.ts")) {
  main().catch((error: unknown) => {
    console.error("Section audit failed: " + (error instanceof Error ? error.message : "unknown error"));
    process.exitCode = 1;
  });
}
