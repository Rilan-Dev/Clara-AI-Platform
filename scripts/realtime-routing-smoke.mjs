#!/usr/bin/env node
/**
 * scripts/realtime-routing-smoke.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Functional smoke test for the /api/voice-realtime channel routing fix.
 *
 * Boots a minimal standalone server that mirrors the PATCHED scripts/start.mjs
 * upgrade listener (it imports the REAL scripts/realtime-channels.mjs resolver
 * and the REAL scripts/elevenlabs-relay.mjs handler) and drives it with raw
 * HTTP upgrade requests:
 *
 *   1. /api/voice-realtime?channel=elevenlabs-stt → 101 + relay token-gate
 *      error frame ("Invalid or expired realtime session token") — the exact
 *      frame production serves on the legacy path, proving the whole chain
 *      (routing → wss → handler → verifyToken) now works for the channel
 *      front door.
 *   2. /api/voice-realtime?channel=elevenlabs-tts → 101.
 *   3. /api/voice-realtime?channel=<invalid> → 404 (unchanged).
 *   4. Legacy paths (/api/voice/elevenlabs/realtime, /api/embed/voice) → 101
 *      (regression guard).
 *   5. /api/voice-realtime/speech-engine → left untouched by the relay.
 *   6. Foreign 'upgrade' listener registration (simulating Next's
 *      router-server) is refused by the guard.
 *
 * Run: node scripts/realtime-routing-smoke.mjs
 */

import http from "node:http";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import {
  REALTIME_CHANNELS,
  resolveRealtimeChannel,
} from "./realtime-channels.mjs";
import { handleElevenLabsRealtimeStt, handleElevenLabsRealtimeTts } from "./elevenlabs-relay.mjs";

// The relay's verifyToken → hmacHex reads AUTH_SECRET at call time; give the
// smoke run a fixed value so the token-gate frames are actually emitted
// (production provides the real secret via environment).
process.env.AUTH_SECRET ??= "realtime-routing-smoke-secret";

const PORT = 3117;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });

// Mirror of the patched start.mjs wiring (same structure, real resolver).
const wssElevenLabsStt = new WebSocketServer({ noServer: true });
const wssElevenLabsTts = new WebSocketServer({ noServer: true });
const wssEmbed = new WebSocketServer({ noServer: true });
const channelWss = { "elevenlabs-stt": wssElevenLabsStt, "elevenlabs-tts": wssElevenLabsTts, embed: wssEmbed };

const claraUpgradeListener = (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://x");
    const target = resolveRealtimeChannel(url.pathname, url.searchParams);
    if (target.kind === "speech-engine" || url.pathname === "/api/voice/elevenlabs/speech-engine") return;
    if (target.kind === "unknown") { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return; }
    if (target.kind === "channel") {
      const wssTarget = channelWss[target.channel];
      if (wssTarget) { wssTarget.handleUpgrade(req, socket, head, ws => wssTarget.emit("connection", ws, req)); return; }
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return;
    }
    const { pathname } = url;
    if (pathname === "/api/embed/voice") {
      wssEmbed.handleUpgrade(req, socket, head, ws => wssEmbed.emit("connection", ws, req));
    } else if (pathname === "/api/voice/elevenlabs/realtime") {
      wssElevenLabsStt.handleUpgrade(req, socket, head, ws => wssElevenLabsStt.emit("connection", ws, req));
    } else { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); }
  } catch { socket.destroy(); }
};

// The exclusive-claim guard, verbatim from the patched start.mjs.
let speechEngineRegistrationWindow = false;
const guardUpgradeRegistration = (register) => (event, listener, ...rest) => {
  if (event === "upgrade" && listener !== claraUpgradeListener && !speechEngineRegistrationWindow) {
    return server; // refused
  }
  return register(event, listener, ...rest);
};
server.on = guardUpgradeRegistration(server.on.bind(server));
server.addListener = guardUpgradeRegistration(server.addListener.bind(server));
server.once = guardUpgradeRegistration(server.once.bind(server));
server.on("upgrade", claraUpgradeListener);

// The real ElevenLabs relay handlers: invalid tokens must produce the exact
// production error frame after a successful 101 handshake.
wssElevenLabsStt.on("connection", (ws, req) => {
  Promise.resolve(handleElevenLabsRealtimeStt(ws, req)).catch((e) => {
    console.error("[smoke] stt handler rejected:", e?.stack ?? e);
    try { ws.close(1011); } catch {}
  });
});
wssElevenLabsTts.on("connection", (ws, req) => {
  Promise.resolve(handleElevenLabsRealtimeTts(ws, req)).catch(() => { try { ws.close(1011); } catch {} });
});
wssEmbed.on("connection", () => { /* embed relay not under test */ });

