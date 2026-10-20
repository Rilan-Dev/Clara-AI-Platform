import { describe, expect, it } from 'vitest';
import { RecursiveCharacterTextSplitter } from '../chunkers/recursive';

describe('recursive text chunking', () => {
  it('aligns overlap to a word boundary instead of starting the next chunk mid-word', () => {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 100,
      chunkOverlap: 17,
    });
    const input = `${'alpha '.repeat(13).trim()}\n\n${'bravo '.repeat(12).trim()}`;
    const chunks = splitter.chunk(input);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain('alpha');
    expect(chunks[1]).toMatch(/^(alpha|bravo)\b/);
    expect(chunks[1]).toContain('bravo');
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });

  it('supports zero overlap without creating broken prefix fragments', () => {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 100,
      chunkOverlap: 0,
    });
    const input = `${'alpha '.repeat(13).trim()}\n\n${'bravo '.repeat(12).trim()}`;
    const chunks = splitter.chunk(input);

    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toBe('bravo '.repeat(12).trim());
  });
});
