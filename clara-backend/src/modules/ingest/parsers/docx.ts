import { DocumentParser, ParsedDocument } from '../types';
import mammoth from 'mammoth';

export class DocxParser implements DocumentParser {
  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      return {
        text: result.value,
        metadata: {
          sourceType: 'docx',
          originalFilename: filename,
          warnings: result.messages
        },
        title: filename.replace(/\.docx$/i, '')
      };
    } catch (error) {
      throw new Error(`Failed to parse DOCX ${filename}: ${(error as Error).message}`);
    }
  }

  supports(filename: string, mimeType?: string): boolean {
    return filename.toLowerCase().endsWith('.docx') || 
           mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}
