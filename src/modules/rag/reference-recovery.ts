import { extractStructuredReferences } from "./reference-evidence";

/** Bounded, read-only fallback for older Qdrant points lacking a lexical index. */
export const REFERENCE_SCAN_LIMIT = 2048;
export const REFERENCE_SCAN_PAGE_SIZE = 256;

export type ReferencePoint = {
  id: string;
  payload?: Record<string, unknown>;
};

export type ReferenceWindow = {
  id: string;
  text: string;
  documentId: string;
  chunkIndex: number;
};

const REF_PATTERN = /\b[A-Za-z][A-Za-z0-9]{0,15}(?:[._-]\d+){1,5}\b/g;

function referenceSpans(text: string): Array<{ id: string; start: number }> {
  return Array.from(text.matchAll(REF_PATTERN), (match) => ({
    id: match[0]!.toUpperCase(),
    start: match.index ?? 0,
  }));
}

/**
 * Select full clause evidence plus following chunks up to the next clause.
 * A page/chunk split can leave numbered items without repeating their header.
 * Do not cross document boundaries or invent missing text.
 */
export function buildReferenceWindows(
  points: readonly ReferencePoint[],
  question: string,
  topK: number,
): ReferenceWindow[] {
  const wanted = new Set(extractStructuredReferences(question));
  if (!wanted.size) return [];
  const docs = new Map<string, Array<ReferencePoint & { index: number }>>();
  for (const p of points) {
    const docId = p.payload?.documentId;
    const index = p.payload?.chunkIndex;
    if (typeof docId !== "string" || !Number.isSafeInteger(index) || (index as number) < 0) continue;
    const row = { ...p, index: index as number };
    const group = docs.get(docId) ?? [];
    group.push(row);
    docs.set(docId, group);
  }
  const windows = new Map<string, ReferenceWindow>();
  const idsByDocument = new Map<string, string[]>();
  for (const [docId, rows] of docs) {
    rows.sort((a, b) => a.index - b.index);
    const positions = rows.flatMap((row, i) => {
      const text = row.payload?.chunk;
      if (typeof text !== "string") return [];
      const spans = referenceSpans(text).filter((r) => wanted.has(r.id));
      return spans.length ? [{ i, spans }] : [];
    });
    if (!positions.length) continue;
    const ids: string[] = [];
    for (const { i, spans } of positions) {
      const base = rows[i]!;
      const original = String(base.payload?.chunk ?? "");
      const start = Math.min(...spans.map((r) => r.start));
      const nextRef = referenceSpans(original).find((r) => r.start > start && !wanted.has(r.id));
      const clipped = original.slice(start, nextRef?.start ?? original.length).trim();
      if (clipped && !windows.has(base.id)) {
        windows.set(base.id, { id: base.id, text: clipped, documentId: docId, chunkIndex: base.index });
        ids.push(base.id);
      }
      // Continue at most two adjacent chunks. Stop at the first new clause,
      // even when the new clause begins partway through the continuation.
      if (nextRef) continue;
      let prev = base;
      for (let n = 1; n <= 2; n++) {
        const following = rows[i + n];
        if (!following || following.index !== prev.index + 1) break;
        const text = following.payload?.chunk;
        if (typeof text !== "string") break;
        const boundary = referenceSpans(text).find((r) => !wanted.has(r.id));
        const clippedNext = text.slice(0, boundary?.start ?? text.length).trim();
        if (clippedNext && !windows.has(following.id)) {
          windows.set(following.id, {
            id: following.id, text: clippedNext, documentId: docId, chunkIndex: following.index,
          });
          ids.push(following.id);
        }
        if (boundary) break;
        prev = following;
      }
    }
    idsByDocument.set(docId, ids);
  }
  // Fairly budget evidence across relevant documents. Within a document,
  // preserve source order so a numbered list does not lose its continuation.
  const selected: ReferenceWindow[] = [];
  const order = [...idsByDocument.values()];
  for (let depth = 0; selected.length < topK; depth++) {
    let found = false;
    for (const group of order) {
      const id = group[depth];
      if (id && selected.length < topK) {
        const item = windows.get(id);
        if (item) { selected.push(item); found = true; }
      }
    }
    if (!found) break;
  }
  return selected;
}
