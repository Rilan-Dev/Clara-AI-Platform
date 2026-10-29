import { describe, expect, it } from "vitest";
import { extractStructuredReferences, focusExactReferenceEvidence } from "./reference-evidence";

type Candidate = { id: string; snippet: string; score: number };
const choose = (candidates: Candidate[], question: string) =>
  focusExactReferenceEvidence(candidates, question, (hit) => hit.snippet);

describe("generic exact-identifier relevance of RAG evidence", () => {
  it("filters misleading high-score irrelevant sections when exact clauses exist", () => {
    const sources: Candidate[] = [
      { id: "relevant-en", score: 0.811, snippet: "DO.2.1 Storage and Retention Policy: 1. Storage conditions 2. Retention 3. Destruction 4." },
      { id: "unrelated-1", score: 0.805, snippet: "DCM.2.4 Employee training on document management." },
      { id: "unrelated-2", score: 0.797, snippet: "FOI.1.1 Freedom of Information regulations." },
      { id: "unrelated-3", score: 0.794, snippet: "DCM.2.1 Document Management policy." },
      { id: "unrelated-4", score: 0.791, snippet: "FOI.3.6 Processing fees." },
      { id: "relevant-ar", score: 0.789, snippet: "رقم المواصفة\nDO.2.1\nسياسة التخزين 1 2 3 4" },
    ];
    expect(choose(sources, "What does policy DO.2.1 require?").map((s) => s.id))
      .toEqual(["relevant-en", "relevant-ar"]);
  });

  it("does not match a reference prefix, longer number, or different field", () => {
    const sources: Candidate[] = [
      { id: "longer-number", score: 0.9, snippet: "DO.2.10" },
      { id: "nested-number", score: 0.85, snippet: "DO.2.1.4" },
      { id: "unrelated-prefix", score: 0.83, snippet: "XDO.2.1" },
      { id: "exact", score: 0.8, snippet: "Control DO.2.1: Data policy" },
    ];
    expect(choose(sources, "DO.2.1").map((s) => s.id)).toEqual(["exact"]);
  });

  it("preserves semantic results when the user asked a normal question", () => {
    const results: Candidate[] = [
      { id: "first", score: 0.8, snippet: "Business hours" },
      { id: "second", score: 0.7, snippet: "Store addresses" },
    ];
    expect(choose(results, "When are your stores open?")).toEqual(results);
  });

  it("preserves semantic fallback when no exact-referenced candidate was retrieved", () => {
    const results: Candidate[] = [{ id: "a", score: 0.6, snippet: "General project lifecycle policy" }];
    expect(choose(results, "How do I comply with SEC-4.3?")).toEqual(results);
  });

  it("works with multiple reference identifiers and is case-insensitive", () => {
    const results: Candidate[] = [
      { id: "a", score: 0.9, snippet: "Clause SYS-4.2 procedures" },
      { id: "b", score: 0.85, snippet: "CONTROL ABC.1.1 approval procedure" },
      { id: "c", score: 0.8, snippet: "Unrelated policies" },
    ];
    expect(extractStructuredReferences("Compare sys-4.2 and abc.1.1")).toEqual(["SYS-4.2", "ABC.1.1"]);
    expect(choose(results, "Compare sys-4.2 and abc.1.1").map((s) => s.id)).toEqual(["a", "b"]);
  });
});
