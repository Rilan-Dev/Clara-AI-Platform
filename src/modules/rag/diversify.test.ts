import { describe, expect, it } from "vitest";
import { candidatePoolSize, diversifyByDocument } from "./diversify";

type Hit = { id: string; doc?: string; score: number };
const select = (items: Hit[], topK: number) => diversifyByDocument(items, {
  getDocId: (item) => item.doc,
  getScore: (item) => item.score,
  topK,
});

describe("existing document diversification reranking", () => {
  it("requests a bounded five-times candidate pool", () => {
    expect(candidatePoolSize(4)).toBe(20);
    expect(candidatePoolSize(6)).toBe(30);
    expect(candidatePoolSize(20)).toBe(30);
  });

  it("selects from smaller documents without corrupting similarity order", () => {
    const hits: Hit[] = [
      { id: "a1", doc: "a", score: 0.99 },
      { id: "a2", doc: "a", score: 0.98 },
      { id: "a3", doc: "a", score: 0.97 },
      { id: "b1", doc: "b", score: 0.96 },
      { id: "c1", doc: "c", score: 0.95 },
    ];
    const actual = select(hits, 3);
    expect(actual.map((hit) => hit.id)).toEqual(["a1", "b1", "c1"]);
    expect(actual.map((hit) => hit.score)).toEqual([0.99, 0.96, 0.95]);
    expect(hits.map((hit) => hit.id)).toEqual(["a1", "a2", "a3", "b1", "c1"]);
  });

  it("does not drop evidence from a single document or filtered search", () => {
    const hits: Hit[] = [
      { id: "a1", doc: "a", score: 0.99 },
      { id: "a2", doc: "a", score: 0.97 },
      { id: "a3", doc: "a", score: 0.94 },
    ];
    expect(select(hits, 2).map((hit) => hit.id)).toEqual(["a1", "a2"]);
  });

  it("uses model scores to choose and order diversified results when supplied", () => {
    const hits = [
      { id: "a", doc: "a", score: 0.9, rerankScore: 0.2 },
      { id: "b", doc: "b", score: 0.8, rerankScore: 0.8 },
      { id: "c", doc: "a", score: 0.7, rerankScore: 0.1 },
    ].sort((a, b) => b.rerankScore - a.rerankScore);
    const actual = diversifyByDocument(hits, {
      getDocId: (hit) => hit.doc,
      getScore: (hit) => hit.rerankScore,
      topK: 2,
    });
    expect(actual.map((hit) => hit.id)).toEqual(["b", "a"]);
    expect(actual[0]?.score).toBe(0.8);
  });
});
