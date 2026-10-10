// Set ELEVENLABS_TOOL_HMAC_SECRET via the official two-step platform env API
const fs = require('fs');
const crypto = require('crypto');
const raw = fs.readFileSync('/home/z/my-project/Clara-AI-Platform/.env', 'utf8');
const env = {};
for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

const TOKEN = fs.readFileSync('/home/z/my-project/scripts/.diag-token', 'utf8').trim();
const SECRET = crypto.randomBytes(32).toString('hex'); // 64 hex chars = 256 bits
const KEY = 'ELEVENLABS_TOOL_HMAC_SECRET';
const BASE = 'https://clara.ai.amazetechclans.com';

(async () => {
  // Step 1: confirmation token
  const r1 = await fetch(`${BASE}/api/platform/env?token=1&key=${encodeURIComponent(KEY)}&value=${encodeURIComponent(SECRET)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j1 = await r1.json();
  console.log('step1 status:', r1.status, JSON.stringify({ ...j1, confirmation_token: j1.confirmation_token ? '<token-received>' : undefined }));
  if (!r1.ok || !j1.confirmation_token) throw new Error('no confirmation token');

  // Step 2: save
  const r2 = await fetch(`${BASE}/api/platform/env`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: KEY, value: SECRET, confirmation_token: j1.confirmation_token, timestamp: j1.timestamp }),
  });
  const j2 = await r2.json();
  console.log('step2 status:', r2.status, JSON.stringify(j2));

  // Store secret for later verification steps (local only)
  fs.writeFileSync('/home/z/my-project/scripts/.modeb-secret', SECRET, { mode: 0o600 });
  console.log('secret saved locally to scripts/.modeb-secret (not printed)');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
