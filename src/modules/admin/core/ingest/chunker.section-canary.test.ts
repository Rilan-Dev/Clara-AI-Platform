import { describe, expect, it } from "vitest";
import { evaluateCanary, syntheticFixture } from "../../../../../scripts/rag-section-canary";

describe("offline section-aware chunk canary", () => {
  it("isolates structured headings while preserving all seven synthetic recovery requirements", () => {
    const result = evaluateCanary(syntheticFixture());
    expect(result.sectionCount).toBe(3);
    expect(result.pageCount).toBe(2);
    expect(result.baseline.mixedHeadingChunks).toBeGreaterThan(0);
    expect(result.candidate.mixedHeadingChunks).toBe(0);
    expect(result.candidate.coveredRequiredPhrases).toBe(7);
    expect(result.candidate.coveredHeadings).toBe(3);
    expect(result.candidate.chunksWithoutSourcePage).toBe(0);
    expect(result.candidate.allChunksWithinSize).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.semanticRetrievalTested).toBe(false);
    expect(result.vectorIndexTouched).toBe(false);
    expect(result.productionKbTouched).toBe(false);
  });

  it("retains behavior for an unstructured page without control headings", () => {
    const f = { pages: [{ pageNumber: 9, text: "General notes without any structured headings. ".repeat(15) }] };
    const result = evaluateCanary(f, 210, 25);
    expect(result.sectionCount).toBe(0);
    expect(result.baseline).toEqual(result.candidate);
    expect(result.passed).toBe(true);
  });

  it("fails closed when required supporting language is absent", () => {
    const f = syntheticFixture();
    f.requiredPhrases = [...(f.requiredPhrases ?? []), "not included in the source material"];
    const result = evaluateCanary(f);
    expect(result.candidate.missingRequiredPhraseCount).toBe(1);
    expect(result.gates.requirementPhraseCoverage).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("never includes raw source phrases, private labels or original text in the report", () => {
    const fixture = {
      pages: [{ pageNumber: 2, text: "DO.4.2 Disaster Recovery PRIVATE_SOURCE_TEXT shall remain private." }],
      requiredPhrases: ["PRIVATE_SOURCE_TEXT"],
    };
    const json = JSON.stringify(evaluateCanary(fixture));
    expect(json).not.toContain("PRIVATE_SOURCE_TEXT");
    expect(json).not.toContain("Disaster Recovery");
    expect(json).not.toContain("DO.4.2");
    expect(json).toContain('"source":"local-input-only"');
  });

  it("rejects invalid or unsafe local fixture inputs and chunk arguments", () => {
    expect(() => evaluateCanary({ pages: [] })).toThrow();
    expect(() => evaluateCanary({ pages: [{ pageNumber: 0, text: "hello" }] })).toThrow();
    expect(() => evaluateCanary(syntheticFixture(), 80, 20)).toThrow();
    expect(() => evaluateCanary(syntheticFixture(), 200, 200)).toThrow();
    expect(() => evaluateCanary({
      pages: [{ pageNumber: 2, text: "hello" }],
      requiredPhrases: [""],
    })).toThrow();
  });

  it("does not claim multilingual heading coverage from an unsupported script", () => {
    const f = {
      pages: [{ pageNumber: 1, text: "٤.٢ متطلبات التعافي. يجب أن تحدد الجهة المسؤوليات." }],
      requiredPhrases: ["يجب أن تحدد الجهة المسؤوليات"],
    };
    const result = evaluateCanary(f);
    expect(result.sectionCount).toBe(0);
    expect(result.baseline).toEqual(result.candidate);
    expect(result.semanticRetrievalTested).toBe(false);
  });
});
