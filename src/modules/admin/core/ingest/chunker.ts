import { RecursiveCharacterTextSplitter } from "../../../ingest/chunkers/recursive";
import type { DocumentPage } from "../../../ingest/types";

type ChunkerOptions = {
  chunkSize?: number;
  overlap?: number;
  /** Opt-in standards heading boundaries; legacy output is unchanged when false. */
  sectionAware?: boolean;
};

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 150;

export function chunkText(
  input: string,
  options?: ChunkerOptions,
): string[] {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options?.chunkSize ?? DEFAULT_CHUNK_SIZE,
    chunkOverlap: options?.overlap ?? DEFAULT_OVERLAP,
  });

  return splitter.chunk(input);
}

/**
 * Split before explicit structured control headings such as "DO.4.2 Disaster
 * Recovery" or "SEC.3.1 Access Control", including flattened PDF text where
 * headings are not necessarily on separate lines.
 *
 * Do not assume any industry or policy ID; this feature recognizes a generic
 * uppercase namespace and two or more numeric components. The subsequent
 * capitalized title word separates a heading from a plain inline reference.
 * Unstructured text still uses the legacy splitter without transformation.
 *
 * No overlap is carried across section boundaries. Within each section,
 * the same recursive splitter and overlap policy are applied. The full source
 * text and numbering remain in chunks; no content is invented or deleted.
 */
export function chunkSectionAwareText(
  input: string,
  options?: ChunkerOptions,
): string[] {
  const heading = /\b[A-Z]{2,8}\.\d{1,3}(?:\.\d{1,3}){1,2}\s+(?=[A-Z][a-z]{2,}\b)/g;
  const offsets: number[] = [];
  for (const match of input.matchAll(heading)) {
    if (match.index != null) offsets.push(match.index);
  }
  if (offsets.length === 0) return chunkText(input, options);

  const boundaries = [0, ...offsets.filter((at) => at > 0), input.length];
  const chunks: string[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const span = input.slice(boundaries[i - 1], boundaries[i]).trim();
    if (span) chunks.push(...chunkText(span, options));
  }
  return chunks;
}

/** Original content with optional page evidence, independent of industry. */
export type SourcedTextChunk = { text: string; pageNumber?: number };

/** Preserve page boundaries when enabled; legacy text-only chunking stays intact. */
export function chunkDocumentWithPages(
  parsed: { text: string; pages?: ReadonlyArray<DocumentPage> },
  options?: ChunkerOptions,
): SourcedTextChunk[] {
  const split = options?.sectionAware ? chunkSectionAwareText : chunkText;
  if (parsed.pages?.length) {
    const chunks = parsed.pages.flatMap((page) =>
      split(page.text, options).map((text) => ({ text, pageNumber: page.pageNumber }))
    );
    if (chunks.length) return chunks;
  }
  return split(parsed.text, options).map((text) => ({ text }));
}
