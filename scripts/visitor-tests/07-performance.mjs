import { performance } from "node:perf_hooks";
import { BASE_URL, DEMO_AUTH, ORIGIN, QUERY, assert } from "./_lib.mjs";

const total = Number(process.env.CLARA_PERF_REQUESTS || 30);
const concurrency = Math.max(1, Number(process.env.CLARA_PERF_CONCURRENCY || 5));
const endpoint = process.env.CLARA_PERF_ENDPOINT || "/api/embed/config";
const includeChat = process.env.CLARA_PERF_CHAT === "1";

async function hit(path) {
  const started = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: path.includes("/chat") ? "POST" : "GET",
    headers: { Authorization: `Bearer ${DEMO_AUTH}`, Origin: ORIGIN, "Content-Type": "application/json" },
    body: path.includes("/chat") ? JSON.stringify({ messages: [{ role: "user", content: QUERY }], sessionId: `perf-${Date.now()}` }) : undefined,
  });
  const text = await response.text();
  return { status: response.status, ms: performance.now() - started, text };
}

async function run(path, count) {
  const results = [];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= count) return;
      try { results[i] = await hit(path); }
      catch (error) { results[i] = { status: 0, ms: 0, error: String(error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker));
  return results;
}

function report(path, results) {
  const ok = results.filter(r => r.status >= 200 && r.status < 300);
  const failures = results.filter(r => !(r.status >= 200 && r.status < 300));
  const values = ok.map(r => r.ms).sort((a,b) => a-b);
  const pct = p => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : NaN;
  console.log(`\nPERF | ${path}`);
  console.log(`requests=${results.length} success=${ok.length} failure=${failures.length} concurrency=${concurrency}`);
  if (values.length) console.log(`latency_ms min=${values[0].toFixed(0)} p50=${pct(.50).toFixed(0)} p95=${pct(.95).toFixed(0)} max=${values.at(-1).toFixed(0)}`);
  if (failures.length) for (const f of failures.slice(0, 5)) console.log(`FAIL HTTP=${f.status} ${f.error || f.text.slice(0, 180)}`);
  assert(failures.length === 0, `${path}: ${failures.length}/${results.length} requests failed`);
}

console.log("\n[07] PERFORMANCE / CONCURRENCY / LATENCY\n");
const configResults = await run(endpoint, total);
report(endpoint, configResults);
if (includeChat) {
  const chatCount = Number(process.env.CLARA_PERF_CHAT_REQUESTS || 5);
  const chatResults = await run("/api/embed/chat", chatCount);
  report("/api/embed/chat", chatResults);
}
console.log("PASS | performance smoke completed");
console.log("TIP | Start with CLARA_PERF_REQUESTS=30 CLARA_PERF_CONCURRENCY=5. Set CLARA_PERF_CHAT=1 only when you intentionally want live LLM cost/latency measurements.");
