/**
 * fix-cors-origins.mjs
 * Run from the clara-backend directory:
 *   node fix-cors-origins.mjs
 *
 * Adds https:// and localhost dev origins to the AmazeTechCLANS embed API key.
 * Safe to run multiple times (idempotent).
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const path = require("path");
const fs   = require("fs");

// Load .env manually (no dotenv dependency assumed)
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
}

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://clara:clarapassword@clara-postgres:5432/clara_platform?sslmode=disable";

const pool = new Pool({ connectionString: DATABASE_URL });

// The prefix of the embed API key shown in the Clara Deploy tab.
// Token: clr_b9b4d8507e2981c048e4fca1f9d3ce2bf616e1c17bc5ad3b
const KEY_PREFIX = "clr_b9b4d8";

const REQUIRED_ORIGINS = [
  "http://amazetechclans.com",
  "https://amazetechclans.com",
  "http://www.amazetechclans.com",
  "https://www.amazetechclans.com",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:4000",
];

async function main() {
  const client = await pool.connect();
  try {
    // Show before state
    const before = await client.query(
      "SELECT id, name, key_prefix, allowed_origins FROM api_keys WHERE key_prefix = $1",
      [KEY_PREFIX]
    );

    if (!before.rows.length) {
      console.error(`❌  No API key found with prefix "${KEY_PREFIX}". Check the prefix.`);
      process.exit(1);
    }

    console.log("\n📋 Before update:");
    console.table(before.rows);

    // Merge: keep existing origins, add any missing ones
    const existing = (before.rows[0].allowed_origins ?? []);
    const merged = [...new Set([...existing, ...REQUIRED_ORIGINS])];
    const result = await client.query(
      `UPDATE api_keys SET allowed_origins = $1 WHERE key_prefix = $2 RETURNING id, name, key_prefix, allowed_origins`,
      [merged, KEY_PREFIX]
    );

    console.log("\n✅  After update:");
    console.table(result.rows);
    console.log("\n🎉  Done! Refresh your browser — the CORS block should be gone.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
