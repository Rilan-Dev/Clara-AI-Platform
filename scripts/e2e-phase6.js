/**
 * E2E — Phase 6 acceptance verification (ClaraAI-Implementation-Plan.md).
 *
 * PHASE 6 — Production Hardening & Security:
 *   P6-1  GET /api/health → 200, db=ok, qdrant=ok (6.5)
 *   P6-2  Login rate limit: 6th failed attempt from one IP → 429
 *         RATE_LIMITED + Retry-After (6.1/6.4)
 *   P6-3  Account lockout: 10 failures (IP-rotated, defeating the per-IP
 *         gate — exactly the distributed attack the account lock exists for)
 *         → correct password rejected 403 ACCOUNT_LOCKED;
 *         audit_logs rows written (auth.account_locked)
 *   P6-4  Super-admin unlock: POST /api/platform/users/:id/unlock →
 *         correct-password login succeeds again; audit row
 *         (auth.account_unlocked) written
 *   P6-5  .exe upload → 400 with code INVALID_FILE_TYPE (6.1)
 *   P6-6  Upload rate limit: 10/min/org → 11th request 429 (6.4)
 *   P6-7  Chat rate limit: 60/min/org → 61st request 429 (6.4)
 *   P6-8  Realtime session rate limit: 10/hour/org → 11th 429 (6.4)
 *   P6-9  No stack traces in ANY captured API error response (6.3)
 *   P6-10 Application refuses to start when DATABASE_URL is missing (6.2) —
 *         spawns a second standalone server with a sanitized env and asserts
 *         it aborts with the env-validation error.
 *
 * NOTE: run standalone (not concurrent with other e2e suites) — the
 * per-minute/per-hour rate buckets are shared with any parallel traffic.
 *
 * Cleanup: lockout state reset via the admin unlock API; no documents are
 * created (rate tests use bodies that fail validation AFTER the gate).
 * Run: node scripts/e2e-phase6.js   (server must be running)
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const ADMIN = { email: "admin@clara.ai", password: "Admin1234!" };
const ORG_USER = { email: "demo@clara.ai", password: "Demo1234!" };
const DEMO_ORG_ID = "10000000-0000-0000-0000-000000000001";
const INSURANCE_KB_ID = "30000000-0000-0000-0000-000000000001"; // demo org KB

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, extra) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

/** Every JSON response body is retained for the P6-9 stack-trace scan. */
const capturedBodies = [];

