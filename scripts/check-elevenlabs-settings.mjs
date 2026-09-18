/**
 * scripts/check-elevenlabs-settings.mjs
 * One-off diagnostic: inspect live org ElevenLabs voice settings + platform
 * env seeds relevant to the realtime-streaming optimization work.
 */
import fs from "node:fs";
import { Client } from "pg";

// The sandbox shell exports DATABASE_URL (sqlite file) which dotenv will NOT
// override — so parse the repo .env explicitly for the postgres URL.
const envText = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const pgUrl = envText
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length);
const client = new Client({ connectionString: pgUrl });

const queries = {
  orgSettings: `
    SELECT org_id, voice_provider, elevenlabs_tts_model, elevenlabs_stt_model,
           default_elevenlabs_voice
    FROM org_ai_settings
    WHERE voice_provider = 'elevenlabs' OR elevenlabs_tts_model IS NOT NULL`,
  platformSeeds: `
    SELECT key, value FROM platform_env
    WHERE key LIKE 'ELEVENLABS%' ORDER BY key`,
  agentVoiceRows: `
    SELECT a.org_id, COUNT(*) AS voice_rows
    FROM organisation_voices v JOIN agents a ON a.id = v.agent_id
    WHERE v.provider = 'elevenlabs'
    GROUP BY a.org_id`,
};

try {
  await client.connect();
  for (const [name, sql] of Object.entries(queries)) {
    const res = await client.query(sql);
    console.log(`── ${name} ──`);
    console.log(JSON.stringify(res.rows, null, 2));
  }
} catch (err) {
  console.error("Query failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
