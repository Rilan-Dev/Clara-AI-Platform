import path from "node:path";
import { ParserFactory } from "../../../ingest/factory";

export type LoadedDocument = {
  title: string;
  text: string;
  metadata: Record<string, unknown>;
};

/**
 * Strips lone surrogate characters that cause JSON serialization errors (HTTP 400 from Qdrant).
 */
function sanitizeString(str: string): string {
  if (!str) return str;
  // Step 1: Use native toWellFormed if available (Node 20+) to fix basic surrogate issues
  let sanitized = typeof str.toWellFormed === 'function' ? str.toWellFormed() : str;
  
  // Step 2: Aggressively strip remaining invalid characters to ensure valid JSON payload
  // Removes:
  // - ASCII control characters except tab (x09), newline (x0A), carriage return (x0D)
  // - Lone surrogates and replacement characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD\uD800-\uDFFF]/g, "");
  return sanitized;
}

export async function parseDocumentFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<LoadedDocument> {
  try {
    const parser = ParserFactory.getParser(filename, mimeType);
    const parsed = await parser.parse(buffer, filename, mimeType);
    
    return {
      title: sanitizeString(parsed.title || path.basename(filename, path.extname(filename))),
      text: sanitizeString(parsed.text),
      metadata: parsed.metadata,
    };
  } catch (error) {
    console.error(`Error parsing document ${filename}:`, error);
    // Fallback to raw text if parsing fails
    return {
      title: sanitizeString(path.basename(filename, path.extname(filename))),
      text: sanitizeString(buffer.toString("utf-8")),
      metadata: {
        filename,
        extension: path.extname(filename).toLowerCase(),
        format: "unknown",
        error: (error as Error).message
      },
    };
  }
}

export async function loadFileAsText(filePath: string): Promise<LoadedDocument> {
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(filePath);
  return parseDocumentFromBuffer(buffer, path.basename(filePath));
}
