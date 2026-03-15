/**
 * scripts/start.mjs
 * Custom server entry point — monkey-patches http.createServer to attach
 * WebSocket servers for voice relay and phone call streams before Next.js starts.
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { handleVoiceConnection } from "./voice-relay.mjs";
import { handleTwilioStream, handleVonageStream } from "./phone-stream.mjs";

const _orig = http.createServer.bind(http);

http.createServer = (...args) => {
  const server    = _orig(...args);
  const wss       = new WebSocketServer({ noServer: true });
  const wssTwilio = new WebSocketServer({ noServer: true });
  const wssVonage = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    try {
      const { pathname } = new URL(req.url, "http://x");
      if (pathname === "/api/embed/voice") {
        wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
      } else if (pathname === "/api/phone/twilio/stream") {
        wssTwilio.handleUpgrade(req, socket, head, ws => wssTwilio.emit("connection", ws, req));
      } else if (pathname === "/api/phone/vonage/stream") {
        wssVonage.handleUpgrade(req, socket, head, ws => wssVonage.emit("connection", ws, req));
      } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
      }
    } catch { socket.destroy(); }
  });

  server.once("listening", () => {
    const addr = server.address();
    const port = typeof addr === "object" ? addr?.port : addr;
    console.log("[clara-relay] Listening on port " + port);
    console.log("[clara-relay]    /api/embed/voice         — voice relay");
    console.log("[clara-relay]    /api/phone/twilio/stream — Twilio phone");
    console.log("[clara-relay]    /api/phone/vonage/stream — Vonage phone");
  });

  wss.on("connection", (ws, req) => handleVoiceConnection(ws, req));

  wssTwilio.on("connection", (ws, req) => {
    console.log("[phone/twilio] stream connected");
    Promise.resolve(handleTwilioStream(ws, req)).catch(err => {
      console.error("[phone/twilio] fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  wssVonage.on("connection", (ws, req) => {
    console.log("[phone/vonage] stream connected");
    Promise.resolve(handleVonageStream(ws, req)).catch(err => {
      console.error("[phone/vonage] fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  return server;
};

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dir    = dirname(fileURLToPath(import.meta.url));
const serverJs = resolve(__dir, "..", "server.js");
await import(serverJs);
