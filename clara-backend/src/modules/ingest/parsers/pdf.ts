import { DocumentParser, ParsedDocument } from "../types";

// Require the internal lib file directly to bypass pdf-parse's broken `module.parent` check in index.js
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require("pdf-parse/lib/pdf-parse.js");

const pdfParse = pdfParseModule.default || pdfParseModule;

export class PDFParser implements DocumentParser {
  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    try {
      // pdf-parse@1.1.1 takes the Buffer directly and operates without worker threads
      const data = await pdfParse(buffer);

      return {
        text: data.text,
        metadata: {
          pageCount: data.numpages,
          info: data.info,
          sourceType: "pdf",
          originalFilename: filename,
        },
        title:
          (data.info?.Title as string | undefined) ||
          filename.replace(/\.pdf$/i, ""),
      };
    } catch (error) {
      throw new Error(
        `Failed to parse PDF ${filename}: ${(error as Error).message}`
      );
    }
  }

  supports(filename: string, mimeType?: string): boolean {
    return (
      filename.toLowerCase().endsWith(".pdf") ||
      mimeType === "application/pdf"
    );
  }
}
