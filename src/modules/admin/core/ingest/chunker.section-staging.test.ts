import { describe, expect, it } from "vitest";
import { assertLocalStagingUrl, pageHitRanks, validateQuestions } from "../../../../../scripts/benchmark-rag-section-staging";

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
  it("rejects empty benchmark sets", () => {
    expect(()=>validateQuestions([], [1])).toThrow();
  });
});
