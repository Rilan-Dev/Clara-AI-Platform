/**
 * scripts/update-orgs-tts-flash.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off ops script (2026-09-18 realtime-streaming optimization):
 * switch every org still on eleven_turbo_v2_5 to eleven_flash_v2_5.
 *
 * Why: ElevenLabs' official latency-optimization guide names Flash models
 * (~75 ms inference) as the first principle for real-time voice. The
 * production HAR from clara.ai.amazetechclans.com showed TTS resolving to
 * turbo with 4.5–8.5 s end-to-end latencies. Flash v2.5 is the same v2.5
 * family (quality parity for conversation), cheaper ($0.06 vs $0.08 / 1k
 * chars), and the platform default (DEFAULT_TTS_MODEL) already is flash.
 *
 * Revert: UPDATE org_ai_settings SET elevenlabs_tts_model='eleven_turbo_v2_5'
 *         WHERE org_id = '<id>' — or per-org in Settings → AI Providers.
 */
import fs from "node:fs";
import { Client } from "pg";

// The sandbox shell exports DATABASE_URL (sqlite file) which dotenv will NOT
// override — parse the repo .env explicitly for the postgres URL.
const envText = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const pgUrl = envText
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length);

const client = new Client({ connectionString: pgUrl });

try {
  await client.connect();

  const before = await client.query(
    `SELECT org_id, elevenlabs_tts_model FROM org_ai_settings
     WHERE elevenlabs_tts_model = 'eleven_turbo_v2_5'`,
  );
  console.log(`Orgs on turbo before: ${before.rows.length}`);
  for (const row of before.rows) {
    console.log(`  - ${row.org_id}`);
  }

  if (before.rows.length === 0) {
    console.log("Nothing to update — all orgs already off turbo.");
  } else {
    const updated = await client.query(
      `UPDATE org_ai_settings
       SET elevenlabs_tts_model = 'eleven_flash_v2_5',
           updated_at = NOW()
       WHERE elevenlabs_tts_model = 'eleven_turbo_v2_5'
       RETURNING org_id, elevenlabs_tts_model`,
    );
    console.log(`Updated ${updated.rows.length} org(s) to eleven_flash_v2_5:`);
    for (const row of updated.rows) {
      console.log(`  + ${row.org_id} → ${row.elevenlabs_tts_model}`);
    }
  }

  const after = await client.query(
    `SELECT elevenlabs_tts_model, COUNT(*) AS orgs FROM org_ai_settings
     WHERE elevenlabs_tts_model IS NOT NULL GROUP BY elevenlabs_tts_model`,
  );
  console.log("Final model distribution:", JSON.stringify(after.rows));
} catch (err) {
  console.error("Update failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
