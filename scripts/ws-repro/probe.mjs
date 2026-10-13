/** Probe the local repro: does the relay socket survive Next's upgrade listener? */
import WebSocket from "ws";

const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(3)}s`;

const ws = new WebSocket("ws://127.0.0.1:3100/api/voice/sarvam/realtime?token=abc123", {
  headers: { origin: "http://127.0.0.1:3100" },
  handshakeTimeout: 5000,
});

ws.on("open", () => console.log(`[${ts()}] OPEN`));
ws.on("message", (d) => console.log(`[${ts()}] ← ${d}`));
ws.on("error", (e) => console.log(`[${ts()}] ERROR ${e.message}`));
ws.on("close", (code, reason) => {
  console.log(`[${ts()}] CLOSED code=${code} reason=${reason?.toString?.() ?? ""}`);
  process.exit(0);
});

setTimeout(() => {
  console.log(`[${ts()}] SURVIVED 10 seconds — socket still open`);
  process.exit(0);
}, 10_000);
