#!/usr/bin/env node
/**
 * scripts/elevenlabs-realtime-routing-probe.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnoses the ElevenLabs realtime "sessions not starting" failure on a
 * standalone (docker/start.mjs) Clara deployment.
 *
 * Evidence (2026-10-13): /api/voice/elevenlabs/session mints a clara-stream
 * descriptor pointing the browser at
 *   wss://<host>/api/voice-realtime?channel=elevenlabs-stt&token=…
 * but scripts/start.mjs's upgrade routing table only knows the LEGACY relay
 * paths (/api/voice/elevenlabs/realtime, …). Every upgrade to
 * /api/voice-realtime falls into the else branch → "HTTP/1.1 404" +
 * socket.destroy() → the browser WebSocket never opens → the client can
 * never start a realtime session.
 *
 * This probe sends raw HTTP Upgrade requests (no dependencies) and reports,
 * per path:
 *   • the exact response status line (404 = routing gap, 101 = upgrade OK),
 *   • first WS frame received (for token-rejection paths),
 *   • close code when the socket dies post-upgrade (1006 = external kill,
 *     1008 = our relay rejecting an invalid token — expected for the
 *     legacy path when routing works).
 *
 * Usage: node scripts/elevenlabs-realtime-routing-probe.mjs [host]
 * Default host: clara.ai.amazetechclans.com
 */

import https from "node:https";
import http from "node:http";
import { randomBytes } from "node:crypto";

const HOST = process.argv[2] ?? "clara.ai.amazetechclans.com";
const TIMEOUT_MS = 8_000;

const PROBES = [
  // What the clara-stream session descriptor actually points the browser at:
  { label: "clara-stream STT  (/api/voice-realtime?channel=elevenlabs-stt)", path: "/api/voice-realtime?channel=elevenlabs-stt&token=v1.probe.invalid.token" },
  { label: "clara-stream TTS  (/api/voice-realtime?channel=elevenlabs-tts)", path: "/api/voice-realtime?channel=elevenlabs-tts&token=v1.probe.invalid.token" },
  // The LEGACY relay path — start.mjs routes this, so an invalid token must
  // be rejected by the relay itself (101 → close 1008 + error frame):
  { label: "legacy relay STT  (/api/voice/elevenlabs/realtime)", path: "/api/voice/elevenlabs/realtime?token=v1.probe.invalid.token" },
  // Task-8 regression check — Sarvam paths have route.ts files that make
  // Next's router-server upgrade handler socket.end() the tunnel:
  { label: "sarvam realtime   (/api/voice/sarvam/realtime)", path: "/api/voice/sarvam/realtime?token=v1.probe.invalid.token" },
];

function probe({ label, path }) {
  return new Promise((resolve) => {
    const lib = HOST.startsWith("localhost") || HOST.startsWith("127.") ? http : https;
    const req = lib.request({
      host: HOST,
      path,
      headers: {
        "Connection": "Upgrade",
        "Upgrade": "websocket",
        "Sec-WebSocket-Version": "13",
        // 16 random bytes → 24-char base64 (RFC 6455 requires this exact length)
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        "Origin": `https://${HOST}`,
        "User-Agent": "clara-realtime-routing-probe/1.0",
      },
      timeout: TIMEOUT_MS,
    });

    const finish = (result) => { try { req.destroy(); } catch {} resolve({ label, ...result }); };

    req.on("response", (res) => {
      // Non-101 response: the upgrade was refused before WS ever started.
      let body = "";
      res.on("data", (c) => { body += c; if (body.length > 200) finish({ verdict: `HTTP ${res.statusCode}`, detail: body.slice(0, 200) }); });
      res.on("end", () => finish({ verdict: `HTTP ${res.statusCode}`, detail: body.slice(0, 200) }));
    });

    req.on("upgrade", (res, socket) => {
      // Handshake accepted — now watch what the server does with the socket.
      let firstFrame = null;
      const frames = [];
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        frames.push(chunk);
        if (!firstFrame) firstFrame = chunk.slice(0, 160);
        // Give the server a moment to send its reject/close, then judge.
        if (frames.length >= 3) finish({ verdict: "101 UPGRADED", detail: firstFrame });
      });
      socket.on("close", () => finish({ verdict: "101 UPGRADED then closed", detail: firstFrame ?? "(no frames)" }));
      socket.on("error", (err) => finish({ verdict: "101 UPGRADED then error", detail: String(err) }));
      setTimeout(() => finish({ verdict: "101 UPGRADED (kept open)", detail: firstFrame ?? "(no frames)" }), 4_000);
    });

    req.on("timeout", () => finish({ verdict: "TIMEOUT", detail: "no response" }));
    req.on("error", (err) => finish({ verdict: "ERROR", detail: String(err) }));
    req.end();
  });
}

console.log(`# Clara realtime routing probe → ${HOST}`);
console.log(`# ${new Date().toISOString()}\n`);
for (const p of PROBES) {
  const r = await probe(p);
  console.log(`• ${r.label}`);
  console.log(`    verdict: ${r.verdict}`);
  console.log(`    detail : ${String(r.detail).replace(/\s+/g, " ").slice(0, 180)}`);
  console.log();
}
