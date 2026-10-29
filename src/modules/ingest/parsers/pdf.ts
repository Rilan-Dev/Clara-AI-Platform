import { DocumentParser, ParsedDocument } from "../types";
import type { PDFParse } from "pdf-parse";

// pdf-parse@2.x exposes PDFParse as the supported Node API. The old
// pdf-parse/lib/pdf-parse.js entrypoint belongs to the v1 package layout and
// is not present in the installed 2.4.x dependency.

type PdfJsMetadata = {
  info?: Record<string, unknown>;
};

type PdfJsDocumentCompat = {
  getMetadata?: () => Promise<PdfJsMetadata>;
};

type PdfJsLoadingTaskCompat = {
  destroy?: () => Promise<void>;
};

async function parseWithPdfJs(buffer: Buffer): Promise<ParsedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  const document = await loadingTask.promise;
  const pages: Array<{ pageNumber: number; text: string }> = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      // Keep this compatible with the installed pdfjs-dist typings. The
      // parser does not need marked-content items, and filtering them below
      // already ensures only text-bearing items are included.
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .trim();

      pages.push({ pageNumber, text }); // Blank pages must not shift citation numbers.
    }

    // Some pdfjs-dist builds expose getMetadata at runtime without declaring
    // it on the imported PDFDocumentProxy type. Use a narrow compatibility
    // guard so metadata remains available when the runtime provides it while
    // keeping TypeScript compatible with the installed declarations.
    const documentCompat = document as unknown as PdfJsDocumentCompat;
    let info: Record<string, unknown> | undefined;

    if (typeof documentCompat.getMetadata === "function") {
      try {
        const metadata = await documentCompat.getMetadata();
        info = metadata?.info;
      } catch {
        // Metadata is optional; text extraction should still succeed.
      }
    }

    return {
      text: pages.map((page) => page.text).join("\n\n"),
      pages,
      metadata: {
        pageCount: document.numPages,
        info,
        sourceType: "pdf",
        originalFilename: "",
        parser: "pdfjs",
      },
      title: typeof info?.Title === "string" ? info.Title : "",
    };
  } finally {
    // The installed pdfjs-dist typings do not expose the loading-task
    // lifecycle method, although supported runtimes may provide it. Guard the
    // optional runtime API so cleanup is performed when available without
    // making the production type-check depend on an incompatible declaration.
    const loadingTaskCompat = loadingTask as unknown as PdfJsLoadingTaskCompat;
    if (typeof loadingTaskCompat.destroy === "function") {
      await loadingTaskCompat.destroy();
    }
  }
}

export class PDFParser implements DocumentParser {
  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error(`Invalid PDF ${filename}: missing PDF signature`);
    }

    let primaryError: Error | undefined;

    let parser: PDFParse | undefined;
    try {
      // pdf-parse eagerly loads its PDF.js runtime, which expects DOMMatrix and
      // other browser canvas globals. Do not load it when the application imports
      // the parser registry at server startup; resolve it only for an actual PDF.
      const { PDFParse: PDFParseRuntime } = await import("pdf-parse");
      parser = new PDFParseRuntime({ data: buffer });
      // pdf-parse adds "-- N of M --" pagination markers to data.text by default.
      // Index only the page text itself: generated delimiters are not document
      // content and otherwise leak into embeddings, search matches, and answers.
      // Use the page-level result rather than guessing at delimiters with a
      // regex that could accidentally delete legitimate user-authored text.
      const data = await parser.getText({ pageJoiner: "\n\n" });
      const pages = Array.isArray(data.pages)
        ? data.pages.map((page, index) => ({
            pageNumber: index + 1,
            text: typeof page.text === "string" ? page.text : "",
          }))
        : [];
      const text = (
        pages.some((page) => page.text.trim())
          ? pages.map((page) => page.text).join("\n\n")
          : typeof data.text === "string" ? data.text : ""
      ).trim();

      if (text) {
        let infoData: Record<string, unknown> | undefined;
        let pageCount: number | undefined;

        try {
          const info = await parser.getInfo();
          infoData = info.info as Record<string, unknown> | undefined;
          pageCount = info.total;
        } catch {
          // Metadata is optional; text extraction should still succeed.
        }

        return {
          text,
          ...(pages.length ? { pages } : {}),
          metadata: {
            pageCount,
            info: infoData,
            sourceType: "pdf",
            originalFilename: filename,
            parser: "pdf-parse",
          },
          title:
            (typeof infoData?.Title === "string" ? infoData.Title : undefined) ||
            filename.replace(/\.pdf$/i, ""),
        };
      }

      primaryError = new Error("pdf-parse returned no readable text");
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    } finally {
      if (parser) {
        try {
          await parser.destroy();
        } catch {
          // Parser cleanup failure must not hide the primary parse/fallback path.
        }
      }
    }
    try {
      const fallback = await parseWithPdfJs(buffer);
      if (!fallback.text.trim()) {
        throw new Error("PDF contains no extractable text. It may be scanned/image-only and require OCR.");
      }

      return {
        ...fallback,
        title: fallback.title || filename.replace(/\.pdf$/i, ""),
        metadata: {
          ...fallback.metadata,
          originalFilename: filename,
          fallbackReason: primaryError?.message,
        },
      };
    } catch (fallbackError) {
      throw new Error(
        `Failed to parse PDF ${filename}: ${primaryError?.message ?? "primary parser failed"}; fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
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
