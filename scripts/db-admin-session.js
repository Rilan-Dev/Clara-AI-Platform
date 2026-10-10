#!/usr/bin/env node
/**
 * db-admin-session.js — mint a short-lived super-admin session row for E2E
 * browser verification (same mechanism /api/auth/login uses).
 *
 * Usage:
 *   node db-admin-session.js create   → prints JSON {token, sessionId}
 *   node db-admin-session.js revoke <sessionId>
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repo = path.join(__dirname, "..", "Clara-AI-Platform");
const envText = fs.readFileSync(path.join(repo, ".env"), "utf8");
const dbUrl = envText.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1];
const authSecret = envText.match(/^AUTH_SECRET="?([^"\n]+)"?$/m)?.[1];
if (!dbUrl || !authSecret) throw new Error("DATABASE_URL / AUTH_SECRET not found in .env");

const { Client } = require(path.join(repo, "node_modules", "pg"));

(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const cmd = process.argv[2];

  if (cmd === "create") {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHmac("sha256", authSecret).update(token).digest("hex");
    const { rows } = await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       SELECT id, $1, now() + interval '1 hour', '127.0.0.1', 'clara-e2e-theme-verification'
       FROM users WHERE is_super_admin = true AND status = 'active'
       ORDER BY created_at LIMIT 1
       RETURNING id, user_id, expires_at`,
      [tokenHash],
    );
    if (!rows[0]) throw new Error("No active super admin user found");
    console.log(JSON.stringify({ token, sessionId: rows[0].id, userId: rows[0].user_id, expiresAt: rows[0].expires_at }));
  } else if (cmd === "revoke") {
    const id = process.argv[3];
    await client.query("DELETE FROM sessions WHERE id = $1", [id]);
    console.log(JSON.stringify({ revoked: id }));
  } else {
    throw new Error("Usage: node db-admin-session.js create|revoke <sessionId>");
  }
  await client.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
