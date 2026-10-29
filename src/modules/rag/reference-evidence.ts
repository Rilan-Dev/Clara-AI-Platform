/**
 * Generic exact-reference evidence focus for dense RAG results.
 *
 * Embedding similarity can rank unrelated sections above a user-specified
 * engineering clause, policy control, or contract reference. When candidate
 * chunk text actually contains the queried structured identifier, use that
 * evidence rather than polluting the AI's context with unrelated snippets.
 *
 * This is tenant/document/industry/language independent. The existing
 * semantic results remain the fallback when no exact candidate is found.
 */
export function extractStructuredReferences(query: string): string[] {
  const matches = query.match(/\b[A-Za-z][A-Za-z0-9]{0,15}(?:[._-]\d+){1,5}\b/g) ?? [];
  return [...new Set(matches.map((value) => value.toUpperCase()))];
}

function containsExactReference(text: string, identifier: string): boolean {
  // Only alphanumerics, period, underscore and hyphen are admitted above.
  const escaped = identifier.replaceAll(".", "\\.");
  // A dot followed by digits continues a clause (ABC.2.10 is not ABC.2.1).
  return new RegExp("(^|[^A-Za-z0-9._-])" + escaped + "(?![A-Za-z0-9]|[._-]\\d)", "i")
    .test(text);
}

export function matchingExactReferenceEvidence<T>(
  candidates: readonly T[],
  question: string,
  sourceText: (candidate: T) => string,
): T[] {
  const references = extractStructuredReferences(question);
  if (!references.length) return [];
  return candidates.filter((candidate) =>
    references.some((identifier) => containsExactReference(sourceText(candidate), identifier)),
  );
}

export function focusExactReferenceEvidence<T>(
  candidates: readonly T[],
  question: string,
  sourceText: (candidate: T) => string,
): T[] {
  const references = extractStructuredReferences(question);
  if (!references.length) return [...candidates];
  const matching = matchingExactReferenceEvidence(candidates, question, sourceText);
  return matching.length ? matching : [...candidates];
}
