// Diagnostic part 2: api_keys, platform_env_settings, languages, agents
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

async function show(c, title, sql) {
  try {
    const r = await c.query(sql);
    console.log(`\n=== ${title} ===`);
    r.rows.forEach(row => console.log(JSON.stringify(row)));
    if (r.rows.length === 0) console.log('(no rows)');
  } catch (e) { console.log(`\n=== ${title} === ERROR: ${e.message}`); }
}

(async () => {
  const c = new Client({
    host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB, connectionTimeoutMillis: 10000,
  });
  await c.connect();

  await show(c, 'api_keys COLUMNS',
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' ORDER BY ordinal_position`);
  await show(c, 'api_keys ROWS',
    `SELECT * FROM api_keys ORDER BY 1`);
  await show(c, 'platform_env_settings COLUMNS',
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_env_settings' ORDER BY ordinal_position`);
  await show(c, 'platform_env_settings ROWS',
    `SELECT * FROM platform_env_settings ORDER BY 1`);
  await show(c, 'elevenlabs_agents COLUMNS',
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='elevenlabs_agents' ORDER BY ordinal_position`);
  await show(c, 'elevenlabs_agents ROWS (summary)',
    `SELECT * FROM elevenlabs_agents ORDER BY 1`);
  await show(c, 'organisation_languages COLUMNS',
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='organisation_languages' ORDER BY ordinal_position`);
  await show(c, 'organisation_languages ROWS',
    `SELECT * FROM organisation_languages ORDER BY 1`);
  await show(c, 'agent_language_assignments COLUMNS',
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_language_assignments' ORDER BY ordinal_position`);
  await show(c, 'agent_language_assignments ROWS',
    `SELECT * FROM agent_language_assignments ORDER BY 1`);
  await show(c, 'phone_call_configs COLUMNS',
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='phone_call_configs' ORDER BY ordinal_position`);
  await show(c, 'phone_call_configs ROWS',
    `SELECT * FROM phone_call_configs ORDER BY 1`);

  await c.end();
})().catch(e => { console.error('ERROR:', JSON.stringify({ code: e.code, message: e.message })); process.exit(1); });
