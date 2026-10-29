import { RecursiveCharacterTextSplitter } from "../../../ingest/chunkers/recursive";
import type { DocumentPage } from "../../../ingest/types";

type ChunkerOptions = {
  chunkSize?: number;
  overlap?: number;
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

/** Original content with optional page evidence, independent of industry. */
export type SourcedTextChunk = { text: string; pageNumber?: number };

/** Preserve page boundaries when enabled; legacy text-only chunking stays intact. */
export function chunkDocumentWithPages(
  parsed: { text: string; pages?: ReadonlyArray<DocumentPage> },
  options?: ChunkerOptions,
): SourcedTextChunk[] {
  if (parsed.pages?.length) {
    const chunks = parsed.pages.flatMap((page) =>
      chunkText(page.text, options).map((text) => ({ text, pageNumber: page.pageNumber }))
    );
    if (chunks.length) return chunks;
  }
  return chunkText(parsed.text, options).map((text) => ({ text }));
}
