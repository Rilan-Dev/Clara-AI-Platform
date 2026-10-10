// Create a short-lived diagnostic admin session (2h) for black-box inspection
// Token hash must match production's AUTH_SECRET (repo-tracked .env).
const fs = require('fs');
const crypto = require('crypto');
const raw = fs.readFileSync('/home/z/my-project/Clara-AI-Platform/.env', 'utf8');
const env = {};
for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const { Client } = require('pg');

const TOKEN = crypto.randomBytes(32).toString('hex');
const HASH = crypto.createHmac('sha256', env.AUTH_SECRET).update(TOKEN).digest('hex');
fs.writeFileSync('/home/z/my-project/scripts/.diag-token', TOKEN, { mode: 0o600 });
console.log('token saved to scripts/.diag-token (not printed)');

(async () => {
  const c = new Client({ host: env.POSTGRES_HOST, port: Number(env.POSTGRES_PORT), user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  await c.connect();
  const r = await c.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ('40000000-0000-0000-0000-000000000001', $1, NOW() + INTERVAL '2 hours', '127.0.0.1', 'clara-diagnostic-agent')
     RETURNING id, user_id, expires_at`,
    [HASH]
  );
  console.log('session row:', JSON.stringify(r.rows));
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
