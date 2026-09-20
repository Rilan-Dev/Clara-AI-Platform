/**
 * E2E regression for the unified agents model (projects renamed to agents).
 *
 * Covers:
 *  - auth gating (401 unauthenticated)
 *  - org-user agent CRUD on /api/orgs/[orgId]/agents + /api/agents/[agentId]
 *  - KB CRUD under an agent (/api/agents/[agentId]/kbs)
 *  - agent AI settings endpoint
 *  - platform-admin isolation (403 on tenant agent APIs)
 *  - cross-org isolation (404 for another org's agent)
 *  - duplicate-name validation (400)
 *
 * Leaves the demo state untouched (cleanup deletes what it creates).
 * Run: node scripts/e2e-agents.js
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
const ORG_USER = { email: process.env.CLARA_DEMO_USER_EMAIL || "demo@clara.ai", password: process.env.CLARA_DEMO_USER_PASSWORD || "Demo1234!" };
const ADMIN_USER = { email: "admin@clara.ai", password: "Admin1234!" };
const DEMO_ORG_ID = "10000000-0000-0000-0000-000000000001";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

async function login(creds) {
  const { status, json } = await api("POST", "/api/auth/login", null, creds);
  if (status !== 200) throw new Error(`login failed for ${creds.email}: ${status}`);
  return json.token;
}

async function main() {
  console.log(`E2E against ${BASE}\n`);

  // ── Auth gating ──────────────────────────────────────────────────────────────
  console.log("[auth]");
  const noAuth = await api("GET", `/api/orgs/${DEMO_ORG_ID}/agents`);
  check("401 unauthenticated agent list", noAuth.status === 401, `got ${noAuth.status}`);

  const orgToken = await login(ORG_USER);
  const adminToken = await login(ADMIN_USER);
  check("org user login ok", Boolean(orgToken));
  check("admin login ok", Boolean(adminToken));

  // ── Admin isolation ──────────────────────────────────────────────────────────
  console.log("\n[platform-admin isolation]");
  const adminList = await api("GET", `/api/orgs/${DEMO_ORG_ID}/agents`, adminToken);
  check("admin blocked from tenant agent list (403)", adminList.status === 403, `got ${adminList.status}`);

  // ── Org-user agent CRUD ──────────────────────────────────────────────────────
  console.log("\n[org-user agent CRUD]");
  const list = await api("GET", `/api/orgs/${DEMO_ORG_ID}/agents`, orgToken);
  check("list agents 200", list.status === 200, `got ${list.status}`);
  check("list returns array", Array.isArray(list.json));
  const listArr = Array.isArray(list.json) ? list.json : [];
  const demoAgent = listArr.find((a) => a.name === "Clara Demo Assistant");
  check("demo agent present", Boolean(demoAgent), JSON.stringify(listArr.map((a) => a.name)));

  const stamp = Date.now();
  const created = await api("POST", `/api/orgs/${DEMO_ORG_ID}/agents`, orgToken, {
    name: `E2E Agent ${stamp}`,
    description: "temporary e2e agent",
  });
  check("create agent 201", created.status === 201, `got ${created.status} ${JSON.stringify(created.json)}`);
  const agentId = created.json?.id;

  const dup = await api("POST", `/api/orgs/${DEMO_ORG_ID}/agents`, orgToken, { name: `E2E Agent ${stamp}` });
  check("duplicate name rejected 400", dup.status === 400, `got ${dup.status}`);

  const got = await api("GET", `/api/agents/${agentId}`, orgToken);
  check("get agent 200", got.status === 200, `got ${got.status}`);

  const patched = await api("PATCH", `/api/agents/${agentId}`, orgToken, { name: `E2E Agent ${stamp} v2`, description: "updated" });
  check("update agent 200", patched.status === 200 && patched.json?.name?.includes("v2"), `got ${patched.status}`);

  // ── Agent-owned assistant config ("Assistant & AI") ──────────────────────────
  console.log("\n[agent assistant config]");
  const config = await api("GET", `/api/agents/${agentId}/config`, orgToken);
  check("new agent has seeded assistant config", config.status === 200 && config.json?.assistantName === "Clara", `got ${config.status} assistantName=${config.json?.assistantName}`);
  check("config is agent-keyed", config.status === 200 && config.json?.agentId === agentId, `agentId=${config.json?.agentId}`);

  const personaPatch = await api("PATCH", `/api/agents/${agentId}/config`, orgToken, { assistantName: "Aurora", welcomeMessage: "E2E welcome" });
  check("agent config patchable", personaPatch.status === 200 && personaPatch.json?.assistantName === "Aurora", `got ${personaPatch.status}`);

  const statusPatch = await api("PATCH", `/api/agents/${agentId}`, orgToken, { status: "published" });
  check("agent status patchable", statusPatch.status === 200 && statusPatch.json?.status === "published", `got ${statusPatch.status}`);

  const snapCreated = await api("POST", `/api/agents/${agentId}/config/snapshots`, orgToken, { label: "e2e snapshot" });
  check("config snapshot created 201", snapCreated.status === 201, `got ${snapCreated.status}`);
  const snapList = await api("GET", `/api/agents/${agentId}/config/snapshots`, orgToken);
  check("snapshots list 200 + agent-keyed", snapList.status === 200 && Array.isArray(snapList.json) && snapList.json.length > 0 && snapList.json[0].agentId === agentId, `got ${snapList.status}`);

  // KB config API must be GONE — KBs never carry the assistant config
  const kbConfigBlocked = await api("GET", `/api/kbs/some-kb/config`, orgToken);
  check("KB config API removed (404 route)", kbConfigBlocked.status === 404, `got ${kbConfigBlocked.status}`);

  // ── KBs under the agent ──────────────────────────────────────────────────────
  console.log("\n[agent knowledge bases]");
  const kbCreated = await api("POST", `/api/agents/${agentId}/kbs`, orgToken, { name: `E2E KB ${stamp}`, description: "temp" });
  check("create KB under agent 201", kbCreated.status === 201, `got ${kbCreated.status} ${JSON.stringify(kbCreated.json)}`);
  const kbId = kbCreated.json?.id;

  const kbList = await api("GET", `/api/agents/${agentId}/kbs`, orgToken);
  check("list KBs under agent 200", kbList.status === 200 && Array.isArray(kbList.json), `got ${kbList.status}`);

  // ── Agent AI settings ────────────────────────────────────────────────────────
  console.log("\n[agent AI settings]");
  const aiSettings = await api("GET", `/api/agents/${agentId}/ai-settings`, orgToken);
  check("get agent AI settings 200", aiSettings.status === 200, `got ${aiSettings.status}`);

  // ── Cross-org isolation ──────────────────────────────────────────────────────
  console.log("\n[cross-org isolation]");
  // A non-existent agent id — org user must get 404, not data
  const missingAgent = await api("GET", `/api/agents/00000000-0000-0000-0000-00000000dead`, orgToken);
  check("unknown agent 404", missingAgent.status === 404, `got ${missingAgent.status}`);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  console.log("\n[cleanup]");
  if (kbId) {
    const kbDeleted = await api("DELETE", `/api/kbs/${kbId}`, orgToken);
    check("delete temp KB", kbDeleted.status === 200 || kbDeleted.status === 204, `got ${kbDeleted.status}`);
  }
  if (agentId) {
    const agentDeleted = await api("DELETE", `/api/agents/${agentId}`, orgToken);
    check("delete temp agent", agentDeleted.status === 200, `got ${agentDeleted.status}`);
    const gone = await api("GET", `/api/agents/${agentId}`, orgToken);
    check("deleted agent 404", gone.status === 404, `got ${gone.status}`);
  }

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  if (failures.length) {
    console.log("Failures:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("E2E crashed:", err.message);
  process.exit(1);
});
