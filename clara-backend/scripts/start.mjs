/**
 * scripts/start.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom server entry point.
 *
 * Strategy: monkey-patch Node's http.createServer BEFORE loading the Next.js
 * standalone server.js.  When server.js calls http.createServer, we intercept
 * the resulting HTTP server object and attach a WebSocketServer to it for the
 * /api/embed/voice path.  All other traffic (HTTP requests) continues through
 * Next.js untouched.
 *
 * This requires zero changes to the Next.js build and works with the existing
 * Docker / standalone output without a separate port or service.
 */

import http          from "node:http";
import { WebSocketServer } from "ws";
import { handleVoiceConnection } from "./voice-relay.mjs";

// ── Intercept http.createServer ───────────────────────────────────────────────

const _origCreateServer = http.createServer.bind(http);

http.createServer = (...args) => {
  const server = _origCreateServer(...args);

  const wss = new WebSocketServer({ noServer: true });

  // Route WebSocket upgrades
  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/api/embed/voice") {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        // Reject unknown upgrade paths cleanly
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", handleVoiceConnection);

  return server;
};

// ── Load Next.js standalone (will use our patched http.createServer) ─────────

// At runtime inside Docker the layout is:
//   /app/clara-backend/server.js          ← Next.js standalone entry
//   /app/clara-backend/scripts/start.mjs  ← this file
// So server.js is one directory up from this script.
import { dirname, resolve } from "node:path";
import { fileURLToPath }    from "node:url";

const __dir    = dirname(fileURLToPath(import.meta.url));
const serverJs = resolve(__dir, "..", "server.js");
await import(serverJs);
