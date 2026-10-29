import { describe, expect, it } from "vitest";
import { chunkDocumentWithPages, chunkText } from "./chunker";

describe("source page-aware ingestion", () => {
  it("does not combine different page contents, keeping correct citations", () => {
    const first = "alpha governance requirement ".repeat(20).trim();
    const second = "beta engineering specification ".repeat(20).trim();
    const chunks = chunkDocumentWithPages({
      text: first + "\n\n" + second,
      pages: [{ pageNumber: 1, text: first }, { pageNumber: 2, text: second }],
    }, { chunkSize: 120, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.some((chunk) => chunk.pageNumber === 1)).toBe(true);
    expect(chunks.some((chunk) => chunk.pageNumber === 2)).toBe(true);
    expect(chunks.filter((chunk) => chunk.pageNumber === 1).every((chunk) => !chunk.text.includes("beta"))).toBe(true);
    expect(chunks.filter((chunk) => chunk.pageNumber === 2).every((chunk) => !chunk.text.includes("alpha"))).toBe(true);
  });

  it("leaves ordinary non-page document chunking unchanged", () => {
    const text = "ordinary plain text content ".repeat(15);
    const options = { chunkSize: 100, overlap: 15 };
    const chunks = chunkDocumentWithPages({ text }, options);
    expect(chunks.map((chunk) => chunk.text)).toEqual(chunkText(text, options));
    expect(chunks.every((chunk) => chunk.pageNumber === undefined)).toBe(true);
  });

  it("does not shift page numbers after an empty scanned page", () => {
    const chunks = chunkDocumentWithPages({
      text: "answer",
      pages: [{ pageNumber: 1, text: "" }, { pageNumber: 2, text: "answer" }],
    });
    expect(chunks).toEqual([{ text: "answer", pageNumber: 2 }]);
  });
});
