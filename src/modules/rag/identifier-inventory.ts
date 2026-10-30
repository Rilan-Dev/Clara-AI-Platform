/**
 * Evidence inventory for explicit "list ALL XX specifications" requests.
 * Domain-agnostic: XX is a user-supplied code prefix, not a hardcoded policy.
 * Input points are already filtered to the authorized tenant/KB/document.
 * Never declare completeness from an unfinished Qdrant scroll.
 */
import { extractStructuredReferences } from "./reference-evidence";

export type IdentifierInventoryIntent = { prefix: string };
export type IdentifierInventoryPoint = { id: string; payload?: Record<string, unknown> };
export type InventoryEntry = { identifier: string; pointId: string; documentId: string | null;
  title: string; pageNumber: number | null; excerpt: string };

const IDENTIFIER = /\b[A-Za-z][A-Za-z0-9]{0,15}(?:[._-]\d+){1,5}\b/g;

export function detectIdentifierInventoryIntent(question: string): IdentifierInventoryIntent | null {
  if (extractStructuredReferences(question).length) return null;
  const text = question.normalize("NFKC").trim();
  if (!/(?:\ball\b|\bevery\b|\bcomplete\b|\bentire\b|\bfull\b|सभी|सारे|كل|جميع)/i.test(text))
    return null;
  if (!/(?:polic|control|specification|clause|standard|requirement|item|code|identifi|section|ضابط|سياس|मानक|नीति)/i.test(text))
    return null;
  // Restrict the prefix to the same phrase as the requested item type, so
  // generic words ("all", "what", "list") are not treated as code prefixes.
  const match = text.match(/\b([A-Za-z]{1,6}\d{0,2})\s+(?:polic\w*|controls?|specifications?|clauses?|standards?|requirements?|items?|codes?|identifiers?|sections?)\b/i);
  if (!match) return null;
  const prefix = match[1]!.toUpperCase();
  if (/^(ALL|EVERY|FULL|TOTAL|SOME|WHAT|WHICH|THE|DATA|POLICY|SECTION)$/.test(prefix))
    return null;
  return { prefix };
}

export function buildIdentifierInventory(
  points: readonly IdentifierInventoryPoint[], intent: IdentifierInventoryIntent,
  fullyScanned: boolean, maxItems = 150,
): { complete: boolean; entries: InventoryEntry[]; total: number; overflow: boolean } {
  if (!fullyScanned) return { complete: false, entries: [], total: 0, overflow: false };
  const unique = new Map<string, InventoryEntry>();
  for (const point of points) {
    const p = point.payload ?? {};
    const chunk = typeof p.chunk === "string" ? p.chunk : "";
    const ids = [
      ...(Array.isArray(p.referenceIds)
        ? p.referenceIds.filter((x): x is string => typeof x === "string") : []),
      ...Array.from(chunk.matchAll(IDENTIFIER), m => m[0]!),
    ];
    for (const raw of ids) {
      const id = raw.toUpperCase();
      if (!id.startsWith(intent.prefix + ".") &&
          !id.startsWith(intent.prefix + "_") &&
          !id.startsWith(intent.prefix + "-")) continue;
      if (unique.has(id)) continue;
      const pos = chunk.toUpperCase().indexOf(id);
      const page = p.pageNumber;
      unique.set(id, {
        identifier: id,
        pointId: point.id,
        documentId: typeof p.documentId === "string" ? p.documentId : null,
        title: typeof p.title === "string" ? p.title : "Document",
        pageNumber: typeof page === "number" && Number.isSafeInteger(page) && page > 0 ? page : null,
        excerpt: pos >= 0 ? chunk.slice(pos, pos + 190).replace(/\s+/g, " ").trim() : "",
      });
    }
  }
  const entries = [...unique.values()].sort((a, b) =>
    a.identifier.localeCompare(b.identifier, "en", { numeric: true }));
  if (entries.length > maxItems)
    return { complete: false, entries: [], total: entries.length, overflow: true };
  return { complete: true, entries, total: entries.length, overflow: false };
}

export function formatIdentifierInventory(prefix: string, inventory: ReturnType<typeof buildIdentifierInventory>): string {
  if (!inventory.complete) return "";
  if (!inventory.entries.length)
    return `[Exhaustive identifier inventory] No identifiers with prefix ${prefix} were found in the fully scanned authorized knowledge-base scope. Do not substitute a different prefix without asking the user to confirm it.`;
  return [
    `[Exhaustive identifier inventory — ${inventory.total} distinct ${prefix} identifiers in the fully scanned authorized KB scope. These are identifiers, not proof of the full requirements of each control. Cite the document locations; do not claim there are additional items.]`,
    ...inventory.entries.map(e => `- ${e.identifier} — ${e.title}${e.pageNumber ? ` (page ${e.pageNumber})` : ""}${e.excerpt ? `: ${e.excerpt}` : ""}`),
  ].join("\n");
}