function probe(path, { expectFrame } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const req = http.request({
      host: "127.0.0.1", port: PORT, path,
      headers: {
        "Connection": "Upgrade", "Upgrade": "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
      },
    });
    const done = (verdict, detail = "") => {
      if (settled) return;
      settled = true;
      try { req.destroy(); } catch {}
      resolve({ verdict, detail });
    };
    req.on("response", (res) => done(`HTTP ${res.statusCode}`));
    req.on("upgrade", (_res, socket, head) => {
      // Locally the relay's first frame can ride in the `head` buffer that
      // arrives attached to the 101 handshake itself — seed the text with it.
      let text = head?.length ? head.toString("utf8") : "";
      if (expectFrame && text.includes(expectFrame)) { done("101", text); return; }
      socket.setEncoding("utf8");
      socket.on("data", (c) => {
        text += c;
        if (expectFrame && text.includes(expectFrame)) done("101", text);
      });
      setTimeout(() => done("101", text), 1500);
    });
    req.on("error", (e) => done("ERROR", String(e)));
    // Nobody answers (speech-engine is deliberately left untouched) — bail
    // out instead of hanging forever.
    setTimeout(() => done("NO-RESPONSE"), 2000);
    req.end();
  });
}

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// 1. THE FIX: the clara-stream STT channel the session descriptor emits.
{
  const r = await probe("/api/voice-realtime?channel=elevenlabs-stt&token=v1.smoke.invalid.token", {
    expectFrame: "Invalid or expired realtime session token",
  });
  check("channel STT  /api/voice-realtime?channel=elevenlabs-stt → 101 + relay token-gate frame",
    r.verdict === "101" && r.detail.includes("Invalid or expired realtime session token"),
    r.verdict);
}

// 2. The TTS channel.
{
  const r = await probe("/api/voice-realtime?channel=elevenlabs-tts&token=v1.smoke.invalid.token");
  check("channel TTS  /api/voice-realtime?channel=elevenlabs-tts → 101",
    r.verdict === "101", r.verdict);
}

// 3. Invalid channel still 404s.
{
  const r = await probe("/api/voice-realtime?channel=bogus");
  check("unknown channel → HTTP 404", r.verdict === "HTTP 404", r.verdict);
}

// 4. Legacy paths keep working.
{
  const r = await probe("/api/voice/elevenlabs/realtime?token=v1.smoke.invalid.token");
  check("legacy STT    /api/voice/elevenlabs/realtime → 101", r.verdict === "101", r.verdict);
}
{
  const r = await probe("/api/embed/voice");
  check("legacy embed  /api/embed/voice → 101", r.verdict === "101", r.verdict);
}

// 5. Speech-engine sub-path is left untouched (no relay response — the
//    SDK's own listener would own it in a real deployment).
{
  const r = await probe("/api/voice-realtime/speech-engine");
  check("speech-engine /api/voice-realtime/speech-engine → relay leaves untouched",
    r.verdict === "NO-RESPONSE",
    r.verdict);
}

// 6. The guard refuses a foreign upgrade listener (simulating Next's
// router-server registration after ours).
{
  const before = server.listenerCount("upgrade");
  const nextListener = () => {};
  server.on("upgrade", nextListener); // must be swallowed by the guard
  const after = server.listenerCount("upgrade");
  const refused = before === after;
  // cleanup: register through the window to prove the carve-out works
  speechEngineRegistrationWindow = true;
  server.on("upgrade", nextListener);
  const withWindow = server.listenerCount("upgrade");
  server.removeListener("upgrade", nextListener);
  speechEngineRegistrationWindow = false;
  check("guard refuses foreign 'upgrade' listeners (speech-engine window allows)",
    refused && withWindow === before + 1,
    `before=${before} afterRefused=${after} afterWindow=${withWindow}`);
}

server.close();

// ─── Resolver contract (mirrors realtime-channels.test.ts) ────────────────────
// The vitest suite runs in CI; these inline assertions verify the exact same
// contract locally without the vitest/vite peer toolchain.
{
  const params = (q) => new URLSearchParams(q);
  for (const channel of REALTIME_CHANNELS) {
    assert.deepEqual(
      resolveRealtimeChannel("/api/voice-realtime", params(`channel=${channel}`)),
      { kind: "channel", channel },
    );
    assert.deepEqual(
      resolveRealtimeChannel(`/api/voice-realtime/${channel}`, undefined),
      { kind: "channel", channel },
    );
  }
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime", params("channel=elevenlabs-stt")), { kind: "channel", channel: "elevenlabs-stt" });
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime", params("channel=elevenlabs-tts")), { kind: "channel", channel: "elevenlabs-tts" });
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime", params("")), { kind: "unknown" });
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime", null), { kind: "unknown" });
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime", params("channel=bogus")), { kind: "unknown" });
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime/speech-engine", undefined), { kind: "speech-engine" });
  assert.deepEqual(resolveRealtimeChannel("/api/voice-realtime/a/b", undefined), { kind: "unknown" });
  for (const p of ["/api/embed/voice", "/api/voice/elevenlabs/realtime", "/api/voice/elevenlabs/tts-realtime", "/api/voice/sarvam/realtime", "/api/voice/sarvam/tts-realtime", "/api/voice/gemini/realtime", "/api/voice/elevenlabs/speech-engine", "/api/chat", "/"]) {
    assert.deepEqual(resolveRealtimeChannel(p, undefined), { kind: "none" });
  }
  assert.deepEqual([...REALTIME_CHANNELS].sort(), [
    "elevenlabs-stt", "elevenlabs-tts", "embed", "gemini", "sarvam", "sarvam-tts", "twilio", "vonage",
  ]);
  check("resolver contract (query style, sub-path style, unknown, none, channel set)", true);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
