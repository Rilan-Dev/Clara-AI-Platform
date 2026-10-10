// Fix: add production origin to the "Landing Demo" embed API key's allowed_origins
const fs = require('fs');
const raw = fs.readFileSync('/home/z/my-project/Clara-AI-Platform/.env', 'utf8');
const env = {};
for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const { Client } = require('pg');

(async () => {
  const c = new Client({ host: env.POSTGRES_HOST, port: Number(env.POSTGRES_PORT), user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB, connectionTimeoutMillis: 10000 });
  await c.connect();
  const before = await c.query(`SELECT id, name, key_prefix, allowed_origins, is_active FROM api_keys WHERE key_prefix='clr_463c2914ca28'`);
  console.log('BEFORE:', JSON.stringify(before.rows));
  const upd = await c.query(
    `UPDATE api_keys SET allowed_origins = ARRAY['https://clara.ai.amazetechclans.com'] WHERE key_prefix='clr_463c2914ca28' RETURNING id, name, allowed_origins, is_active`
  );
  console.log('AFTER:', JSON.stringify(upd.rows));
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
