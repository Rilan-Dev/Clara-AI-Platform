import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ParserFactory } from '../factory';
import { PDFParser } from '../parsers/pdf';
import { parseDocumentFromBuffer } from '../../admin/core/ingest/document-loader';

function buildTestPdf(pageCount: 1 | 2 = 1): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 50 >>\nstream\nBT\n/F1 18 Tf\n72 720 Td\n(Clara PDF test) Tj\nET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  if (pageCount === 2) {
    objects[1] = '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>';
    const secondText = 'BT\n/F1 18 Tf\n72 720 Td\n(Second PDF page) Tj\nET\n';
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
      `<< /Length ${Buffer.byteLength(secondText, 'ascii')} >>\nstream\n${secondText}endstream`,
    );
  }

  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  let position = chunks[0].length;

  for (let index = 0; index < objects.length; index += 1) {
    const object = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    offsets.push(position);
    chunks.push(object);
    position += object.length;
  }

  const xrefOffset = position;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  for (let index = 1; index <= objects.length; index += 1) {
    chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(''), 'ascii');
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
  it('extracts text from a real generated PDF', async () => {
    const result = await new PDFParser().parse(buildTestPdf(), 'policy.pdf');
    expect(result.text).toContain('Clara PDF test');
  });

  it('keeps multi-page PDF text without pdf-parse generated pagination markers', async () => {
    const parsed = await new PDFParser().parse(buildTestPdf(2), 'policy.pdf');
    expect(parsed.text).toContain('Clara PDF test');
    expect(parsed.text).toContain('Second PDF page');
    expect(parsed.text.indexOf('Clara PDF test')).toBeLessThan(parsed.text.indexOf('Second PDF page'));
    expect(parsed.text).not.toMatch(/--\s*\d+\s+of\s+2\s*--/);
    expect(parsed.metadata.pageCount).toBe(2);
    expect(parsed.pages?.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(parsed.pages?.[0]?.text).toContain('Clara PDF test');
    expect(parsed.pages?.[1]?.text).toContain('Second PDF page');
    const loaded = await parseDocumentFromBuffer(buildTestPdf(2), 'policy.pdf');
    expect(loaded.pages?.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(loaded.pages?.[1]?.text).toContain('Second PDF page');
  });

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

  it('preserves empty spreadsheet cells so later values remain in their original columns', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Invoice', 'Owner', 'Amount'],
      ['INV-001', '', 250],
      ['INV-002', 'Alice', 300],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Invoices');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const parsed = await parseDocumentFromBuffer(buffer, 'invoices.xlsx');
    expect(parsed.text).toContain('Invoice\tOwner\tAmount');
    expect(parsed.text).toContain('INV-001\t\t250');
    expect(parsed.text).toContain('INV-002\tAlice\t300');
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
});
