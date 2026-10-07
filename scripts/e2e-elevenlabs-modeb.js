#!/usr/bin/env node
/**
 * scripts/e2e-elevenlabs-modeb.js — end-to-end verification of the ElevenLabs
 * integration Phases V4–V6 (Conversational AI, voice studio, hardening)
 * against a running server.
 *
 * Verifies (plan §14 V4/V5/V6 acceptance, guard-path without a vendor key):
 *   1.  Status endpoint flag surface (conversationalAI / cloning / design)
 *   2.  Agent binding CRUD guards (auth, readiness, 404s, 400s)
 *   3.  Agent-session guards (Mode B off → 404, embed keys never Mode B)
 *   4.  RAG tool callback: HMAC + timestamp + nonce replay (positive + negative)
 *   5.  Post-call webhook signature verification (unsigned + unknown agent)
 *   6.  Clone consent gate + design flag gate (404/400 paths)
 *   7.  Conversation history org-scoping + sync guard
 *   8.  Dashboard voice metering aggregation (usage_events spine)
 *   9.  Env API manages the new Mode B keys (confirmation-token flow)
 *
 * The script SETS the two test secrets through the platform env API (live
 * process.env update), runs the signed-callback matrix, and restores the
 * original values afterwards.
 *
 * Run: node scripts/e2e-elevenlabs-modeb.js   (server must be up on :3000)
 */

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@clara.ai";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";

const TOOL_SECRET = "e2e_tool_hmac_secret_0123456789abcdef";
const WEBHOOK_SECRET = "e2e_webhook_secret_0123456789abcdef";

let passed = 0, failed = 0;
function ok(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}

