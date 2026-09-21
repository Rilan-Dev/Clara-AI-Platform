/**
 * scripts/bench-set-provider.mjs — benchmark helper: point the agent's
 * realtime voice axis at a provider (the same field the org portal writes).
 *
 * Usage: PROVIDER=openai AGENT=<uuid> node scripts/bench-set-provider.mjs
 */
import { Client } from "pg";
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");
const c = new Client({ connectionString });
await c.connect();
await c.query("UPDATE agent_ai_settings SET realtime_voice_provider = $1, updated_at = now() WHERE agent_id = $2", [process.env.PROVIDER, process.env.AGENT]);
console.log(`realtime_voice_provider → ${process.env.PROVIDER}`);
await c.end();
