import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ParserFactory } from '../factory';
import { parseDocumentFromBuffer } from '../../admin/core/ingest/document-loader';

function minimalPdf(): Buffer {
  return Buffer.from('%PDF-1.4\n% Clara parser test\n', 'ascii');
}

describe('document parser selection', () => {
  it('selects PDF by extension even when browser MIME is generic', () => {
    expect(ParserFactory.getParser('policy.pdf', 'application/octet-stream').constructor.name).toBe('PDFParser');
  });

  it('selects DOCX by extension even when browser MIME is generic', () => {
    expect(ParserFactory.getParser('policy.docx', 'application/octet-stream').constructor.name).toBe('DocxParser');
  });

  it('selects XLSX by extension even when browser MIME is generic', () => {
    expect(ParserFactory.getParser('policy.xlsx', 'application/octet-stream').constructor.name).toBe('XlsxParser');
  });
});

describe('document ingestion validation', () => {
  it('rejects a corrupt PDF instead of indexing binary bytes as UTF-8', async () => {
    await expect(
      parseDocumentFromBuffer(Buffer.from('not a pdf'), 'broken.pdf', 'application/pdf'),
    ).rejects.toThrow(/Invalid PDF/i);
  });

  it('rejects a corrupt DOCX instead of indexing ZIP bytes as UTF-8', async () => {
    await expect(
      parseDocumentFromBuffer(Buffer.from('not a docx'), 'broken.docx', 'application/octet-stream'),
    ).rejects.toThrow(/Invalid DOCX/i);
  });

  it('keeps working XLSX ingestion as a real binary parser', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Question', 'Answer'],
      ['What is Clara?', 'An AI insurance assistant'],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'FAQs');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await parseDocumentFromBuffer(buffer, 'faq.xlsx', 'application/octet-stream');
    expect(result.text).toContain('What is Clara?');
    expect(result.text).toContain('An AI insurance assistant');
  });

  it('does not silently treat a binary PDF as text when PDF parsing fails', async () => {
    await expect(
      parseDocumentFromBuffer(minimalPdf(), 'invalid.pdf'),
    ).rejects.toThrow(/Failed to parse PDF|Invalid PDF/i);
  });
});
