/**
 * Read-only diagnostic: resolve the demo embed key (clr_463c...) state in the
 * production DB — api_keys row, allowed_origins, KB status, embed_api_key row.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(here, "..", "..", "Clara-AI-Platform", ".env"), "utf8");
const envUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const client = new pg.Client({ connectionString: envUrl ?? process.env.DATABASE_URL });

const KEY = "clr_463c2914ca2872807a82189a0d0b30d0d8c68322eed688c3";
const keyHash = createHash("sha256").update(KEY).digest("hex");

async function main() {
  await client.connect();

  console.log("== embed_api_key (demo plaintext store) ==");
  const { rows: eak } = await client.query(
    `SELECT key, kb_id, org_id, updated_at FROM embed_api_key ORDER BY updated_at DESC LIMIT 3`,
  );
  for (const r of eak) console.log(JSON.stringify(r));

  console.log("\n== api_keys row for the demo key ==");
  const { rows: ak } = await client.query(
    `SELECT id, kb_id, org_id, name, key_prefix, allowed_origins, is_active, rate_limit_per_hour, created_at
       FROM api_keys WHERE key_hash = $1`,
    [keyHash],
  );
  for (const r of ak) console.log(JSON.stringify(r, null, 2));

  console.log("\n== KB status for the demo KB ==");
  const { rows: kb } = await client.query(
    `SELECT id, name, status, agent_id FROM knowledge_bases WHERE id = '30000000-0000-0000-0000-000000000001'`,
  );
  for (const r of kb) console.log(JSON.stringify(r, null, 2));

  console.log("\n== All api_keys (prefix + origins) for context ==");
  const { rows: all } = await client.query(
    `SELECT key_prefix, allowed_origins, is_active, kb_id FROM api_keys ORDER BY created_at`,
  );
  for (const r of all) console.log(JSON.stringify(r));

  await client.end();
}

main().catch((err) => { console.error("failed:", err.message); process.exit(1); });
