import { authHeaders, expectHttp, assert, QUERY } from "./_lib.mjs";

console.log("\n[03] RAG RETRIEVAL / EMBEDDINGS / QDRANT\n");
const r = await expectHttp("demo raw RAG search", "/api/embed/search", [200], {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify({ query: QUERY, limit: 6 }),
});
assert(r.json && r.json.kbId, "RAG response must identify the server-selected KB");
assert(Array.isArray(r.json.sources), "RAG response must contain sources[]");
assert(r.json.sources.length > 0, "RAG returned zero sources; check ingestion/Qdrant/indexing");
assert(r.json.context, "RAG response must contain context");
console.log(`PASS | RAG sources=${r.json.sources.length} | kbId=${r.json.kbId}`);
for (const s of r.json.sources.slice(0, 3)) console.log(`  source ${s.index}: ${s.title} score=${Number(s.score).toFixed(3)}`);
