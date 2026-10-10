/**
 * scripts/verify-openai-incident-fix.mjs — one-shot post-deploy verification.
 *
 * Confirms the a8ebe2c OpenAI realtime 503 incident fix is live on production:
 *   - OLD build: 503 "OpenAI realtime voice is not configured for this tenant"
 *     (structural null: sarvam brain + agent realtime=openai)
 *   - FIXED build: either 200 + client_secret (OPENAI_API_KEY configured),
 *     or the accurate 503 "OPENAI_API_KEY is not configured on the server".
 *
 * Protocol (same as the 2026-09-21 latency benchmark session):
 *   1. snapshot the agent's realtime_voice_provider
 *   2. insert a temporary embed API key (clr_…, SHA-256 hashed) for the KB
 *   3. set realtime_voice_provider = 'openai'
 *   4. POST /api/embed/session with the temp key
 *   5. restore the provider, delete the temp key — ALWAYS (finally)
 */
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const KB_ID = "197fbb70-8565-4216-a5ed-a78489dcc9d4";
const BASE = "https://clara.ai.amazetechclans.com";
const DB_URL = process.env.DATABASE_URL;

const c = new Client({ connectionString: DB_URL, ssl: false });
let rawKey = null;
let keyId = null;
let originalProvider = null;
let agentId = null;

function sha256(v) { return createHash("sha256").update(v).digest("hex"); }

async function main() {
  await c.connect();

  // ── locate KB → agent, snapshot provider state ──────────────────────────
  const kb = await c.query(
    "SELECT k.id, k.agent_id, a.org_id FROM knowledge_bases k JOIN agents a ON a.id = k.agent_id WHERE k.id = $1",
    [KB_ID],
  );
  if (kb.rows.length === 0) throw new Error(`KB ${KB_ID} not found`);
  agentId = kb.rows[0].agent_id;
  const orgId = kb.rows[0].org_id;
  console.log(`KB ${KB_ID} → agent ${agentId} (org ${orgId})`);

  const settings = await c.query(
    "SELECT realtime_voice_provider FROM agent_ai_settings WHERE agent_id = $1",
    [agentId],
  );
  originalProvider = settings.rows[0]?.realtime_voice_provider ?? null;
  console.log(`current realtime_voice_provider: ${originalProvider}`);

  // ── temporary embed key ──────────────────────────────────────────────────
  rawKey = "clr_" + randomBytes(16).toString("hex");
  const ins = await c.query(
    `INSERT INTO api_keys (kb_id, org_id, name, key_prefix, key_hash, allowed_origins, is_active, rate_limit_per_hour)
     VALUES ($1, $2, 'temp-incident-verify', $3, $4, '{}', TRUE, 60)
     RETURNING id`,
    [KB_ID, orgId, rawKey.slice(0, 8), sha256(rawKey)],
  );
  keyId = ins.rows[0].id;
  console.log(`temp embed key created: ${rawKey.slice(0, 12)}… (id ${keyId})`);

  // ── flip provider to openai (the incident scenario) ──────────────────────
  await c.query(
    "UPDATE agent_ai_settings SET realtime_voice_provider = 'openai', updated_at = now() WHERE agent_id = $1",
    [agentId],
  );
  console.log("realtime_voice_provider → openai (incident scenario)");

  // ── probe the live endpoint ──────────────────────────────────────────────
  const res = await fetch(`${BASE}/api/embed/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawKey}` },
    body: JSON.stringify({ kbId: KB_ID }),
  });
  const bodyText = await res.text();
  let verdict;
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch { /* non-JSON */ }

  if (res.status === 200 && parsed?.realtime?.client_secret) {
    verdict = "FIXED+WORKING — 200 + OpenAI realtime client_secret";
  } else if (res.status === 503 && /OPENAI_API_KEY is not configured on the server/.test(bodyText)) {
    verdict = "FIXED (routing OK) — server lacks OPENAI_API_KEY (accurate 503, not the structural tenant-null error)";
  } else if (/not configured for this tenant/.test(bodyText)) {
    verdict = "OLD BROKEN BUILD STILL DEPLOYED — structural tenant 503 reproduced";
  } else {
    verdict = `UNEXPECTED — HTTP ${res.status}`;
  }

  console.log("────────────────────────────────────────────");
  console.log(`HTTP ${res.status}`);
  console.log(bodyText.slice(0, 600));
  console.log(`VERDICT: ${verdict}`);

  return { status: res.status, verdict };
}

try {
  await main();
} catch (e) {
  console.error("verification failed:", e.message);
  process.exitCode = 1;
} finally {
  // ── ALWAYS restore state ──────────────────────────────────────────────────
  try {
    if (c._connected) {
      if (agentId && originalProvider !== null) {
        await c.query(
          "UPDATE agent_ai_settings SET realtime_voice_provider = $1, updated_at = now() WHERE agent_id = $2",
          [originalProvider, agentId],
        );
        console.log(`restored realtime_voice_provider → ${originalProvider}`);
      } else if (agentId) {
        await c.query(
          "UPDATE agent_ai_settings SET realtime_voice_provider = NULL, updated_at = now() WHERE agent_id = $1",
          [agentId],
        );
        console.log("restored realtime_voice_provider → NULL (was unset)");
      }
      if (keyId) {
        await c.query("DELETE FROM api_keys WHERE id = $1", [keyId]);
        console.log("temp embed key deleted");
      }
    }
    await c.end();
  } catch (cleanupError) {
    console.error("CLEANUP FAILED:", cleanupError.message);
    process.exitCode = 1;
  }
}