async function api(method, url, token, body, isForm, extraHeaders) {
  const headers = { ...(extraHeaders ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${url}`, {
    method, headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
    capturedBodies.push({ url, status: res.status, body: data });
  } catch { /* non-JSON */ }
  return { status: res.status, data, res };
}

async function login(creds, extraHeaders) {
  const r = await api("POST", "/api/auth/login", null, creds, false, extraHeaders);
  return r.data?.token ?? null;
}

async function db() {
  const pg = require(path.join(__dirname, "..", "node_modules", "pg"));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

const STACK_TRACE_RE = /at\s+(?:async\s+)?[\w$.]+[^\n]*\((?:[\w./\\-]+\.ts|[\w./\\-]+\.js|node:internal)[^\n]*\)|node:internal[^\s"']*|\n\s+at\s+/;

async function main() {
  console.log(`\nE2E Phase 6 — Production Hardening (against ${BASE})\n${"─".repeat(60)}\n`);

  // ── P6-1 Health ────────────────────────────────────────────────────────────
  console.log("P6-1  Health endpoint");
  {
    const r = await api("GET", "/api/health");
    const c = r.data?.checks ?? {};
    check("GET /api/health → 200", r.status === 200, `status=${r.status}`);
    check("health reports db=ok", c.database?.status === "ok", JSON.stringify(c.database).slice(0, 80));
    check("health reports qdrant=ok", c.qdrant?.status === "ok", JSON.stringify(c.qdrant).slice(0, 80));
    check("health includes version + uptime",
      typeof r.data?.version === "string" && typeof r.data?.uptime?.seconds === "number");
  }

  // ── P6-2 Login rate limit (5 failures / 15 min / IP) ───────────────────────
  console.log("\nP6-2  Login rate limit (5 / 15 min / IP)");
  {
    const ip = "9.9.9.9"; // dedicated XFF so the script's own logins are unaffected
    let saw429 = false, lastStatus = null, retryAfter = null;
    for (let i = 1; i <= 6; i++) {
      const r = await api("POST", "/api/auth/login", null,
        { email: "brute-test@nowhere.test", password: "wrong-password" },
        false, { "x-forwarded-for": ip });
      lastStatus = r.status;
      retryAfter = r.res.headers.get("retry-after");
      if (r.status === 429) { saw429 = true; break; }
    }
    check("6th failed login from one IP → 429", saw429, `last=${lastStatus}`);
    check("429 body carries RATE_LIMITED code",
      saw429 && capturedBodies.slice(-1)[0]?.body?.code === "RATE_LIMITED");
    check("429 carries Retry-After header", saw429 && retryAfter != null, `retry-after=${retryAfter}`);
    // a 7th attempt must stay blocked
    const again = await api("POST", "/api/auth/login", null,
      { email: "brute-test@nowhere.test", password: "wrong-password" },
      false, { "x-forwarded-for": ip });
    check("subsequent attempt from the same IP stays blocked (429)", again.status === 429, `status=${again.status}`);
    // a DIFFERENT IP is not affected — one clean failure from a fresh IP
    const freshIp = await api("POST", "/api/auth/login", null,
      { email: "brute-test@nowhere.test", password: "wrong-password" },
      false, { "x-forwarded-for": "9.9.9.8" });
    check("fresh IP is unaffected (401, not 429)", freshIp.status === 401, `status=${freshIp.status}`);
  }

  // ── P6-3 Account lockout (10 failures → locked, even with IP rotation) ────
  console.log("\nP6-3  Account lockout (10 consecutive failures)");
  let orgUserId = null;
  {
    // resolve the demo user's id for later unlock + DB assertions
    const client = await db();
    const u = await client.query("SELECT id FROM users WHERE email = $1", [ORG_USER.email]);
    orgUserId = u.rows[0]?.id ?? null;
    await client.end();
    check("demo user resolvable in DB", !!orgUserId);

    for (let i = 1; i <= 10; i++) {
      await api("POST", "/api/auth/login", null,
        { email: ORG_USER.email, password: "definitely-not-the-password" },
        false, { "x-forwarded-for": `10.0.0.${i}` }); // rotate: defeat the per-IP gate
    }
    const client2 = await db();
    const st = await client2.query(
      "SELECT failed_login_attempts, locked_until FROM users WHERE id = $1", [orgUserId]);
    await client2.end();
    check("counter reached 10 in DB", st.rows[0]?.failed_login_attempts === 10,
      JSON.stringify(st.rows[0]));
    check("locked_until set in the future", st.rows[0]?.locked_until != null
      && new Date(st.rows[0].locked_until).getTime() > Date.now());

    const locked = await api("POST", "/api/auth/login", null,
      { email: ORG_USER.email, password: ORG_USER.password },
      false, { "x-forwarded-for": "10.0.0.11" });
    check("correct password while locked → 403 ACCOUNT_LOCKED",
      locked.status === 403 && locked.data?.code === "ACCOUNT_LOCKED",
      `status=${locked.status} body=${JSON.stringify(locked.data).slice(0, 90)}`);

    const client3 = await db();
    const auditLock = await client3.query(
      `SELECT new_data FROM audit_logs WHERE action = 'auth.account_locked' ORDER BY created_at DESC LIMIT 1`);
    await client3.end();
    check("audit_logs records the lockout",
      auditLock.rows[0] != null && JSON.stringify(auditLock.rows[0].new_data).includes('"failures":10'));
  }

  // ── P6-4 Super-admin unlock ────────────────────────────────────────────────
  console.log("\nP6-4  Super-admin account unlock");
  {
    const adminToken = await login(ADMIN);
    check("platform admin can still log in", !!adminToken);

    // unauthenticated + non-super-admin guards
    const anon = await api("POST", `/api/platform/users/${orgUserId}/unlock`, null, {});
    check("unlock endpoint requires auth (401)", anon.status === 401, `status=${anon.status}`);

    const unlock = await api("POST", `/api/platform/users/${orgUserId}/unlock`, adminToken, {});
    check("POST unlock → 200 with unlocked=true",
      unlock.status === 200 && unlock.data?.unlocked === true,
      `status=${unlock.status} body=${JSON.stringify(unlock.data).slice(0, 90)}`);
    check("unlock response reports previous lock state",
      unlock.data?.previousState?.failedLoginAttempts === 10,
      JSON.stringify(unlock.data?.previousState));

    const token = await login(ORG_USER);
    check("correct-password login succeeds after unlock", !!token);

    const client = await db();
    const auditUnlock = await client.query(
      `SELECT new_data FROM audit_logs WHERE action = 'auth.account_unlocked' ORDER BY created_at DESC LIMIT 1`);
    await client.end();
    check("audit_logs records the unlock (who → whom)",
      auditUnlock.rows[0] != null
      && JSON.stringify(auditUnlock.rows[0].new_data).includes(ADMIN.email));

    // ── P6-5 + P6-6 use the org token from here on ──────────────────────────
    console.log("\nP6-5  Upload MIME validation");
    const form = new FormData();
    const exeBytes = Buffer.concat([
      Buffer.from([0x4d, 0x5a, 0x90, 0x00]), // MZ magic
      Buffer.alloc(64, 0),
    ]);
    form.append("files", new Blob([exeBytes], { type: "application/octet-stream" }), "malware.exe");
    const exe = await api("POST", `/api/kbs/${INSURANCE_KB_ID}/documents`, token, form, true);
    check("uploading a .exe → 400", exe.status === 400, `status=${exe.status}`);
    check("400 body carries INVALID_FILE_TYPE code",
      exe.data?.code === "INVALID_FILE_TYPE", JSON.stringify(exe.data).slice(0, 120));
    check("no document was created for the .exe",
      Array.isArray(exe.data?.queued) && exe.data.queued.length === 0);

    console.log("\nP6-6  Upload rate limit (10 / min / org)");
    // The .exe request consumed 1 slot; 9 more malformed (JSON-body) requests
    // each pass the gate then fail at formData parsing — cheap and counted.
    let saw429 = false, statuses = [];
    for (let i = 1; i <= 10; i++) {
      const r = await api("POST", `/api/kbs/${INSURANCE_KB_ID}/documents`, token,
        { not: "multipart" });
      statuses.push(r.status);
      if (r.status === 429) { saw429 = true; break; }
    }
    check("upload request #11 for the org → 429", saw429, `statuses=${statuses.join(",")}`);
    check("upload 429 body carries RATE_LIMITED code",
      saw429 && capturedBodies.slice(-1)[0]?.body?.code === "RATE_LIMITED");

    // ── P6-7 Chat rate limit (60 / min / org) ───────────────────────────────
    console.log("\nP6-7  Chat rate limit (60 / min / org)");
    const chatBody = { kbId: INSURANCE_KB_ID, messages: [{ role: "user", content: "phase6 rate limit probe" }] };
    let chatNon429 = 0;
    // 60 requests in parallel chunks — each passes the gate (counter 1..60),
    // then fails fast at the geo-blocked embedding provider (sandbox) or
    // streams a real answer (unrestricted egress) — either way, not 429.
    for (const chunkStart of [0, 15, 30, 45]) {
      const results = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          api("POST", "/api/chat", null, chunkStart + i === 0
            ? chatBody
            : { ...chatBody, messages: [{ role: "user", content: `rate probe ${chunkStart + i}` }] })
        )
      );
      chatNon429 += results.filter((r) => r.status !== 429).length;
    }
    check("first 60 chat requests in the window are NOT rate-limited",
      chatNon429 === 60, `non-429 count=${chatNon429}`);
    const chat61 = await api("POST", "/api/chat", null, chatBody);
    check("chat request #61 for the org → 429", chat61.status === 429, `status=${chat61.status}`);
    check("chat 429 body carries RATE_LIMITED code", chat61.data?.code === "RATE_LIMITED",
      JSON.stringify(chat61.data).slice(0, 90));

    // ── P6-8 Realtime session rate limit (10 / hour / org) ──────────────────
    console.log("\nP6-8  Realtime session rate limit (10 / hour / org)");
    // /api/realtime is middleware-protected — the org token is required to
    // reach the handler (mirrors real workspace voice usage).
    const rtBody = { kbId: INSURANCE_KB_ID };
    const rtResults = await Promise.all(
      Array.from({ length: 10 }, () => api("POST", "/api/realtime/session", token, rtBody))
    );
    const rtNon429 = rtResults.filter((r) => r.status !== 429).length;
    check("first 10 realtime session requests are NOT rate-limited",
      rtNon429 === 10, `non-429 count=${rtNon429} statuses=${rtResults.map((r) => r.status).join(",")}`);
    const rt11 = await api("POST", "/api/realtime/session", token, rtBody);
    check("realtime session request #11 → 429", rt11.status === 429, `status=${rt11.status}`);
    check("realtime 429 body carries RATE_LIMITED code", rt11.data?.code === "RATE_LIMITED");
  }

  // ── P6-9 No stack traces in API responses ──────────────────────────────────
  console.log("\nP6-9  Stack traces never appear in API responses");
  {
    const leaks = capturedBodies.filter((c) => STACK_TRACE_RE.test(JSON.stringify(c.body)));
    check(`no stack-trace markers across ${capturedBodies.length} captured JSON bodies`,
      leaks.length === 0, leaks.slice(0, 2).map((l) => `${l.url} [${l.status}]`).join(" | "));
  }

  // ── P6-10 Refuses to start without DATABASE_URL ────────────────────────────
  console.log("\nP6-10 Startup env validation (refuses to boot without DATABASE_URL)");
  {
    const result = await new Promise((resolve) => {
      const env = { ...process.env };
      // Empty-string, not delete: the standalone bundle ships a copy of .env
      // and @next/env only fills UNDEFINED variables — a defined-but-empty
      // DATABASE_URL therefore stays empty and trips the Phase 6.2 check.
      env.DATABASE_URL = "";
      delete env.E2E_BASE_URL;
      env.PORT = "3199";
      env.HOSTNAME = "127.0.0.1";
      // Run from an empty temp cwd so the standalone server cannot re-load
      // .env from disk (Next resolves server assets from its own file path,
      // only env discovery is cwd-relative). start.mjs is passed by absolute
      // path, so the script still resolves the standalone server.js.
      const tempCwd = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "clara-envless-"));
      const child = spawn(process.execPath, [path.join(__dirname, "..", "scripts", "start.mjs")], {
        cwd: tempCwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      const collect = (chunk) => { out += chunk.toString(); };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ exited: false, code: null, out });
      }, 45_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve({ exited: true, code, out });
      });
    });
    check("boot attempt without DATABASE_URL aborts", result.exited,
      result.exited ? `exit code=${result.code}` : "process kept running for 45s");
    check("abort message names the missing variable",
      /DATABASE_URL/.test(result.out) && /Missing required environment variables|AUTH_SECRET|Clara AI/i.test(result.out),
      result.out.split("\n").filter((l) => l.trim()).slice(0, 4).join(" ⏎ ").slice(0, 160));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}\nPhase 6 acceptance: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("e2e-phase6 crashed:", err);
  process.exitCode = 1;
});
