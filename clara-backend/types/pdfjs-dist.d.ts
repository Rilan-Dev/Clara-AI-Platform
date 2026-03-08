declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PDFPageProxy {
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFLoadingTask<T = PDFDocumentProxy> {
    promise: Promise<T>;
  }

  export const GlobalWorkerOptions: {
    workerSrc: unknown;
    disableWorker?: boolean;
  };

  export function getDocument(
    options:
      | string
      | {
          data: ArrayBuffer | ArrayBufferView;
          disableWorker?: boolean;
          useWorkerFetch?: boolean;
          isEvalSupported?: boolean;
          disableFontFace?: boolean;
        },
  ): PDFLoadingTask;
}
