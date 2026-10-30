import { describe, expect, it } from "vitest";
import { chunkDocumentWithPages, chunkSectionAwareText, chunkText } from "./chunker";

const section = (id: string, heading: string, tail: string) =>
  `${id} ${heading} The Entity shall ${tail.repeat(12)}`;

describe("opt-in section-aware standards chunking", () => {
  it("does not mix independently headed sections even in flattened PDF text", () => {
    const source = [
      section("DO.4.1", "Data Backup Recovery", "define backup frequency and validate copies. "),
      section("DO.4.2", "Disaster Recovery", "define incident response roles and recovery objectives. "),
      section("DO.4.3", "Production Data Access Control", "create change requests and rollback plans. "),
    ].join(" P2 ");
    const chunks = chunkSectionAwareText(source, { chunkSize: 240, overlap: 30 });
    expect(chunks.length).toBeGreaterThanOrEqual(6);
    for (const chunk of chunks) {
      const topics = ["backup frequency", "incident response roles", "change requests"]
        .filter((text) => chunk.includes(text));
      expect(topics.length).toBeLessThanOrEqual(1);
      expect(chunk.length).toBeLessThanOrEqual(240);
    }
    expect(chunks.some((chunk) => chunk.includes("DO.4.1 Data Backup Recovery"))).toBe(true);
    expect(chunks.some((chunk) => chunk.includes("DO.4.2 Disaster Recovery"))).toBe(true);
    expect(chunks.some((chunk) => chunk.includes("DO.4.3 Production Data Access Control"))).toBe(true);
  });

  it("keeps page provenance and splits sections separately within a page", () => {
    const pageOne = section("DO.4.1", "Data Backup Recovery", "save backup records. ");
    const pageTwo = section("DO.4.2", "Disaster Recovery", "assign response roles. ") +
      " " + section("DO.4.3", "Production Data Access Control", "approve database changes. ");
    const chunks = chunkDocumentWithPages({
      text: pageOne + "\n" + pageTwo,
      pages: [{ pageNumber: 2, text: pageOne }, { pageNumber: 3, text: pageTwo }],
    }, { chunkSize: 230, overlap: 30, sectionAware: true });
    expect(chunks.filter((c) => c.pageNumber === 2).every((c) => !c.text.includes("Disaster Recovery"))).toBe(true);
    expect(chunks.filter((c) => c.pageNumber === 3).every((c) => !c.text.includes("Backup Recovery"))).toBe(true);
    expect(chunks.some((c) => c.pageNumber === 3 && c.text.includes("DO.4.2"))).toBe(true);
    expect(chunks.some((c) => c.pageNumber === 3 && c.text.includes("DO.4.3"))).toBe(true);
    expect(chunks.every((c) => c.text.length <= 230)).toBe(true);
  });

  it("leaves unstructured text and the default legacy path unchanged", () => {
    const plain = "General project guidance and ordinary notes. ".repeat(25);
    const opts = { chunkSize: 180, overlap: 25 };
    expect(chunkSectionAwareText(plain, opts)).toEqual(chunkText(plain, opts));
    expect(chunkDocumentWithPages({ text: plain }, opts).map((c) => c.text))
      .toEqual(chunkText(plain, opts));
  });

  it("does not mistake an inline identifier reference for a section heading", () => {
    const sentence = "Please consult DO.4.2 after reviewing the incident response notes. ".repeat(12);
    expect(chunkSectionAwareText(sentence, { chunkSize: 160, overlap: 20 }))
      .toEqual(chunkText(sentence, { chunkSize: 160, overlap: 20 }));
  });
});
