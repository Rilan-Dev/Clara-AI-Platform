import { TextChunker, ChunkerOptions } from '../types';

export class RecursiveCharacterTextSplitter implements TextChunker {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];

  constructor(options?: ChunkerOptions) {
    this.chunkSize = options?.chunkSize ?? 1000;
    this.chunkOverlap = options?.chunkOverlap ?? 200;
    // Default separators from largest to smallest semantic unit
    this.separators = ["\n\n", "\n", ". ", "? ", "! ", " ", ""];
  }

  chunk(text: string): string[] {
    return this.splitText(text, this.separators);
  }

  /**
   * Overlap is optional context, not new source content. Align it to the next
   * whitespace boundary so search chunks never begin with a fragment of a
   * previous word solely because of the configured overlap length.
   */
  private overlapSuffix(text: string): string {
    if (this.chunkOverlap <= 0) return "";
    const start = Math.max(0, text.length - this.chunkOverlap);
    if (start === 0) return text;
    const tail = text.slice(start);
    const boundary = tail.search(/\s/u);
    return boundary < 0 ? "" : tail.slice(boundary + 1).trimStart();
  }

  private splitText(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];
    
    // Find the appropriate separator
    let separator = separators[separators.length - 1];
    for (const s of separators) {
      if (s === "") {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        break;
      }
    }

    // Split the text
    const splits = separator ? text.split(separator) : [text];
    
    // Merge splits into chunks
    let currentChunk = "";
    
    for (const split of splits) {
      const nextChunk = currentChunk ? currentChunk + separator + split : split;
      
      if (nextChunk.length <= this.chunkSize) {
        currentChunk = nextChunk;
      } else {
        if (currentChunk) {
          finalChunks.push(currentChunk);
          // Start new chunk with overlap
          currentChunk = this.overlapSuffix(currentChunk) + separator + split;
          
          // If the new chunk is still too large, we need to split it further
          if (currentChunk.length > this.chunkSize) {
             // Find next separators to use
             const nextSeparators = separators.slice(separators.indexOf(separator) + 1);
             if (nextSeparators.length > 0) {
                 const subChunks = this.splitText(split, nextSeparators);
                 finalChunks.push(...subChunks.slice(0, -1));
                 currentChunk = subChunks[subChunks.length - 1] || "";
             } else {
                 // Fallback: hard split
                 for (let i = 0; i < split.length; i += this.chunkSize) {
                     finalChunks.push(split.substring(i, i + this.chunkSize));
                 }
                 currentChunk = "";
             }
          }
        } else {
          // The split itself is larger than chunk size
          const nextSeparators = separators.slice(separators.indexOf(separator) + 1);
          if (nextSeparators.length > 0) {
            finalChunks.push(...this.splitText(split, nextSeparators));
          } else {
            // Fallback: hard split
            for (let i = 0; i < split.length; i += this.chunkSize) {
              finalChunks.push(split.substring(i, i + this.chunkSize));
            }
          }
        }
      }
    }
    
    if (currentChunk) {
      finalChunks.push(currentChunk);
    }

    return finalChunks.map(c => c.trim()).filter(c => c.length > 0);
  }
}
