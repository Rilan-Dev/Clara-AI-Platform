#!/usr/bin/env node
/**
 * Zero-dependency TEI reranking smoke probe. Run INSIDE clara-backend:
 *   docker compose exec clara-backend node scripts/probe-rag-reranker.mjs
 *
 * Uses fixed public example strings only; does not read KB data or credentials.
 */
const endpoint = process.env.RAG_RERANK_URL?.trim();
if (!endpoint) {
  console.error("RAG_RERANK_URL is empty; configure the private TEI /rerank endpoint.");
  process.exitCode = 2;
} else {
  const question = "Which planet is commonly called the red planet?";
  const texts = [
    "Mars is often called the Red Planet because of iron oxide on its surface.",
    "Potatoes are grown in many regions of the world.",
  ];
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.RAG_RERANK_API_KEY
          ? { authorization: "Bearer " + process.env.RAG_RERANK_API_KEY }
          : {}),
      },
      body: JSON.stringify({ query: question, texts, truncate: true, return_text: false, raw_scores: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("TEI returned HTTP " + response.status);
    const body = await response.json();
    const ranks = Array.isArray(body) ? body : body?.ranks;
    if (
      !Array.isArray(ranks) ||
      ranks.length !== 2 ||
      new Set(ranks.map((rank) => rank.index)).size !== 2 ||
      ranks.some((rank) => ![0, 1].includes(rank.index) || !Number.isFinite(rank.score))
    ) {
      throw new Error("Malformed TEI ranking response");
    }
    const expected = ranks.find((rank) => rank.index === 0);
    const negative = ranks.find((rank) => rank.index === 1);
    if (!(expected.score > negative.score)) {
      throw new Error("Model did not place the relevant Mars evidence first");
    }
    console.log("RAG reranker smoke PASS: endpoint responded, scores complete, relevant evidence ranked first.");
  } catch (error) {
    // Never dump upstream response bodies, request headers, or tokens.
    console.error("RAG reranker smoke FAIL:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  }
}
