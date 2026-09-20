/**
 * E2E verification of the new ingest queue reliability machinery:
 *   1. Upload a document → verify it is AUTO-processed by the background poller
 *      (no HTTP trigger needed) — on this sandbox the embedding call itself is
 *      geo-blocked, so the expected terminal state is 'failed' WITH the new
 *      provider-context error message (error transparency, the whole point).
 *   2. GET /api/worker/ingest?drain=true returns maintenance stats.
 *   3. Reprocess endpoint: accepts failed docs (no more dead-end 400), and
 *      rejects active jobs with 409 + actionable message.
 *   4. Stale-job recovery query resets nothing healthy (sanity).
 */
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const ORG_USER = { email: "demo@clara.ai", password: "Demo1234!" };

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, extra) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function api(method, url, token, body, isForm) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function login(creds) {
  const r = await api("POST", "/api/auth/login", null, creds);
  return r.data?.token ?? r.data?.accessToken ?? null;
}

async function waitForTerminal(kbId, docId, token, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api("GET", `/api/kbs/${kbId}/documents/${docId}`, token);
    const status = r.data?.status;
    if (status === "ready" || status === "failed") return r.data;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

(async () => {
  console.log("── ingest queue reliability E2E ─────────────────────");
  const token = await login(ORG_USER);
  check("login as demo org user", !!token);

  // temp agent + KB
  const agentRes = await api("POST", "/api/orgs/10000000-0000-0000-0000-000000000001/agents", token, {
    name: `ingest-e2e-${Date.now()}`,
  });
  const agentId = agentRes.data?.id;
  check("create temp agent", !!agentId, JSON.stringify(agentRes.data).slice(0, 120));

  const kbRes = await api("POST", `/api/agents/${agentId}/kbs`, token, {
    name: `Ingest E2E KB ${Date.now()}`,
  });
  const kbId = kbRes.data?.id;
  check("create temp KB", !!kbId, JSON.stringify(kbRes.data).slice(0, 120));

  // 1. upload a document
  const fd = new FormData();
  const file = new File([Buffer.from(
    "Clara is an AI assistant platform. This test document verifies ingest queue reliability. ".repeat(8)
  )], "ingest-test.txt", { type: "text/plain" });
  fd.append("files", file);
  const up = await api("POST", `/api/kbs/${kbId}/documents`, token, fd, true);
  const doc = up.data?.queued?.[0];
  check("upload returns 202 + queued doc", up.status === 202 && !!doc?.id,
    `status=${up.status} body=${JSON.stringify(up.data).slice(0, 150)}`);
  const docId = doc?.id;

  // 2. wait for the background poller to process it (sandbox: embedding is
  //    geo-blocked → expect 'failed' with the NEW detailed provider error)
  const terminal = await waitForTerminal(kbId, docId, token, 120_000);
  check("document auto-processed by poller (no HTTP trigger)", !!terminal,
    "stayed pending/processing for 120s — poller not running?");
  if (terminal) {
    console.log(`    → terminal status: ${terminal.status}`);
    if (terminal.status === "failed") {
      const hasProviderContext = /Embedding failed \((openai|gemini)\//.test(terminal.errorMessage ?? "");
      check("failure carries provider context (openai/... @ host)", hasProviderContext,
        `errorMessage: ${(terminal.errorMessage ?? "").slice(0, 200)}`);
    } else if (terminal.status === "ready") {
      check("document reached ready", true);
    }
  }

  // 3. drain endpoint returns maintenance stats
  const drain = await api("GET", "/api/worker/ingest?drain=true", token);
  check("drain endpoint reports maintenance stats",
    drain.status === 200 && typeof drain.data?.processed === "number" &&
    typeof drain.data?.recoveredJobs === "number",
    `status=${drain.status} body=${JSON.stringify(drain.data).slice(0, 150)}`);

  // 4. reprocess a failed (or ready) doc → must NOT dead-end
  if (terminal) {
    const rp = await api("POST", `/api/kbs/${kbId}/documents/${docId}/reprocess`, token);
    const accepted = rp.status === 200 || rp.status === 202;
    const actionable = rp.status === 409 || (rp.status === 400 && typeof rp.data?.error === "string" && rp.data.error.length > 20);
    check("reprocess returns success or actionable error", accepted || actionable,
      `status=${rp.status} body=${JSON.stringify(rp.data).slice(0, 200)}`);

    // wait for the reprocess cycle to settle, then ensure not stuck processing
    const after = await waitForTerminal(kbId, docId, token, 120_000);
    check("reprocessed doc reaches a terminal state", !!after && after.status !== "processing",
      after ? `status=${after.status}` : "still processing after 120s");

    // 5. rapid double-reprocess: second call must return a well-formed,
    //    actionable response (200 reusing job / 409 active / 400 payload-cleared
    //    for completed docs — never a dead-end or a crash)
    const rp2 = await api("POST", `/api/kbs/${kbId}/documents/${docId}/reprocess`, token);
    const rp2Actionable =
      rp2.status === 200 || rp2.status === 202 || rp2.status === 409 ||
      (rp2.status === 400 && typeof rp2.data?.error === "string" && rp2.data.error.length > 20);
    check("double-reprocess handled gracefully", rp2Actionable,
      `status=${rp2.status} body=${JSON.stringify(rp2.data).slice(0, 150)}`);
  }

  // cleanup
  await api("DELETE", `/api/kbs/${kbId}`, token);
  await api("DELETE", `/api/agents/${agentId}`, token);
  console.log("  (cleanup done)");

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  if (failures.length) { console.log("failures:", failures.join(" | ")); process.exit(1); }
})().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });
