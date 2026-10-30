import { describe, expect, it } from "vitest";
import { toPublicSourceMetadata } from "./public-source-metadata";

describe("public chat PDF citation provenance", () => {
  const source = {
    title: "SDAIA NDMO Policies Ar 001",
    snippet: "DO.4.2 disaster recovery",
    score: 0.92,
  };
  it("carries original PDF page number as a bounded field", () => {
    expect(toPublicSourceMetadata({ ...source, pageNumber: 69 }, 0)).toEqual({
      ...source, pageNumber: 69, index: 1,
    });
  });
  it.each([undefined, null, 0, -1, 0.5, Infinity, NaN, 1e100])(
    "never fabricates page number from invalid index metadata (%s)",
    (pageNumber) => {
      const result = toPublicSourceMetadata({
        ...source, pageNumber: pageNumber as number,
      }, 0);
      expect(result).not.toHaveProperty("pageNumber");
    },
  );
  it("truncates excerpts and never forwards unknown tenant/payload fields", () => {
    const src = { ...source, snippet: "a".repeat(900), pageNumber: 70,
      documentId: "private-doc", tenantId: "private-org", apiKey: "secret" };
    const output = toPublicSourceMetadata(src, 2);
    expect(output.snippet.length).toBe(200);
    expect(output.index).toBe(3);
    expect(output.pageNumber).toBe(70);
    expect(JSON.stringify(output)).not.toContain("private");
    expect(JSON.stringify(output)).not.toContain("secret");
    expect(Object.keys(output).sort()).toEqual(["index", "pageNumber", "score", "snippet", "title"]);
  });
});
