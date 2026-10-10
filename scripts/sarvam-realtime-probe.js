/**
 * Live probe of the Sarvam realtime WebSocket (E2E verification of the
 * saaras:v3 → saaras:v3-realtime model fix).
 *
 *   Case A: model=saaras:v3          → EXPECT the exact production fatal error
 *                                       ("Invalid model 'saaras:v3'...")
 *   Case B: model=saaras:v3-realtime → EXPECT a clean open, no error frame
 *
 * Key + base URL come from the production DB (platform_env_settings).
 */
const fs = require("fs");
const WebSocket = require("/home/z/my-project/Clara-AI-Platform/node_modules/ws");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

function probe(baseUrl, apiKey, model) {
  return new Promise((resolve) => {
    const url =
      `${baseUrl}/speech-to-text-realtime/ws` +
      `?language_code=en-IN` +
      `&model=${encodeURIComponent(model)}` +
      `&stream_type=fast` +
      `&encoding=linear16` +
      `&sample_rate=16000` +
      `&endpointing=vad` +
      `&threshold=0.3` +
      `&silence_duration_ms=500` +
      `&min_speech_duration_ms=250`;

    const ws = new WebSocket(url, { headers: { "api-subscription-key": apiKey } });
    const result = { model, opened: false, events: [], closeCode: null };
    const done = setTimeout(() => finish("timeout-5s-clean-open"), 5000);

    function finish(reason) {
      clearTimeout(done);
      result.reason = reason;
      try { ws.close(); } catch (_) {}
      resolve(result);
    }

    ws.on("open", () => {
      result.opened = true;
      result.events.push({ type: "status", value: "connected" });
      // Stay open briefly to catch a post-connect error frame (like production's).
    });
    ws.on("message", (data) => {
      let ev;
      try { ev = JSON.parse(data.toString()); } catch { return; }
      result.events.push(ev);
      if (ev.type === "error" && (ev.is_fatal || ev.fatal)) finish("fatal-error-frame");
    });
    ws.on("close", (code, reason) => {
      result.closeCode = code;
      result.closeReason = reason?.toString?.() ?? "";
      if (!result.reason) finish(`closed-${code}`);
    });
    ws.on("error", (err) => {
      result.socketError = err.message;
      finish("socket-error");
    });
  });
}

(async () => {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  const r = await c.query(
    "select key, value from platform_env_settings where key in ('SARVAM_API_KEY','SARVAM_BASE_URL')"
  );
  await c.end();

  const row = (k) => r.rows.find((x) => x.key === k);
  const apiKey = (row("SARVAM_API_KEY")?.value || "").trim();
  const baseUrl = (row("SARVAM_BASE_URL")?.value || "https://api.sarvam.ai").trim();
  if (!apiKey) throw new Error("SARVAM_API_KEY missing from platform_env_settings");
  console.log(`baseUrl=${baseUrl}  key=${apiKey.slice(0, 7)}…(${apiKey.length} chars)`);

  const a = await probe(baseUrl, apiKey, "saaras:v3");
  console.log("\n[A] model=saaras:v3 (the production incident)");
  console.log(JSON.stringify(a, null, 1));

  const b = await probe(baseUrl, apiKey, "saaras:v3-realtime");
  console.log("\n[B] model=saaras:v3-realtime (the fix)");
  console.log(JSON.stringify(b, null, 1));

  const aFailed = a.events.some((e) => e.type === "error" && (e.is_fatal || e.fatal));
  const bClean = b.opened && !b.events.some((e) => e.type === "error");
  console.log(`\nVERDICT: reproduce-bug=${aFailed ? "YES (expected)" : "NO (unexpected)"}  fix-verified=${bClean ? "YES ✅" : "NO ❌"}`);
  process.exit(bClean ? 0 : 1);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
