// Diagnostic: inspect production DB state for embed API key 403 investigation
// Reads DATABASE_URL from Clara-AI-Platform/.env
const fs = require('fs');

function loadEnv() {
  const raw = fs.readFileSync('/home/z/my-project/Clara-AI-Platform/.env', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.POSTGRES_HOST || '180.188.231.138',
    port: Number(process.env.POSTGRES_PORT || 1234),
    user: process.env.POSTGRES_USER || 'clara',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'clara_platform',
    connectionTimeoutMillis: 10000,
  });
  await c.connect();

  // 1. All tables
  const tables = await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  console.log('=== TABLES ===');
  console.log(tables.rows.map(r => r.table_name).join('\n'));

  // 2. embed_api_key columns
  const cols = await c.query(
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='embed_api_key' ORDER BY ordinal_position`
  );
  console.log('\n=== embed_api_key COLUMNS ===');
  cols.rows.forEach(r => console.log(`${r.column_name} (${r.data_type}) default=${r.column_default}`));

  // 3. The specific key record(s)
  const keys = await c.query(
    `SELECT * FROM embed_api_key ORDER BY id`
  );
  console.log('\n=== embed_api_key ROWS ===');
  keys.rows.forEach(r => {
    const k = r.key || '';
    console.log(JSON.stringify({ ...r, key: k.slice(0, 12) + '...' + k.slice(-6), len: k.length }));
  });

  await c.end();
})().catch(e => { console.error('ERROR:', JSON.stringify({ code: e.code, errno: e.errno, message: e.message, detail: e.detail, hint: e.hint }, null, 2)); process.exit(1); });
