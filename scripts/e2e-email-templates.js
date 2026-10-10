#!/usr/bin/env node
/**
 * e2e-email-templates.js — live acceptance for the Email Templates redesign.
 *
 * Verifies against a running server (scripts/start-prod-server.sh):
 *   T1  GET  /api/platform/email-templates        → rows expose draft: null
 *   T2  PUT  /api/platform/email-templates/:key   → saves DRAFT, live untouched
 *   T3  GET  /api/platform/email-templates/:key   → draft visible, live intact
 *   T4  render isolation: live subject unchanged in list after draft save
 *   T5  POST /:key/publish                        → draft → live, draft cleared
 *   T6  POST /:key/publish (no draft)             → 400
 *   T7  POST /:key/discard                        → draft cleared, live intact
 *   T8  PUT  { isActive }                          → live toggle works
 *   T9  GET  /api/platform/email-variables        → system rows seeded read-only
 *   T10 POST /api/platform/email-variables        → creates custom variable
 *   T11 POST duplicate / system name              → 409 / 400
 *   T12 PUT  system value                         → 400 (locked)
 *   T13 PUT  custom value                         → 200
 *   T14 DELETE custom (unused)                    → 200
 *   T15 DELETE system                             → 400
 *   T16 GET  /:key/audit                          → publish/reset entries listed
 *   T17 cleanup: reset template to factory default
 *   T18 GET /settings/templates page              → 200 HTML
 *
 * Usage: node e2e-email-templates.js [baseUrl] (default http://localhost:3000)
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const API = `${BASE}/api/platform/email-templates`;
const VARS = `${BASE}/api/platform/email-variables`;

let passed = 0, failed = 0;
function ok(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@clara.ai", password: "Admin1234!" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}

async function main() {
  const cookie = await login();
  const H = { Cookie: cookie };
  const HJ = { Cookie: cookie, "Content-Type": "application/json" };
  console.log(`\n[e2e] Email Templates redesign — ${BASE}\n`);

  // T1 — list exposes draft state
  let res = await fetch(API, { headers: H });
  let data = await res.json();
  ok("T1 list 200 + templates have draft field", res.ok && Array.isArray(data.templates)
    && data.templates.every((t) => "draft" in t), `status=${res.status}`);
  const KEY = "test_email";
  const before = data.templates.find((t) => t.key === KEY);
  const liveSubjectBefore = before.subject;
  const liveBodyBefore = before.bodyHtml;

  // T2 — save draft (live untouched)
  res = await fetch(`${API}/${KEY}`, {
    method: "PUT", headers: HJ,
    body: JSON.stringify({ subject: "E2E DRAFT subject — not live", bodyHtml: "<p>e2e draft body</p>" }),
  });
  data = await res.json();
  ok("T2 PUT saves draft", res.ok && data.template?.draft?.subject === "E2E DRAFT subject — not live");
  ok("T2b live subject untouched", data.template?.subject === liveSubjectBefore);
  ok("T2c live body untouched", data.template?.bodyHtml === liveBodyBefore);

  // T3 — GET shows draft + live intact
  res = await fetch(`${API}/${KEY}`, { headers: H });
  data = await res.json();
  ok("T3 GET exposes draft", res.ok && data.template?.draft?.bodyHtml === "<p>e2e draft body</p>");
  ok("T3b live still intact", data.template?.subject === liveSubjectBefore);

  // T4 — list still shows live content
  res = await fetch(API, { headers: H });
  data = await res.json();
  const listed = data.templates.find((t) => t.key === KEY);
  ok("T4 list live content unchanged", listed.subject === liveSubjectBefore && listed.draft !== null);

  // T5 — publish
  res = await fetch(`${API}/${KEY}/publish`, { method: "POST", headers: H });
  data = await res.json();
  ok("T5 publish 200", res.ok, `status=${res.status} ${JSON.stringify(data).slice(0, 120)}`);
  ok("T5b live now draft content", data.template?.subject === "E2E DRAFT subject — not live");
  ok("T5c draft cleared", data.template?.draft === null);

  // T6 — publish without draft
  res = await fetch(`${API}/${KEY}/publish`, { method: "POST", headers: H });
  ok("T6 publish without draft → 400", res.status === 400, `status=${res.status}`);

  // T7 — discard flow
  await fetch(`${API}/${KEY}`, {
    method: "PUT", headers: HJ,
    body: JSON.stringify({ subject: "second draft", bodyHtml: "<p>2</p>" }),
  });
  res = await fetch(`${API}/${KEY}/discard`, { method: "POST", headers: H });
  data = await res.json();
  ok("T7 discard clears draft", res.ok && data.template?.draft === null);
  ok("T7b live untouched by discard", data.template?.subject === "E2E DRAFT subject — not live");

  // T8 — isActive toggle
  res = await fetch(`${API}/${KEY}`, {
    method: "PUT", headers: HJ, body: JSON.stringify({ isActive: false }),
  });
  data = await res.json();
  ok("T8 isActive toggle off", res.ok && data.template?.isActive === false);
  res = await fetch(`${API}/${KEY}`, {
    method: "PUT", headers: HJ, body: JSON.stringify({ isActive: true }),
  });
  data = await res.json();
  ok("T8b isActive toggle on", res.ok && data.template?.isActive === true);

  // T9 — variables catalogue
  res = await fetch(VARS, { headers: H });
  data = await res.json();
  const vars = data.variables ?? [];
  const sysVar = vars.find((v) => v.name === "userName");
  ok("T9 variables list 200", res.ok && vars.length > 0, `status=${res.status}`);
  ok("T9b system rows seeded + read-only", sysVar?.isSystem === true && Array.isArray(sysVar?.usedIn));
  ok("T9c usage detection works", (vars.find((v) => v.name === "resetUrl")?.usedIn ?? []).includes("password_reset"));

  // T10 — create custom variable
  res = await fetch(VARS, {
    method: "POST", headers: HJ,
    body: JSON.stringify({ name: "e2eSmokeVar", category: "custom", description: "e2e", value: "smoke-value" }),
  });
  data = await res.json();
  ok("T10 create custom variable 201", res.status === 201 && data.variable?.value === "smoke-value", `status=${res.status} ${JSON.stringify(data).slice(0,120)}`);

  // T11 — duplicate + system-name rejection
  res = await fetch(VARS, {
    method: "POST", headers: HJ,
    body: JSON.stringify({ name: "e2eSmokeVar", category: "custom", description: "", value: "dup" }),
  });
  ok("T11 duplicate → 409", res.status === 409, `status=${res.status}`);
  res = await fetch(VARS, {
    method: "POST", headers: HJ,
    body: JSON.stringify({ name: "userName", category: "custom", description: "", value: "x" }),
  });
  ok("T11b system name → 400", res.status === 400, `status=${res.status}`);

  // T12 — system value locked
  res = await fetch(`${VARS}/userName`, {
    method: "PUT", headers: HJ, body: JSON.stringify({ value: "hacked" }),
  });
  ok("T12 system value locked → 400", res.status === 400, `status=${res.status}`);

  // T13 — custom value editable
  res = await fetch(`${VARS}/e2eSmokeVar`, {
    method: "PUT", headers: HJ, body: JSON.stringify({ value: "smoke-value-2", category: "auth" }),
  });
  data = await res.json();
  ok("T13 custom variable editable", res.ok && data.variable?.value === "smoke-value-2", `status=${res.status}`);

  // T14 — delete unused custom
  res = await fetch(`${VARS}/e2eSmokeVar`, { method: "DELETE", headers: H });
  ok("T14 delete unused custom → 200", res.ok, `status=${res.status} ${JSON.stringify(await res.json().catch(()=>({}))).slice(0,100)}`);

  // T15 — delete system blocked
  res = await fetch(`${VARS}/userName`, { method: "DELETE", headers: H });
  ok("T15 delete system → 400", res.status === 400, `status=${res.status}`);

  // T16 — audit entries
  res = await fetch(`${API}/${KEY}/audit?limit=10`, { headers: H });
  data = await res.json();
  const actions = (data.entries ?? []).map((e) => e.action);
  ok("T16 audit lists publish entries", res.ok && actions.includes("publish"), `actions=${actions.join(",")}`);

  // T17 — reset template to factory default (cleanup)
  res = await fetch(`${API}/${KEY}/reset`, { method: "POST", headers: H });
  data = await res.json();
  ok("T17 reset restores factory default", res.ok && data.template?.subject === liveSubjectBefore
    && data.template?.bodyHtml === liveBodyBefore && data.template?.draft === null);

  // T18 — settings page renders
  res = await fetch(`${BASE}/settings/templates`, { headers: H });
  const html = await res.text();
  ok("T18 /settings/templates page 200", res.ok && html.length > 500, `status=${res.status}`);

  console.log(`\n[e2e] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("[e2e] fatal:", e.message); process.exit(1); });
