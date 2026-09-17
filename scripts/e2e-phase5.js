#!/usr/bin/env node
/**
 * e2e-phase5.js — Phase 5 (Production Data Seeding & Demo Content) acceptance suite.
 *
 * Verifies every Phase 5 acceptance criterion from Doc/ClaraAI-Implementation-Plan.md:
 *
 *   P5-1  npm run seed runs to completion with no errors
 *         → re-runs the seed (idempotency) and asserts exit 0 + "already present"
 *   P5-2  Both organisations appear in platform admin dashboard
 *         → admin login → /api/platform/orgs lists Omen + TechVision; stats count them
 *   P5-3  Logging in as omen-admin@omeninsurance.com shows Omen's data
 *         → org dashboard: 1 agent, 3 KBs, 3 ready documents, ~500 queries (30d)
 *   P5-4  Logging in as techvision-admin@techvision.io shows TechVision's data
 *         → org dashboard: 1 agent, 2 KBs, 2 ready documents, ~200 queries (30d)
 *   P5-5  Analytics pages show non-zero query counts
 *         → per-KB analytics: exact synthetic totals, top queries, avg latency
 *   P5-6  Chat with any seeded KB returns relevant answers from seed documents
 *         → /api/chat NDJSON: sources cite the seeded PDFs; streamed answer
 *           quotes the seeded figures (e.g. the £500 motor theft excess)
 *
 * Usage:  node scripts/e2e-phase5.js [baseUrl] [liveBaseUrl]
 *   baseUrl     — a running build of THIS codebase (default http://localhost:3000)
 *   liveBaseUrl — a deployment sharing the same DB with non-geo-blocked AI
 *                 provider egress, used for the LLM-answer layer of P5-6
 *                 (default https://clara.ai.amazetechclans.com; set
 *                 CLARA_LIVE_BASE_URL="" to disable)
 *
 * Env: CLARA_OMEN_ADMIN_EMAIL / CLARA_OMEN_ADMIN_PASSWORD
 *      CLARA_TECHVISION_ADMIN_EMAIL / CLARA_TECHVISION_ADMIN_PASSWORD
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const BASE = (process.argv[2] || process.env.CLARA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const LIVE_ARG = process.argv[3] ?? process.env.CLARA_LIVE_BASE_URL ?? "https://clara.ai.amazetechclans.com";
const LIVE_BASE = LIVE_ARG ? String(LIVE_ARG).replace(/\/$/, "") : "";

const OMEN_EMAIL = process.env.CLARA_OMEN_ADMIN_EMAIL || "omen-admin@omeninsurance.com";
const OMEN_PASSWORD = process.env.CLARA_OMEN_ADMIN_PASSWORD || "Omen1234!";
const TV_EMAIL = process.env.CLARA_TECHVISION_ADMIN_EMAIL || "techvision-admin@techvision.io";
const TV_PASSWORD = process.env.CLARA_TECHVISION_ADMIN_PASSWORD || "Tech1234!";

const IDS = {
  omenOrg: "10000000-0000-0000-0000-000000000010",
  tvOrg: "10000000-0000-0000-0000-000000000011",
  omenKbHome: "30000000-0000-0000-0000-000000000010",
  omenKbMotor: "30000000-0000-0000-0000-000000000011",
  omenKbLife: "30000000-0000-0000-0000-000000000012",
  tvKbProduct: "30000000-0000-0000-0000-000000000013",
  tvKbEng: "30000000-0000-0000-0000-000000000014",
};

let passed = 0, failed = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function login(base, email, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.token ?? data.sessionToken ?? null;
}

function authed(token, json = true) {
  const h = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** POST /api/chat as an org admin; returns { events, answer, sources, status } */
async function chat(base, token, kbId, question) {
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ kbId, messages: [{ role: "user", content: question }] }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { status: response.status, events: [], answer: "", sources: [], error: String(err.error ?? "") };
  }
  const text = await response.text();
  const events = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { events.push(JSON.parse(trimmed)); } catch { /* skip malformed */ }
  }
  const answer = events.filter((e) => e.type === "token").map((e) => String(e.payload ?? "")).join("");
  const sources = events.find((e) => e.type === "sources")?.payload ?? [];
  const hasError = events.some((e) => e.type === "error");
  return { status: response.status, events, answer, sources, hasError, error: "" };
}

