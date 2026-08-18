import { authHeaders, request, assert, QUERY, SESSION_ID } from "./_lib.mjs";

console.log("\n[04] RAG CHAT / STREAM / GROUNDED ANSWER\n");
const r = await request("/api/embed/chat", {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify({ messages: [{ role: "user", content: QUERY }], sessionId: SESSION_ID }),
});
assert(r.status === 200, `Demo chat must return 200, got ${r.status}: ${r.text.slice(0, 500)}`);
assert(r.response.headers.get("content-type")?.includes("application/x-ndjson"), "Chat must stream NDJSON");
const events = r.text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const sources = events.find(e => e.type === "sources");
const tokens = events.filter(e => e.type === "token").map(e => String(e.payload ?? "")).join("");
const done = events.some(e => e.type === "done");
const error = events.find(e => e.type === "error");
assert(!error, `Chat stream returned an error: ${JSON.stringify(error)}`);
assert(sources && Array.isArray(sources.payload) && sources.payload.length > 0, "Chat stream must return RAG sources");
assert(tokens.trim().length > 0, "Chat stream must contain assistant tokens");
assert(done, "Chat stream must terminate with done");
console.log(`PASS | chat stream | sources=${sources.payload.length} | answerChars=${tokens.length} | events=${events.length}`);
console.log(`ANSWER | ${tokens.replace(/\s+/g, " ").slice(0, 500)}`);
