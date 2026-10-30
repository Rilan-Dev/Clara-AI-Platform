import { describe, expect, it } from "vitest";
import { assertLocalStagingUrl, evidenceCoverageAtK, pageSetCoverageAtK, pageHitRanks, validateQuestions } from "../../../../../scripts/benchmark-rag-section-staging";

describe("disposable real-PDF retrieval benchmark scoring", () => {
  it("reports first relevant page rank, recall@3 and reciprocal rank", () => {
    expect(pageHitRanks([{pageNumber:2},{pageNumber:3},{pageNumber:4}],3))
      .toEqual({hitAt1:false,hitAt3:true,reciprocalRank:0.5});
    expect(pageHitRanks([{pageNumber:7},{pageNumber:2},{pageNumber:3}],7))
      .toEqual({hitAt1:true,hitAt3:true,reciprocalRank:1});
    expect(pageHitRanks([{pageNumber:2},{pageNumber:3},{pageNumber:4}],10))
      .toEqual({hitAt1:false,hitAt3:false,reciprocalRank:0});
  });
  it("enforces known page provenance and unique bounded query IDs", () => {
    const good = [{id:"q1",question:"How is rollback performed?",expectedPage:6}];
    expect(()=>validateQuestions(good,[4,5,6])).not.toThrow();
    expect(()=>validateQuestions(good,[2,3])).toThrow();
    expect(()=>validateQuestions([...good,...good],[6])).toThrow();
    expect(()=>validateQuestions([{id:"q",question:"x".repeat(1201),expectedPage:6}],[6])).toThrow();
  });
  it("cannot connect to Clara production Qdrant or non-loopback embedding hosts", () => {
    expect(()=>assertLocalStagingUrl("http://127.0.0.1:6335/collections")).not.toThrow();
    expect(()=>assertLocalStagingUrl("http://127.0.0.1:8088/v1/embeddings")).not.toThrow();
    for(const bad of [
      "http://127.0.0.1:6333/collections",
      "http://127.0.0.1:6334/collections",
      "https://127.0.0.1:6335/collections",
      "http://localhost:6335/collections",
      "http://10.0.0.12:6335/collections",
      "http://admin:password@127.0.0.1:6335/collections",
      "http://127.0.0.1:6335/collections#ignored",
    ]) expect(()=>assertLocalStagingUrl(bad)).toThrow();
  });
  it("measures evidence from actual ranked excerpts, not just matching pages", () => {
    const chunks = [
      "Recovery Point Objectives are defined for each system.",
      "Incident response roles must be assigned and documented.",
      "Backup media shall be tested.",
    ];
    expect(evidenceCoverageAtK(chunks, ["Recovery Point Objectives", "incident response roles"], 1))
      .toEqual({ required: 2, covered: 1, recall: 0.5, complete: false });
    expect(evidenceCoverageAtK(chunks, ["Recovery Point Objectives", "incident response roles"], 3))
      .toEqual({ required: 2, covered: 2, recall: 1, complete: true });
    expect(evidenceCoverageAtK(["Recovery\n Point  Objectives"], ["recovery point objectives"], 1).recall).toBe(1);
  });
  it("does not count page-matching evidence when its clause is absent", () => {
    const result = evidenceCoverageAtK(["DO.4.2 Disaster Recovery"], ["Recovery Time Objectives"], 1);
    expect(result.covered).toBe(0);
    expect(result.complete).toBe(false);
  });
  it("requires distinct, bounded, explicit evidence labels", () => {
    const q = {id:"clause", question:"What does the plan require?", expectedPage:60,
      expectedEvidence:["Recovery Point Objectives","incident response roles"]};
    expect(()=>validateQuestions([q],[60])).not.toThrow();
    expect(()=>validateQuestions([{...q,expectedEvidence:[]}],[60])).toThrow();
    expect(()=>validateQuestions([{...q,expectedEvidence:["Recovery Point Objectives","recovery   point objectives"]}],[60])).toThrow();
    expect(()=>validateQuestions([{...q,expectedEvidence:["x"]}],[60])).toThrow();
    expect(()=>evidenceCoverageAtK([], [], 3)).toThrow();
  });
  it("records cross-page evidence completeness separately from a page hit", () => {
    expect(pageSetCoverageAtK([60,60,61],[60,61],2)).toEqual({required:2,matched:1,complete:false});
    expect(pageSetCoverageAtK([60,60,61],[60,61],3)).toEqual({required:2,matched:2,complete:true});
    expect(pageSetCoverageAtK([60,60],[60,61],6).complete).toBe(false);
    expect(()=>pageSetCoverageAtK([60],[],3)).toThrow();
  });
  it("rejects invalid page-label lists and references to unknown PDF pages", () => {
    const valid={id:"do42",question:"Explain disaster recovery",expectedPage:60,expectedPages:[60,61]};
    expect(()=>validateQuestions([valid],[60,61])).not.toThrow();
    expect(()=>validateQuestions([{...valid,expectedPages:[60,60]}],[60,61])).toThrow();
    expect(()=>validateQuestions([{...valid,expectedPages:[61]}],[60,61])).toThrow();
    expect(()=>validateQuestions([{...valid,expectedPages:[60,62]}],[60,61])).toThrow();
  });
  it("rejects empty benchmark sets", () => {
    expect(()=>validateQuestions([], [1])).toThrow();
  });
});
