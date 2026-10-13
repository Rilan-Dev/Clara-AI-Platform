/**
 * sarvam-realtime-loop-probe.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnose the production "connecting loop" on clara.ai.amazetechclans.com.
 *
 * 1. Mint a fresh Sarvam realtime session (same REST call the browser makes).
 * 2. Connect to /api/voice/sarvam/realtime        (STT relay)  — log EVERY
 *    frame + close code + timing for up to 25 s.
 * 3. Connect to /api/voice/sarvam/tts-realtime    (TTS relay)  — push the
 *    greeting text + flush like the browser does, log every frame.
 * 4. Re-connect the STT relay a second time to observe whether the reported
 *    loop reproduces from a clean Node client (rules out browser-side code).
 *
 * Output: a structured timeline so we can see whether:
 *   - status "connected" ever arrives (upstream Saaras socket opened)
 *   - an error frame arrives (realtime-init 4xx/5xx path)
 *   - the socket just closes silently (and with which close code)
 *   - the relay hangs forever after "connecting" (no timeout paths)
 */

const ORIGIN = "https://clara.ai.amazetechclans.com";
const BEARER = "08c9c99a5dc6715cf83970b3a2addf07ef5ef5c73fbc85f3ed9dce5a487b30f4";
const KB_ID = "ab69cf61-970b-4844-8986-8f772daabae7";

import WebSocket from "ws";

const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(3)}s`;

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

async function mintSession() {
  const res = await fetch(`${ORIGIN}/api/voice/sarvam/session`, {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      authorization: `Bearer ${BEARER}`,
      cookie: `clara_platform_token=${BEARER}`,
      origin: ORIGIN,
      referer: `${ORIGIN}/preview/agents/a7107bde-ff33-4952-9ebf-ad0d1dac3861?embedded=1`,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ kbId: KB_ID, ragMode: "hybrid", language: "en", scope: "draft" }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`session mint failed: HTTP ${res.status} ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

/** Probe one WS endpoint; resolves with a summary object. */
function probeSocket(name, url, { durationMs = 25_000, onOpen } = {}) {
  return new Promise((resolve) => {
    const opened = Date.now();
    const frames = [];
    let closed = false;
    const ws = new WebSocket(url, {
      headers: {
        origin: ORIGIN,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      },
      handshakeTimeout: 10_000,
    });

    const finish = (summary) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch {}
      resolve(summary);
    };

    const timer = setTimeout(() => {
      finish({ name, outcome: "timeout-still-open", lifetimeMs: Date.now() - opened, frames });
    }, durationMs);

    ws.on("open", () => {
      log(`${name}: OPEN`);
      if (onOpen) { try { onOpen(ws); } catch {} }
    });

    ws.on("message", (data, isBinary) => {
      const text = isBinary ? `<binary ${data.length} bytes>` : data.toString();
      frames.push({ at: Date.now() - opened, text: text.slice(0, 300) });
      log(`${name} ← ${text.slice(0, 300)}`);
    });

    ws.on("close", (code, reason) => {
      log(`${name}: CLOSED code=${code} reason=${reason?.toString?.() ?? ""}`);
      finish({ name, outcome: `closed-${code}`, reason: reason?.toString?.() ?? "", lifetimeMs: Date.now() - opened, frames });
    });

    ws.on("error", (err) => {
      log(`${name}: ERROR ${err.message}`);
    });
  });
}

// ── Run ──────────────────────────────────────────────────────────────────────
// 0. Current provider resolution (the user's capture said sarvam).
try {
  const prov = await fetch(`${ORIGIN}/api/voice/provider`, {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      authorization: `Bearer ${BEARER}`,
      cookie: `clara_platform_token=${BEARER}`,
      origin: ORIGIN,
    },
    body: JSON.stringify({ kbId: KB_ID, scope: "draft" }),
  });
  const provPayload = await prov.json().catch(() => ({}));
  log("provider now:", JSON.stringify(provPayload));
} catch (e) {
  log("provider lookup failed:", e.message);
}

// 1. Try minting a fresh session (may 409 — provider flipped).
let session = null;
let token = null;
try {
  session = await mintSession();
  token = session.stt?.realtime?.token;
  log("session minted:", JSON.stringify({
    mode: session.mode,
    sttModel: session.stt?.model,
    realtimeModel: session.stt?.realtime?.model,
    ttsModel: session.tts?.model,
    languages: session.languages,
  }));
} catch (e) {
  log("session mint FAILED:", e.message);
}

// 1b. Fall back to the user's original (still-unexpired) realtime token.
const USER_TOKEN = "v1.1791888191977.ab69cf61-970b-4844-8986-8f772daabae7.7edaf8bd-9acd-44ac-83e5-62dd4cd8043e.3a75ab392b3d694af835af3ac525ee1fb4447872dc83b51cb0cbe6e8b14dfd9a";
if (!token) {
  token = USER_TOKEN;
  log("using the user's original realtime token from the bug report");
}

// 2. Decode the token's expiry to confirm it is still valid.
{
  const parts = token.split(".");
  if (parts.length === 5) {
    const expMs = Number(parts[1]);
    log(`token expires at ${new Date(expMs).toISOString()} — ${expMs > Date.now() ? "STILL VALID" : "EXPIRED"}`);
  }
}

// Probe 1: STT relay — just listen (as the browser does before speaking).
const stt1 = await probeSocket("STT#1", `${ORIGIN.replace("https", "wss")}/api/voice/sarvam/realtime?token=${token}`, { durationMs: 20_000 });
console.log("\n=== STT#1 SUMMARY ===");
console.log(JSON.stringify({ outcome: stt1.outcome, lifetimeMs: stt1.lifetimeMs, frames: stt1.frames.map(f => f.text) }, null, 2));

// Probe 2: TTS relay — open, then push greeting text + flush (browser behavior).
const tts1 = await probeSocket("TTS#1", `${ORIGIN.replace("https", "wss")}/api/voice/sarvam/tts-realtime?token=${token}`, {
  durationMs: 20_000,
  onOpen: (ws) => {
    ws.send(JSON.stringify({ type: "generation_start", generationId: "probe_gen_1" }));
    ws.send(JSON.stringify({ type: "text", generationId: "probe_gen_1", text: "Hello! How can I help you today?" }));
    ws.send(JSON.stringify({ type: "flush", generationId: "probe_gen_1" }));
    log("TTS#1 → generation_start + text + flush (greeting, as the browser sends)");
  },
});
console.log("\n=== TTS#1 SUMMARY ===");
const ttsKinds = {};
for (const f of tts1.frames) {
  let kind = "binary";
  try { kind = JSON.parse(f.text).type ?? "?"; } catch {}
  ttsKinds[kind] = (ttsKinds[kind] ?? 0) + 1;
}
console.log(JSON.stringify({ outcome: tts1.outcome, lifetimeMs: tts1.lifetimeMs, frameCounts: ttsKinds }, null, 2));

// Probe 3: STT relay again — does the loop reproduce from a clean client?
const stt2 = await probeSocket("STT#2", `${ORIGIN.replace("https", "wss")}/api/voice/sarvam/realtime?token=${token}`, { durationMs: 15_000 });
console.log("\n=== STT#2 SUMMARY ===");
console.log(JSON.stringify({ outcome: stt2.outcome, lifetimeMs: stt2.lifetimeMs, frames: stt2.frames.map(f => f.text) }, null, 2));

console.log("\n=== DONE ===");
process.exit(0);
