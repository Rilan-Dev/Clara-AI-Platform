import { DocumentParser, ParsedDocument } from '../types';
import * as XLSX from 'xlsx';

export class XlsxParser implements DocumentParser {
  supports(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls') return true;
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) return true;
    return false;
  }

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sections: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length === 0) continue;

        const lines: string[] = [`[Sheet: ${sheetName}]`];

        for (const row of rows) {
          // Empty cells are meaningful positions in a spreadsheet. Filtering
          // them shifts later values into the wrong columns (e.g. a missing
          // owner can appear to be an amount). Trim only trailing empty cells.
          const cells = (row as unknown[])
            .map((cell) => String(cell ?? '').trim());
          let lastNonEmpty = cells.length - 1;
          while (lastNonEmpty >= 0 && cells[lastNonEmpty] === '') lastNonEmpty--;
          if (lastNonEmpty >= 0) {
            lines.push(cells.slice(0, lastNonEmpty + 1).join('\t'));
          }
        }

        if (lines.length > 1) {
          sections.push(lines.join('\n'));
        }
      }

      const text = sections.join('\n\n');

      if (!text.trim()) {
        throw new Error('Spreadsheet appears to be empty or contains no readable text');
      }

      return {
        title: filename.replace(/\.(xlsx|xls)$/i, ''),
        text,
        metadata: {
          sourceType: 'xlsx',
          originalFilename: filename,
          sheetCount: workbook.SheetNames.length,
          sheetNames: workbook.SheetNames,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse spreadsheet ${filename}: ${(error as Error).message}`);
    }
  }
}
