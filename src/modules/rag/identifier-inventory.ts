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
  const text = question.normalize("NFKC").trim();
  const refs = extractStructuredReferences(text);
  // A cited leaf clause ("list all DO.4.2 requirements") is a request for
  // that clause's items, not for a document-wide identifier inventory.
  // A parent/family ("available DO.4 series") means enumerate its children.
  if (refs.length) {
    if (refs.length !== 1 ||
        !/\b(?:series|family|subsections?|subcontrols?|related|available)\b/i.test(text))
      return null;
    const family = refs[0]!;
    const segments = family.split(/[._-]/);
    return segments.length === 2 && /^[A-Z][A-Z0-9]{0,15}$/.test(segments[0]!)
      ? { prefix: family } : null;
  }
  if (!/(?:\ball\b|\bevery\b|\bcomplete\b|\bentire\b|\bfull\b|सभी|सारे|كل|جميع)/i.test(text))
    return null;
  if (!/(?:polic|control|specification|clause|standard|requirement|item|code|identifi|section|ضابط|سياس|मानक|नीति)/i.test(text))
    return null;
  // Accept real spoken phrasing: "all DO relevant policies". Keep the
  // optional modifier tightly adjacent to the code and policy noun.
  const match = text.match(
    /\b([A-Za-z]{1,6}\d{0,2})\s+(?:(?:related|relevant|available|applicable|associated)\s+)?(?:polic\w*|controls?|specifications?|clauses?|standards?|requirements?|items?|codes?|identifiers?|sections?)\b/i,
  );
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
  // Hierarchical identifiers may include both a parent heading (DO.1)
  // and individually numbered entries below it (DO.1.1). Do not report
  // parent headings as additional standalone policies without qualification.
  const hasChildren = (identifier: string) => inventory.entries.some(e =>
    e.identifier !== identifier &&
    (e.identifier.startsWith(identifier + ".") ||
     e.identifier.startsWith(identifier + "_") ||
     e.identifier.startsWith(identifier + "-")));
  const leaves = inventory.entries.filter(e => !hasChildren(e.identifier));
  const parents = inventory.entries.filter(e => hasChildren(e.identifier));
  return [
    `[Exhaustive identifier inventory — ${inventory.total} distinct ${prefix} identifiers in the fully scanned authorized KB scope; ${leaves.length} leaf identifiers and ${parents.length} parent/group identifiers. When asked for individual policies or specifications, distinguish parent headings from their children. These are identifiers, not proof of each control's complete requirements. Cite document locations.]`,
    ...leaves.map(e => `- Leaf ${e.identifier} — ${e.title}${e.pageNumber ? ` (page ${e.pageNumber})` : ""}${e.excerpt ? `: ${e.excerpt}` : ""}`),
    ...parents.map(e => `- Parent ${e.identifier} — ${e.title}${e.pageNumber ? ` (page ${e.pageNumber})` : ""}`),
  ].join("\n");
}