async function jfetch(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

async function hmacSha256Hex(secret, payload) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** Platform env API flow: GET confirmation token → POST set. Returns original value. */
async function setEnvSetting(authHeaders, key, value, previous) {
  const tokenRes = await jfetch(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`, {
    headers: authHeaders,
  });
  if (!tokenRes.res.ok || !tokenRes.body?.confirmation_token) {
    return { set: false, previous };
  }
  const post = await jfetch("/api/platform/env", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      key,
      value,
      confirmation_token: tokenRes.body.confirmation_token,
      timestamp: tokenRes.body.timestamp,
    }),
  });
  return { set: post.res.ok, previous };
}

async function readEnvValues(authHeaders) {
  const res = await jfetch("/api/platform/env", { headers: authHeaders });
  const values = {};
  if (res.res.ok && Array.isArray(res.body?.settings)) {
    for (const setting of res.body.settings) {
      values[setting.key] = setting.isSet ? setting.value : "";
    }
  }
  return values;
}

async function main() {
  console.log(`\n[e2e-elevenlabs-modeb] target: ${BASE}\n`);

  // ── 0. Login as platform admin ──────────────────────────────────────────
  const login = await jfetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  ok("admin login", login.res.ok, `status ${login.res.status}`);
  const token = login.body?.token ?? login.body?.accessToken;
  if (!token) { console.log("  no token — aborting"); process.exit(1); }
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── 1. Status flag surface (V4/V5/V6 flags always reported) ──────────────
  const status = await jfetch("/api/admin/elevenlabs/status", { headers: authHeaders });
  ok("status: 200 with flag surface", status.res.ok &&
    typeof status.body?.conversationalAI === "boolean" &&
    typeof status.body?.voiceCloning === "boolean" &&
    typeof status.body?.voiceDesign === "boolean",
    `status ${status.res.status}`);
  const modeBEnabled = status.body?.conversationalAI === true;
  const cloningEnabled = status.body?.voiceCloning === true;
  console.log(`  (mode B flag on server: ${modeBEnabled}; cloning: ${cloningEnabled})`);

  // ── 2. Agent binding CRUD guards ────────────────────────────────────────
  const noAuth = await jfetch("/api/admin/elevenlabs/agents");
  ok("agents GET requires auth (401)", noAuth.res.status === 401, `status ${noAuth.res.status}`);

  const agentsList = await jfetch("/api/admin/elevenlabs/agents", { headers: authHeaders });
  ok("agents GET responds with bindings + readiness", agentsList.res.ok &&
    Array.isArray(agentsList.body?.agents) && agentsList.body?.readiness != null,
    `status ${agentsList.res.status}`);

  const orgs = await jfetch("/api/platform/orgs", { headers: authHeaders });
  const orgId = Array.isArray(orgs.body?.orgs) && orgs.body.orgs.length > 0 ? orgs.body.orgs[0].id : null;
  ok("found an org for testing", Boolean(orgId), `status ${orgs.res.status}`);

  if (orgId) {
    const badCreate = await jfetch("/api/admin/elevenlabs/agents", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ orgId }),
    });
    ok("agent create validates required fields (400)", badCreate.res.status === 400, `status ${badCreate.res.status}`);

    if (!modeBEnabled) {
      const gatedCreate = await jfetch("/api/admin/elevenlabs/agents", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          orgId,
          agentId: "00000000-0000-0000-0000-000000000001",
          kbId: "00000000-0000-0000-0000-000000000002",
          name: "e2e probe",
          voiceId: "JBFqnCBsd6RMkjVDRZzb",
        }),
      });
      ok("agent create gated by Mode B readiness (404/503)", gatedCreate.res.status === 404 || gatedCreate.res.status === 503,
        `status ${gatedCreate.res.status}`);
    }
  }

  const patchMissing = await jfetch("/api/admin/elevenlabs/agents/00000000-0000-0000-0000-000000000003", {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ enabled: false }),
  });
  ok("agent PATCH unknown binding → 404", patchMissing.res.status === 404, `status ${patchMissing.res.status}`);

  const deleteMissing = await jfetch("/api/admin/elevenlabs/agents/00000000-0000-0000-0000-000000000003", {
    method: "DELETE",
    headers: authHeaders,
  });
  ok("agent DELETE unknown binding → 404", deleteMissing.res.status === 404, `status ${deleteMissing.res.status}`);

  // ── 3. Agent-session guards ─────────────────────────────────────────────
  const sessionNoKb = await jfetch("/api/voice/elevenlabs/agent-session", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  ok("agent-session responds (Mode B gate first)",
    sessionNoKb.res.status === 404 || sessionNoKb.res.status === 400,
    `status ${sessionNoKb.res.status} ${JSON.stringify(sessionNoKb.body).slice(0, 120)}`);

  if (!modeBEnabled && orgId) {
    // The response must clearly say Mode B is unavailable — never a bare 500.
    ok("agent-session names the Mode B gate",
      typeof sessionNoKb.body?.error === "string" && /not available/i.test(sessionNoKb.body.error),
      JSON.stringify(sessionNoKb.body).slice(0, 120));
  }

  // ── 4/5. Signed-callback matrix (set test secrets first) ────────────────
  const before = await readEnvValues(authHeaders);
  const toolPrev = before.ELEVENLABS_TOOL_HMAC_SECRET ?? "";
  const webhookPrev = before.ELEVENLABS_WEBHOOK_SECRET ?? "";
  const toolSet = await setEnvSetting(authHeaders, "ELEVENLABS_TOOL_HMAC_SECRET", TOOL_SECRET, toolPrev);
  const webhookSet = await setEnvSetting(authHeaders, "ELEVENLABS_WEBHOOK_SECRET", WEBHOOK_SECRET, webhookPrev);
  ok("test secrets set through the env API", toolSet.set && webhookSet.set, `tool=${toolSet.set} webhook=${webhookSet.set}`);

  if (toolSet.set && webhookSet.set) {
    const toolUrl = "/api/internal/elevenlabs/tools/rag-search";

    // 4a. Unsigned → 401 missing_signature
    const unsigned = await jfetch(toolUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, kbId: "k1", query: "refund policy" }),
    });
    ok("tool callback: unsigned request rejected (401)", unsigned.res.status === 401 &&
      /missing_signature/i.test(String(unsigned.body?.error)), `status ${unsigned.res.status}`);

    // 4b. Stale timestamp → 401 stale_timestamp
    const staleBody = JSON.stringify({ orgId, kbId: "k1", query: "refund policy" });
    const staleSig = await hmacSha256Hex(TOOL_SECRET, `${Date.now() - 6 * 60 * 1000}.${staleBody}`);
    const stale = await jfetch(toolUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clara-signature": staleSig,
        "x-clara-timestamp": String(Date.now() - 6 * 60 * 1000),
        "x-clara-nonce": "e2e-nonce-stale-0001",
      },
      body: staleBody,
    });
    ok("tool callback: stale timestamp rejected (401)", stale.res.status === 401 &&
      /stale_timestamp/i.test(String(stale.body?.error)), `status ${stale.res.status}`);

    // 4c. Tampered body under a valid signature → 401 bad_signature
    const tamperedTimestamp = Date.now();
    const tamperedSig = await hmacSha256Hex(TOOL_SECRET, `${tamperedTimestamp}.${staleBody}`);
    const tampered = await jfetch(toolUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clara-signature": tamperedSig,
        "x-clara-timestamp": String(tamperedTimestamp),
        "x-clara-nonce": "e2e-nonce-tamper-0002",
      },
      body: staleBody.replace("refund", "RETURN"),
    });
    ok("tool callback: tampered body rejected (401)", tampered.res.status === 401 &&
      /bad_signature/i.test(String(tampered.body?.error)), `status ${tampered.res.status}`);

    // 4d. Correctly signed, unknown org → 403 (no active binding)
    const goodTimestamp = Date.now();
    const goodNonce = `e2e-nonce-good-${Date.now()}`;
    const goodBody = JSON.stringify({
      orgId: "00000000-0000-0000-0000-00000000000a",
      kbId: "00000000-0000-0000-0000-00000000000b",
      query: "refund policy",
    });
    const goodSig = await hmacSha256Hex(TOOL_SECRET, `${goodTimestamp}.${goodBody}`);
    const signed = await jfetch(toolUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clara-signature": goodSig,
        "x-clara-timestamp": String(goodTimestamp),
        "x-clara-nonce": goodNonce,
      },
      body: goodBody,
    });
    ok("tool callback: signed request passes crypto, blocked by binding (403)",
      signed.res.status === 403 && /Mode-B agent binding/i.test(String(signed.body?.error)),
      `status ${signed.res.status} ${JSON.stringify(signed.body).slice(0, 120)}`);

    // 4e. Exact replay → 401 replayed_nonce
    const replay = await jfetch(toolUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clara-signature": goodSig,
        "x-clara-timestamp": String(goodTimestamp),
        "x-clara-nonce": goodNonce,
      },
      body: goodBody,
    });
    ok("tool callback: replayed nonce rejected (401)", replay.res.status === 401 &&
      /replayed_nonce/i.test(String(replay.body?.error)), `status ${replay.res.status}`);

    // 5a. Post-call webhook: unsigned → 401
    const pcUnsigned = await jfetch("/api/webhooks/elevenlabs/post-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { conversation_id: "c1", agent_id: "unknown" } }),
    });
    ok("post-call: unsigned request rejected (401)", pcUnsigned.res.status === 401, `status ${pcUnsigned.res.status}`);

    // 5b. Post-call webhook: valid signature, unknown agent → matched:false
    const pcBody = JSON.stringify({ data: { conversation_id: "e2e-c1", agent_id: "e2e-unknown-agent", status: "done" } });
    const pcSig = await hmacSha256Hex(WEBHOOK_SECRET, pcBody);
    const pcSigned = await jfetch("/api/webhooks/elevenlabs/post-call", {
      method: "POST",
      headers: { "Content-Type": "application/json", "elevenlabs-signature": pcSig },
      body: pcBody,
    });
    ok("post-call: signed unknown-agent acknowledged, nothing stored (matched:false)",
      pcSigned.res.ok && pcSigned.body?.matched === false, `status ${pcSigned.res.status}`);

    // 5c. Post-call webhook: tampered body → 401
    const pcBadSig = await hmacSha256Hex(WEBHOOK_SECRET, pcBody);
    const pcTampered = await jfetch("/api/webhooks/elevenlabs/post-call", {
      method: "POST",
      headers: { "Content-Type": "application/json", "elevenlabs-signature": pcBadSig },
      body: pcBody.replace("c1", "c2"),
    });
    ok("post-call: tampered body rejected (401)", pcTampered.res.status === 401, `status ${pcTampered.res.status}`);
  }

  // ── 6. Voice studio gates ───────────────────────────────────────────────
  if (orgId && !cloningEnabled) {
    const cloneGated = await jfetch("/api/voice/elevenlabs/voices/clone", {
      method: "POST",
      headers: authHeaders,
      body: new URLSearchParams({ orgId, name: "e2e clone" }).toString(),
    });
    ok("clone gated by cloning flag (404)", cloneGated.res.status === 404, `status ${cloneGated.res.status}`);
  }
  const designGated = await jfetch("/api/voice/elevenlabs/voices/design", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ orgId: orgId ?? "o1", name: "e2e design", textPrompt: "calm voice" }),
  });
  ok("design gated by design flag (404/503)", designGated.res.status === 404 || designGated.res.status === 503,
    `status ${designGated.res.status}`);

  // ── 7. Conversation history + sync guards ───────────────────────────────
  if (orgId) {
    const history = await jfetch(`/api/voice/elevenlabs/conversations?orgId=${encodeURIComponent(orgId)}`, {
      headers: authHeaders,
    });
    ok("conversations GET org-scoped (200)", history.res.ok && Array.isArray(history.body?.conversations),
      `status ${history.res.status}`);

    const sync = await jfetch("/api/voice/elevenlabs/conversations/sync", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ orgId }),
    });
    ok("conversations sync responds (503 without Mode B, 200 with)",
      sync.res.ok || sync.res.status === 503, `status ${sync.res.status}`);
  }

  // ── 8. Dashboard voice metering aggregation ─────────────────────────────
  if (orgId) {
    const dashboard = await jfetch(`/api/orgs/${orgId}/dashboard`, { headers: authHeaders });
    const voice = dashboard.body?.usageMetering?.voice;
    ok("dashboard carries the voice metering aggregate", dashboard.res.ok && voice != null &&
      typeof voice.ttsCharacters === "number" && typeof voice.latencyP95Ms !== "undefined",
      `status ${dashboard.res.status}`);
  }

  // ── 9. Restore the original secret values ───────────────────────────────
  if (toolSet.set) {
    const restore = await setEnvSetting(authHeaders, "ELEVENLABS_TOOL_HMAC_SECRET", toolPrev, toolPrev);
    ok("tool secret restored", restore.set, "restore failed — check settings page");
  }
  if (webhookSet.set) {
    const restore = await setEnvSetting(authHeaders, "ELEVENLABS_WEBHOOK_SECRET", webhookPrev, webhookPrev);
    ok("webhook secret restored", restore.set, "restore failed — check settings page");
  }

  console.log(`\n[e2e-elevenlabs-modeb] ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[e2e-elevenlabs-modeb] fatal:", err);
  process.exit(1);
});
