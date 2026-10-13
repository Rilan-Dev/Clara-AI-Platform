/**
 * sarvam-crash-discriminator.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Discriminate between the two possible causes of the 1006 kill:
 *   (A) the Node relay process crashes on each WS connection (Docker restarts
 *       it) → REST goes dark for the restart window at the SAME moment;
 *   (B) only the WS socket is killed (proxy / per-socket logic) → REST stays
 *       healthy throughout.
 *
 * Method: poll /api/health every 150 ms for the whole experiment while opening
 * the Sarvam realtime WS. Timestamps are correlated afterwards.
 */

const ORIGIN = "https://clara.ai.amazetechclans.com";
const BEARER = "08c9c99a5dc6715cf83970b3a2addf07ef5ef5c73fbc85f3ed9dce5a487b30f4";
const TOKEN = "v1.1791888191977.ab69cf61-970b-4844-8986-8f772daabae7.7edaf8bd-9acd-44ac-83e5-62dd4cd8043e.3a75ab392b3d694af835af3ac525ee1fb4447872dc83b51cb0cbe6e8b14dfd9a";

import WebSocket from "ws";

const t0 = Date.now();
const now = () => ((Date.now() - t0) / 1000).toFixed(2);
const restLog = [];
let polling = true;

// 1. High-frequency REST health poller.
(async () => {
  while (polling) {
    const started = Date.now();
    try {
      const res = await fetch(`${ORIGIN}/api/health`, {
        headers: { authorization: `Bearer ${BEARER}`, cookie: `clara_platform_token=${BEARER}` },
        signal: AbortSignal.timeout(4000),
      });
      restLog.push({ t: now(), ok: res.status === 200, ms: Date.now() - started, status: res.status });
    } catch (e) {
      restLog.push({ t: now(), ok: false, ms: Date.now() - started, err: e.name });
    }
    await new Promise((r) => setTimeout(r, 150));
  }
})();

await new Promise((r) => setTimeout(r, 1000)); // establish the poll baseline

// 2. Open the STT relay WS and watch it die.
const wsEvents = [];
await new Promise((resolve) => {
  const ws = new WebSocket(`${ORIGIN.replace("https", "wss")}/api/voice/sarvam/realtime?token=${TOKEN}`, {
    headers: { origin: ORIGIN },
    handshakeTimeout: 8000,
  });
  ws.on("open", () => wsEvents.push({ t: now(), ev: "open" }));
  ws.on("message", (d) => wsEvents.push({ t: now(), ev: "frame", data: d.toString().slice(0, 120) }));
  ws.on("close", (code) => { wsEvents.push({ t: now(), ev: "close", code }); setTimeout(resolve, 8000); });
  ws.on("error", (e) => wsEvents.push({ t: now(), ev: "error", msg: e.message }));
  setTimeout(() => { try { ws.terminate(); } catch {}; resolve(); }, 30000);
});

polling = false;
await new Promise((r) => setTimeout(r, 300));

console.log("=== WS EVENTS ===");
for (const e of wsEvents) console.log(JSON.stringify(e));

console.log("\n=== REST POLL (failures + slow polls only, plus context) ===");
const failures = restLog.filter((p) => !p.ok || p.ms > 900);
if (failures.length === 0) {
  console.log("NO REST failures — REST stayed healthy the entire time.");
} else {
  for (const f of failures) console.log(JSON.stringify(f));
}
const okCount = restLog.filter((p) => p.ok).length;
console.log(`\nREST polls: ${okCount}/${restLog.length} OK; median latency ${[...restLog].sort((a, b) => a.ms - b.ms)[Math.floor(restLog.length / 2)]?.ms}ms`);

// 3. Proxy identity.
try {
  const head = await fetch(`${ORIGIN}/api/health`, { method: "HEAD", headers: { authorization: `Bearer ${BEARER}` } });
  const interesting = {};
  for (const h of ["server", "via", "x-powered-by", "cf-ray", "x-served-by", "connection", "upgrade"]) {
    const v = head.headers.get(h);
    if (v) interesting[h] = v;
  }
  console.log("\n=== PROXY HEADERS ===", JSON.stringify(interesting));
} catch (e) {
  console.log("header probe failed:", e.message);
}

process.exit(0);
