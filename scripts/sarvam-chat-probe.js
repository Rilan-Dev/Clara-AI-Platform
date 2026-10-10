/* Direct Sarvam chat-completions probe using the platform's DB-stored key —
 * proves the chat URL + auth + model path that /api/embed/chat uses. */
const fs = require("fs");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const keyRow = await c.query(
    "SELECT value FROM platform_env_settings WHERE key = 'SARVAM_API_KEY'"
  );
  const chatModel = await c.query(
    "SELECT value FROM platform_env_settings WHERE key = 'SARVAM_CHAT_MODEL'"
  );
  await c.end();
  const key = keyRow.rows[0]?.value;
  const model = chatModel.rows[0]?.value || "sarvam-105b";
  if (!key) { console.log("NO KEY in DB"); return; }
  console.log("key len:", key.length, "| model:", model);

  const t0 = Date.now();
  const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": key },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: SARVAM_CHAT_OK" }],
      max_tokens: 20,
    }),
  });
  const ms = Date.now() - t0;
  const body = await res.text();
  console.log(`HTTP ${res.status} in ${ms}ms`);
  console.log(body.slice(0, 400));
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
