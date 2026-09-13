/**
 * E2E verification for the subscription expiry engine (sweep).
 *
 * Scenario:
 *   1. Temp org "E2E Expiry Co" + paid starter sub, period_end = 1 day AGO
 *      → sweep should transition to past_due + queue expiry notification
 *   2. Temp org "E2E Reminder Co" + paid starter sub, period_end = +3 days
 *      → sweep should queue a renewal_reminder notification
 *   3. Owner = demo@clara.ai (owned demo mailbox) so a REAL email is
 *      attempted through Resend — delivery status is reported honestly.
 *   4. Full cleanup afterwards (org CASCADE removes all rows).
 *
 * Run: node scripts/e2e-expiry-sweep.js
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
const ADMIN_USER = { email: "admin@clara.ai", password: "Admin1234!" };

let passed = 0, failed = 0;
const failures = [];
function check(name, condition, extra) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

let pg = null;
async function dbQuery(sql, params) {
  if (!pg) {
    const mod = require("pg");
    pg = new mod.Pool({
      host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
    });
  }
  const res = await pg.query(sql, params);
  return res.rows;
}

async function api(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  const login = await api("POST", "/api/auth/login", null, ADMIN_USER);
  const token = login.json?.token;
  check("admin login", !!token);

  // Demo user id (owner of both temp orgs → notifications addressed to demo@clara.ai)
  const demoUser = await dbQuery(`SELECT id FROM users WHERE email = 'demo@clara.ai'`);

  console.log("── Setup: expired + expiring temp orgs ───────────────");

  const expiredOrg = await dbQuery(
    `INSERT INTO organisations (name, slug) VALUES ('E2E Expiry Co', 'e2e-expiry-${Date.now()}') RETURNING id`
  );
  const expiredOrgId = expiredOrg[0].id;
  await dbQuery(
    `INSERT INTO org_subscriptions (org_id, plan_id, status, gateway, current_period_start, current_period_end)
     VALUES ($1, 'starter', 'active', 'manual', now() - interval '32 days', now() - interval '1 day')`,
    [expiredOrgId]
  );
  const adminRole = await dbQuery(`SELECT id FROM roles WHERE name = 'org_admin'`);
  await dbQuery(
    `INSERT INTO org_members (org_id, user_id, role_id) VALUES ($1, $2, $3)`,
    [expiredOrgId, demoUser[0].id, adminRole[0].id]
  );
  check("expired-scenario org created", Boolean(expiredOrgId));

  const remindOrg = await dbQuery(
    `INSERT INTO organisations (name, slug) VALUES ('E2E Reminder Co', 'e2e-reminder-${Date.now()}') RETURNING id`
  );
  const remindOrgId = remindOrg[0].id;
  await dbQuery(
    `INSERT INTO org_subscriptions (org_id, plan_id, status, gateway, current_period_start, current_period_end)
     VALUES ($1, 'starter', 'active', 'manual', now() - interval '27 days', now() + interval '3 days')`,
    [remindOrgId]
  );
  await dbQuery(
    `INSERT INTO org_members (org_id, user_id, role_id) VALUES ($1, $2, $3)`,
    [remindOrgId, demoUser[0].id, adminRole[0].id]
  );
  check("reminder-scenario org created", Boolean(remindOrgId));

  console.log("── Sweep run ──────────────────────────────────────────");

  const sweep = await api("POST", "/api/subscriptions/expiry-sweep", token, {});
  check("sweep API 200", sweep.status === 200, JSON.stringify(sweep.json));
  const r = sweep.json?.result ?? {};
  console.log(`    checked=${r.checked} reminded=${r.reminded} expired=${r.expired} errors=${(r.errors ?? []).length}`);
  check("sweep expired the overdue sub", r.expired === 1, `expired=${r.expired}`);
  check("sweep reminded the expiring sub", r.reminded === 1, `reminded=${r.reminded}`);
  check("no sweep errors", (r.errors ?? []).length === 0, JSON.stringify(r.errors));

  console.log("── DB state after sweep ───────────────────────────────");

  const expiredRow = await dbQuery(
    `SELECT status FROM org_subscriptions WHERE org_id = $1`, [expiredOrgId]
  );
  check("overdue sub is now past_due", expiredRow[0]?.status === "past_due", expiredRow[0]?.status);

  const remindRow = await dbQuery(
    `SELECT status FROM org_subscriptions WHERE org_id = $1`, [remindOrgId]
  );
  check("expiring sub still active (not expired)", remindRow[0]?.status === "active", remindRow[0]?.status);

  const notifs = await dbQuery(
    `SELECT org_id, notification_type, status, recipient_email, error_message
       FROM subscription_notifications WHERE org_id IN ($1, $2) ORDER BY created_at`,
    [expiredOrgId, remindOrgId]
  );
  check("expiry notification queued", notifs.some((n) => n.org_id === expiredOrgId && n.notification_type === "subscription_expired"));
  check("renewal reminder queued", notifs.some((n) => n.org_id === remindOrgId && n.notification_type === "renewal_reminder"));
  check("notifications addressed to owner", notifs.every((n) => n.recipient_email === "demo@clara.ai"));

  for (const n of notifs) {
    console.log(`    📧 ${n.notification_type} → ${n.recipient_email} [status=${n.status}${n.error_message ? ` err=${n.error_message}` : ""}]`);
  }

  // Idempotency: second sweep must NOT re-notify
  const sweep2 = await api("POST", "/api/subscriptions/expiry-sweep", token, {});
  const notifs2 = await dbQuery(
    `SELECT COUNT(*)::int AS n FROM subscription_notifications WHERE org_id IN ($1, $2)`,
    [expiredOrgId, remindOrgId]
  );
  check("sweep is idempotent (no duplicate notifications)", notifs2[0].n === notifs.length, `before=${notifs.length} after=${notifs2[0].n}`);
  check("second sweep still 200", sweep2.status === 200);

  // Effective status after expiry — what the billing/overview banners consume
  const sub = await api("GET", `/api/orgs/subscription?orgId=${expiredOrgId}`, token);
  check("effective status = expired for overdue org", sub.json?.effective?.effectiveStatus === "expired", sub.json?.effective?.effectiveStatus);
  check("needsRenewal = true", sub.json?.effective?.needsRenewal === true);

  console.log("── Cleanup ─────────────────────────────────────────────");
  await dbQuery(`DELETE FROM organisations WHERE id IN ($1, $2)`, [expiredOrgId, remindOrgId]);
  const leftover = await dbQuery(
    `SELECT COUNT(*)::int AS n FROM subscription_notifications WHERE org_id IN ($1, $2)`,
    [expiredOrgId, remindOrgId]
  );
  check("cleanup removed orgs + notifications (cascade)", leftover[0].n === 0, `leftover=${leftover[0].n}`);
  if (pg) await pg.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) { console.log("Failures:", failures.join(", ")); process.exit(1); }
}

main().catch((err) => { console.error("E2E crashed:", err); process.exit(1); });
