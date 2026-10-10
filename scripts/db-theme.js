#!/usr/bin/env node
/**
 * db-theme.js — read/set DEFAULT_THEME_MODE in platform_env_settings.
 * Usage: node db-theme.js [light|dark|system]
 */
const fs = require("fs");
const path = require("path");

const envText = fs.readFileSync(path.join(__dirname, "..", "Clara-AI-Platform", ".env"), "utf8");
const m = envText.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
if (!m) throw new Error("DATABASE_URL not found in .env");

const { Client } = require(path.join(__dirname, "..", "Clara-AI-Platform", "node_modules", "pg"));

(async () => {
  const client = new Client({ connectionString: m[1] });
  await client.connect();
  const mode = process.argv[2];
  if (mode) {
    await client.query(
      "UPDATE platform_env_settings SET value = $1, updated_at = now() WHERE key = 'DEFAULT_THEME_MODE'",
      [mode],
    );
  }
  const { rows } = await client.query(
    "SELECT key, value, updated_at FROM platform_env_settings WHERE key = 'DEFAULT_THEME_MODE'",
  );
  console.log(JSON.stringify(rows[0] ?? null));
  await client.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
