/**
 * Locate summary tables for explicit "all N domains/categories" questions.
 * Never treat the vector topK as complete or cross document/KB boundaries.
 * The caller must supply a fully-scanned authorized KB/document point set.
 * This is not a completeness certificate; it only returns anchored evidence.
 */
export type TableInventoryIntent = { count: number; subject: string };
export type TableChunk = { id: string; payload?: Record<string, unknown> };
export type TableEvidence = {
  id: string; documentId: string; chunkIndex: number;
  title: string; text: string; pageNumber: number | null;
};

export function detectNumberedTableIntent(question: string): TableInventoryIntent | null {
  const found = question.normalize("NFKC").trim().match(
    /\b(?:all|every|complete(?:\s+list\s+of)?)\s+(?:the\s+)?(\d{1,3})\s+(domains?|categories|sections?|policies|standards?|chapters?|areas|types|controls?|requirements?)\b/i,
  );
  if (!found) return null;
  const count = Number(found[1]);
  return count >= 3 && count <= 100 ? { count, subject: found[2]!.toLowerCase() } : null;
}

export function selectNumberedTableEvidence(
  points: readonly TableChunk[], intent: TableInventoryIntent, question: string,
): TableEvidence[] {
  const docs = new Map<string, TableEvidence[]>();
  for (const x of points) {
    const p = x.payload ?? {};
    if (typeof p.documentId !== "string" || !Number.isSafeInteger(p.chunkIndex) ||
        typeof p.chunk !== "string" || !(p.chunk as string).trim()) continue;
    const group = docs.get(p.documentId) ?? [];
    group.push({
      id: x.id, documentId: p.documentId, chunkIndex: p.chunkIndex as number,
      title: typeof p.title === "string" ? p.title : "Document",
      text: p.chunk as string,
      pageNumber: typeof p.pageNumber === "number" && Number.isSafeInteger(p.pageNumber)
        ? p.pageNumber : null,
    });
    docs.set(p.documentId, group);
  }
  const preferArabic = /[\u0600-\u06FF]/.test(question);
  let best: { group: TableEvidence[]; position: number; score: number } | null = null;
  for (const group of docs.values()) {
    group.sort((a, b) => a.chunkIndex - b.chunkIndex);
    for (let i = 0; i < group.length; i++) {
      const value = group[i]!.text;
      const num = String(intent.count);
      const lowered = value.toLowerCase();
      const hasCount = lowered.includes(num + " " + intent.subject) ||
        new RegExp("\\b" + num + "\\s+(?:domain|category|section|policy|standard|chapter|area|type|control|requirement)s?\\b", "i").test(value) ||
        // OCR frequently reorders the alif/lam in Arabic "domains":
        // المجاالت / المجالات. Require adjacency to the stated count,
        // plus a recognized table header below, rather than one spelling.
        new RegExp("المجا[^0-9]{0,14}" + num, "u").test(value);
      const isTable = /\bID\s+Domain\s+#|\bDomain\s+#\s+of\s+Controls|الرقم\s+المجال|الرقم\s+المجالات/i.test(value);
      if (!hasCount || !isTable) continue;
      const inArabic = /[\u0600-\u06FF]/.test(value);
      const score = 10 + (inArabic === preferArabic ? 5 : 0) +
        (value.length >= 450 ? 1 : 0);
      if (!best || score > best.score) best = { group, position: i, score };
    }
  }
  if (!best) return [];
  const row = best.group[best.position]!;
  const answer = [row];
  // Some PDF extractors fit the complete summary table on one chunk
  // and expose its totals row there. Do not pull unrelated next sections.
  if (/(?:\bTotal\b|الإجمالي)/iu.test(row.text)) return answer;
  for (let n = 1; n <= 2; n++) {
    const following = best.group[best.position + n];
    if (!following || following.chunkIndex !== row.chunkIndex + n) break;
    // Stop at the next numbered *section* header, even if it starts after
    // the table's final row in the SAME OCR/PDF chunk. Numbered table
    // columns lack dots, so a heading like "8.2. Implementation Plan" is
    // a reliable generic section boundary rather than a policy code.
    const sectionBoundary = following.text.search(/\b\d{1,2}\.\d{1,2}\.\s+[A-Za-z\u0600-\u06FF]/u);
    if (sectionBoundary === 0) break;
    const selected = sectionBoundary > 0
      ? { ...following, text: following.text.slice(0, sectionBoundary).trim() }
      : following;
    if (selected.text) answer.push(selected);
    if (sectionBoundary > 0) break;
    if (answer.reduce((t, c) => t + c.text.length, 0) >= 4500) break;
  }
  return answer;
}
