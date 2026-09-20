/**
 * scripts/update-demo-org-voice-elevenlabs.mjs
 * Ops: the landing-page demo embeds (embed_api_key clr_463c…) resolve to the
 * "Clara" demo organisation, whose voice provider was never set (NULL →
 * inherits the brain provider = OpenAI). The platform admin runs ElevenLabs
 * as the primary voice provider (the other production org already has
 * voice_provider='elevenlabs'), so the demo surfaces were silently consuming
 * OpenAI — the exact inconsistency reported ("floating button = ElevenLabs,
 * landing iframe demo = OpenAI").
 *
 * Sets voice_provider='elevenlabs' on the demo org ONLY when it is currently
 * NULL (non-destructive; revert any time via Settings → AI Providers).
 * Run: node scripts/update-demo-org-voice-elevenlabs.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(here, "..", ".env"), "utf8");
const envUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const connectionString = envUrl ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();

  // The org the landing demo key resolves to (embed_api_key stores the
  // plaintext; api_keys only keeps the sha256 hash + prefix — hash in Node,
  // exactly like the app's hashKey()).
  const { rows: embedRows } = await client.query(
    `SELECT key FROM embed_api_key ORDER BY updated_at DESC LIMIT 1`,
  );
  if (embedRows.length === 0) {
    console.error("No embed_api_key row — nothing to do.");
    process.exit(1);
  }
  const keyHash = createHash("sha256").update(embedRows[0].key).digest("hex");
  const { rows: keyRows } = await client.query(
    `SELECT ak.kb_id, a.org_id, o.name AS org_name
       FROM api_keys ak
       JOIN knowledge_bases kb ON kb.id = ak.kb_id
       JOIN agents a ON a.id = kb.agent_id
       JOIN organisations o ON o.id = a.org_id
      WHERE ak.key_hash = $1 AND ak.is_active = TRUE
      LIMIT 1`,
    [keyHash],
  );
  if (keyRows.length === 0) {
    console.error("No embed_api_key row resolves to an api_keys entry — nothing to do.");
    process.exit(1);
  }
  const { org_id: orgId, org_name: orgName } = keyRows[0];
  console.log(`Demo key resolves to org "${orgName}" (${orgId})`);

  const { rows: before } = await client.query(
    `SELECT voice_provider, realtime_voice_provider FROM org_ai_settings WHERE org_id = $1`,
    [orgId],
  );
  console.log("Before:", JSON.stringify(before[0] ?? "(no settings row)"));

  if (before[0]?.voice_provider != null) {
    console.log(`voice_provider already set to "${before[0].voice_provider}" — leaving untouched.`);
    await client.end();
    return;
  }

  await client.query(
    `INSERT INTO org_ai_settings (org_id, voice_provider)
     VALUES ($1, 'elevenlabs')
     ON CONFLICT (org_id) DO UPDATE SET voice_provider = 'elevenlabs', updated_at = now()`,
    [orgId],
  );

  const { rows: after } = await client.query(
    `SELECT voice_provider, realtime_voice_provider FROM org_ai_settings WHERE org_id = $1`,
    [orgId],
  );
  console.log("After:", JSON.stringify(after[0]));
  console.log("✅ demo org voice provider = elevenlabs (realtime axis still NULL → follows voice-chat)");
  await client.end();
}

main().catch((err) => {
  console.error("❌ failed:", err.message);
  process.exit(1);
});
