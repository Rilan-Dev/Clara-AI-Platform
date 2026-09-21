/**
 * scripts/bench-set-provider.mjs — benchmark helper: point the agent's
 * realtime voice axis at a provider (the same field the org portal writes).
 *
 * Usage: PROVIDER=openai AGENT=<uuid> node scripts/bench-set-provider.mjs
 */
import { Client } from "pg";
import { execSync } from "child_process";
const env = execSync("git show HEAD:.env").toString();
const get = (k) => (env.match(new RegExp("^"+k+"=(.*)$","m"))||[])[1]?.trim().replace(/^"|"$/g,"");
const c = new Client({ host: get("POSTGRES_HOST"), port: +get("POSTGRES_PORT"), user: get("POSTGRES_USER"), password: get("POSTGRES_PASSWORD"), database: get("POSTGRES_DB"), ssl: false });
await c.connect();
await c.query("UPDATE agent_ai_settings SET realtime_voice_provider = $1, updated_at = now() WHERE agent_id = $2", [process.env.PROVIDER, process.env.AGENT]);
console.log(`realtime_voice_provider → ${process.env.PROVIDER}`);
await c.end();
