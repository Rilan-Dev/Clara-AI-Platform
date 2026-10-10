// Diagnostic 3: sessions table schema + admin users (no password hashes)
const fs = require('fs');
const raw = fs.readFileSync('/home/z/my-project/Clara-AI-Platform/.env', 'utf8');
const env = {};
for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const { Client } = require('pg');

(async () => {
  const c = new Client({ host: env.POSTGRES_HOST, port: Number(env.POSTGRES_PORT), user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  await c.connect();
  const s = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' ORDER BY ordinal_position`);
  console.log('sessions COLUMNS:');
  s.rows.forEach(r => console.log(' ', r.column_name, r.data_type));
  const uc = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position`);
  console.log('users COLUMNS:', uc.rows.map(r => r.column_name).join(', '));
  const u = await c.query(`SELECT id, email, full_name FROM users ORDER BY created_at LIMIT 10`);
  console.log('users:');
  u.rows.forEach(r => console.log(' ', JSON.stringify(r)));
  const sess = await c.query('SELECT count(*)::int AS n FROM sessions');
  console.log('session rows:', sess.rows[0].n);
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