async function main() {
  console.log(`\nPhase 5 acceptance — against ${BASE}` + (LIVE_BASE ? ` (live provider path: ${LIVE_BASE})` : "") + `\n`);

  /* ── P5-1: npm run seed runs to completion with no errors ────────────── */
  console.log("[P5-1] npm run seed — idempotent completion");
  const seed = spawnSync("npm", ["run", "seed"], {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, NODE_ENV: "development" },
    encoding: "utf8",
    timeout: 240_000,
  });
  const seedOut = `${seed.stdout ?? ""}\n${seed.stderr ?? ""}`;
  check("npm run seed exits 0 (re-run on an already-seeded DB)", seed.status === 0,
    `exit=${seed.status} tail=${seedOut.trim().split("\n").slice(-3).join(" | ").slice(0, 200)}`);
  check("re-run is idempotent — all 5 sample documents already present",
    /5 already present\/ready/.test(seedOut), seedOut.match(/documents: .*/)?.[0] ?? "no documents line");
  check("re-run regenerates the synthetic analytics dataset deterministically",
    /700 query_events/.test(seedOut), seedOut.match(/synthetic analytics: .*/)?.[0] ?? "no analytics line");

  /* ── P5-2: both organisations in the platform admin dashboard ────────── */
  console.log("\n[P5-2] Platform admin dashboard — both demo organisations");
  const adminToken = await login(BASE, "admin@clara.ai", "Admin1234!");
  check("platform admin login", !!adminToken);
  if (adminToken) {
    const orgs = await fetch(`${BASE}/api/platform/orgs`, { headers: authed(adminToken, false) });
    const orgsJson = orgs.ok ? await orgs.json() : { orgs: [] };
    const names = (orgsJson.orgs ?? []).map((o) => o.name);
    check("GET /api/platform/orgs lists Omen United Insurance", names.includes("Omen United Insurance"),
      `names=${JSON.stringify(names).slice(0, 160)}`);
    check("GET /api/platform/orgs lists TechVision Solutions", names.includes("TechVision Solutions"));

    const stats = await fetch(`${BASE}/api/platform/stats`, { headers: authed(adminToken, false) });
    const statsJson = stats.ok ? await stats.json() : {};
    check("platform stats count ≥ 4 organisations (Clara, Rilan, Omen, TechVision)",
      Number(statsJson.totalOrgs ?? 0) >= 4, `totalOrgs=${statsJson.totalOrgs}`);
    check("platform stats see the synthetic query volume (totalQueries ≥ 700)",
      Number(statsJson.totalQueries ?? 0) >= 700, `totalQueries=${statsJson.totalQueries}`);
  }

  /* ── P5-3: Omen login shows Omen's data ──────────────────────────────── */
  console.log("\n[P5-3] omen-admin@omeninsurance.com — Omen's data");
  const omenToken = await login(BASE, OMEN_EMAIL, OMEN_PASSWORD);
  check("omen admin login", !!omenToken, `${OMEN_EMAIL} login failed`);
  if (omenToken) {
    const dash = await fetch(`${BASE}/api/orgs/${IDS.omenOrg}/dashboard`, { headers: authed(omenToken, false) });
    const d = dash.ok ? await dash.json() : {};
    check("Omen dashboard: 1 agent", Number(d.totals?.agents) === 1, `agents=${d.totals?.agents}`);
    check("Omen dashboard: 3 KBs (Home, Motor, Life & Health)", Number(d.totals?.knowledgeBases) === 3, `kbs=${d.totals?.knowledgeBases}`);
    check("Omen dashboard: 3 ready documents", Number(d.totals?.documents) === 3, `docs=${d.totals?.documents}`);
    check("Omen dashboard: ~500 queries in the last 30 days",
      Number(d.totals?.queries30d) >= 450 && Number(d.totals?.queries30d) <= 530,
      `queries30d=${d.totals?.queries30d}`);
    check("Omen dashboard: top questions populated", (d.topQuestions ?? []).length > 0);
    check("Omen dashboard: subscription is Pro", d.subscription?.plan_id === "pro",
      JSON.stringify(d.subscription ?? {}).slice(0, 120));
    check("Omen dashboard: usage limits reflect the Pro plan (10 KBs)", Number(d.usageLimits?.limits?.max_kbs) === 10,
      JSON.stringify(d.usageLimits?.limits ?? {}).slice(0, 160));

    const kbs = await fetch(`${BASE}/api/kbs/all`, { headers: authed(omenToken, false) });
    const kbsJson = kbs.ok ? await kbs.json() : [];
    const kbList = Array.isArray(kbsJson) ? kbsJson : (kbsJson.kbs ?? []);
    const kbNames = kbList.map((k) => k.name);
    check("Omen KB list shows the three seeded KBs",
      kbNames.includes("Home Insurance Policies") && kbNames.includes("Motor Insurance 2024") && kbNames.includes("Life & Health Plans"),
      `names=${JSON.stringify(kbNames)}`);
    const arias = kbList.filter((k) => (k.assistant?.name ?? "") === "Aria");
    check("Omen assistant persona is Aria (navy/gold) on every KB",
      arias.length === 3 && arias.every((k) => k.assistant?.primaryColour === "#0a1628"),
      `assistants=${JSON.stringify(kbList.map((k) => k.assistant?.name))}`);
    check("Omen documents all reached 'ready' (ingest pipeline complete)",
      kbList.length === 3 && kbList.every((k) => Number(k.readyCount) === Number(k.docCount) && Number(k.docCount) === 1),
      `docs=${JSON.stringify(kbList.map((k) => [k.docCount, k.readyCount]))}`);
  }

  /* ── P5-4: TechVision login shows TechVision's data ──────────────────── */
  console.log("\n[P5-4] techvision-admin@techvision.io — TechVision's data");
  const tvToken = await login(BASE, TV_EMAIL, TV_PASSWORD);
  check("TechVision admin login", !!tvToken, `${TV_EMAIL} login failed`);
  if (tvToken) {
    const dash = await fetch(`${BASE}/api/orgs/${IDS.tvOrg}/dashboard`, { headers: authed(tvToken, false) });
    const d = dash.ok ? await dash.json() : {};
    check("TechVision dashboard: 1 agent", Number(d.totals?.agents) === 1, `agents=${d.totals?.agents}`);
    check("TechVision dashboard: 2 KBs (Product Docs, Engineering Runbooks)", Number(d.totals?.knowledgeBases) === 2, `kbs=${d.totals?.knowledgeBases}`);
    check("TechVision dashboard: 2 ready documents", Number(d.totals?.documents) === 2, `docs=${d.totals?.documents}`);
    check("TechVision dashboard: ~200 queries in the last 30 days",
      Number(d.totals?.queries30d) >= 180 && Number(d.totals?.queries30d) <= 215,
      `queries30d=${d.totals?.queries30d}`);
    check("TechVision subscription is Starter", d.subscription?.plan_id === "starter",
      JSON.stringify(d.subscription ?? {}).slice(0, 120));
    check("TechVision usage limits reflect the Starter plan (3 KBs)", Number(d.usageLimits?.limits?.max_kbs) === 3,
      JSON.stringify(d.usageLimits?.limits ?? {}).slice(0, 160));

    const kbs = await fetch(`${BASE}/api/kbs/all`, { headers: authed(tvToken, false) });
    const kbsJson = kbs.ok ? await kbs.json() : [];
    const kbList = Array.isArray(kbsJson) ? kbsJson : (kbsJson.kbs ?? []);
    const kbNames = kbList.map((k) => k.name);
    check("TechVision KB list shows the two seeded KBs",
      kbNames.includes("Product Documentation") && kbNames.includes("Engineering Runbooks"),
      `names=${JSON.stringify(kbNames)}`);
    const sages = kbList.filter((k) => (k.assistant?.name ?? "") === "Sage");
    check("TechVision assistant persona is Sage (slate/sky) on every KB",
      sages.length === 2 && sages.every((k) => k.assistant?.primaryColour === "#0f172a"),
      `assistants=${JSON.stringify(kbList.map((k) => k.assistant?.name))}`);
    check("TechVision documents all reached 'ready' (ingest pipeline complete)",
      kbList.length === 2 && kbList.every((k) => Number(k.readyCount) === Number(k.docCount) && Number(k.docCount) === 1),
      `docs=${JSON.stringify(kbList.map((k) => [k.docCount, k.readyCount]))}`);
  }

  /* ── P5-5: analytics pages show non-zero query counts ────────────────── */
  console.log("\n[P5-5] Analytics — non-zero query counts on every seeded KB");
  const expected = [
    [IDS.omenKbHome, 200, "Home Insurance Policies"],
    [IDS.omenKbMotor, 150, "Motor Insurance 2024"],
    [IDS.omenKbLife, 150, "Life & Health Plans"],
    [IDS.tvKbProduct, 120, "Product Documentation"],
    [IDS.tvKbEng, 80, "Engineering Runbooks"],
  ];
  for (const [kbId, want, label] of expected) {
    const token = kbId === IDS.tvKbProduct || kbId === IDS.tvKbEng ? tvToken : omenToken;
    if (!token) { check(`${label}: analytics reachable`, false, "no org token"); continue; }
    const res = await fetch(`${BASE}/api/kbs/${kbId}/analytics`, { headers: authed(token, false) });
    const a = res.ok ? await res.json() : {};
    check(`${label}: totalQueries = ${want}`, Number(a.totalQueries) === want, `got=${a.totalQueries} status=${res.status}`);
    check(`${label}: top queries + avg latency populated`,
      (a.topQueries ?? []).length > 0 && Number(a.avgLatencyMs ?? 0) > 0,
      `top=${(a.topQueries ?? []).length} latency=${a.avgLatencyMs}`);
    check(`${label}: 30-day daily series populated`, (a.queriesPerDay ?? []).filter((p) => p.count > 0).length >= 20,
      `days-with-queries=${(a.queriesPerDay ?? []).filter((p) => p.count > 0).length}`);
  }

  /* ── P5-6: chat with a seeded KB returns relevant answers ────────────── */
  console.log("\n[P5-6] Chat — relevant answers from the seeded documents");

  // 6a. This build: chat either streams or fail-fasts with the friendly 502
  // when the AI provider is unreachable from THIS egress (sandbox geo-block);
  // raw provider errors must never leak (Phase 4 error-hygiene contract).
  const localMotor = await chat(BASE, omenToken, IDS.omenKbMotor, "What is the excess for motor theft claims?");
  const localClean = localMotor.status === 200
    ? localMotor.answer.length > 0
    : localMotor.status === 502 && /embedding configuration|unreachable|provider/i.test(localMotor.error);
  check("chat on THIS build streams or fail-fasts cleanly (never leaks raw provider errors)",
    localClean, `status=${localMotor.status} err=${localMotor.error.slice(0, 100)}`);

  // 6b. Full answer layer on the live deployment (same DB, non-blocked
  // provider egress): retrieval must cite the seeded PDFs and the streamed
  // answer must quote the seeded figures.
  if (LIVE_BASE) {
    const liveOmen = await login(LIVE_BASE, OMEN_EMAIL, OMEN_PASSWORD);
    check("live deployment login as omen admin", !!liveOmen);
    if (liveOmen) {
      const motor = await chat(LIVE_BASE, liveOmen, IDS.omenKbMotor, "What is the excess for motor theft claims?");
      check("retrieval cites Motor-Insurance-Comprehensive.pdf for the theft-excess question",
        motor.sources.some((s) => /Motor-Insurance-Comprehensive\.pdf|Motor Insurance Comprehensive/i.test(String(s.originalFilename ?? s.title ?? ""))),
        `sources=${motor.sources.slice(0, 2).map((s) => s.originalFilename ?? s.title).join(",")}`);
      check("live chat streams an answer (200 NDJSON)", motor.status === 200 && motor.answer.length > 0,
        `status=${motor.status} answerLen=${motor.answer.length} err=${motor.error.slice(0, 80)}`);
      check("live answer quotes the seeded £500 theft excess", /500/.test(motor.answer),
        `answer=${motor.answer.slice(0, 140)}`);
      check("live answer cites sources ([S…])", /\[S\d/i.test(motor.answer));

      const home = await chat(LIVE_BASE, liveOmen, IDS.omenKbHome, "Does my home insurance cover flood damage?");
      check("live chat: home KB answer mentions flood cover + £500 flood excess",
        home.status === 200 && /flood/i.test(home.answer) && /500/.test(home.answer),
        `answer=${home.answer.slice(0, 140)}`);

      const liveTv = await login(LIVE_BASE, TV_EMAIL, TV_PASSWORD);
      if (liveTv) {
        const eng = await chat(LIVE_BASE, liveTv, IDS.tvKbEng, "How do I roll back a failed deployment?");
        check("live chat: engineering runbook answer mentions deployctl rollback",
          eng.status === 200 && /deployctl rollback/i.test(eng.answer),
          `answer=${eng.answer.slice(0, 140)}`);
        check("live chat: runbook retrieval cites the seeded PDF",
          eng.sources.some((s) => /Engineering-Runbook-v2\.pdf|Engineering Runbook/i.test(String(s.originalFilename ?? s.title ?? ""))),
          `sources=${eng.sources.slice(0, 2).map((s) => s.originalFilename ?? s.title).join(",")}`);
      }
    }
  } else {
    console.log("  NOTE | live provider path disabled (CLARA_LIVE_BASE_URL=\"\") — P5-6 limited to the local-build contract check above");
  }

  /* ── summary ──────────────────────────────────────────────────────────── */
  console.log(`\nPhase 5 acceptance: ${passed}/${passed + failed} checks passed`);
  if (failed > 0) {
    console.log("FAILED:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-phase5] fatal:", err);
  process.exit(1);
});
