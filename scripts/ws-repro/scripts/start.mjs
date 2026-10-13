/**
 * ws-repro start.mjs — EXACT structural copy of Clara's scripts/start.mjs
 * monkey-patch pattern, trimmed to the one path under test:
 *   /api/voice/sarvam/realtime
 *
 * The handler mimics sarvam-relay.mjs behavior UP TO the point where
 * production dies: verify token → send {"type":"status","value":"connecting"}
 * → hold the socket open (no upstream). If Next's own upgrade listener kills
 * the socket, we will observe: open → "connecting" → close 1006.
 */

import http from "node:http";
import { WebSocketServer } from "ws";

const _orig = http.createServer.bind(http);

http.createServer = (...args) => {
  const server = _orig(...args);
  const wssSarvam = new WebSocketServer({ noServer: true });

  const claraUpgradeListener = (req, socket, head) => {
    try {
      const { pathname } = new URL(req.url, "http://x");
      if (pathname === "/api/voice/sarvam/realtime") {
        wssSarvam.handleUpgrade(req, socket, head, (ws) => wssSarvam.emit("connection", ws, req));
      } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
      }
    } catch { socket.destroy(); }
  };

  // Same hardening as the real scripts/start.mjs: refuse foreign upgrade listeners.
  const rawOn          = server.on.bind(server);
  const rawAddListener = server.addListener.bind(server);
  const rawOnce        = server.once.bind(server);
  const guardUpgradeRegistration = (register) => (event, listener, ...rest) => {
    if (event === "upgrade" && listener !== claraUpgradeListener) {
      console.warn("[repro-relay] refused foreign 'upgrade' listener");
      return server;
    }
    return register(event, listener, ...rest);
  };
  server.on          = guardUpgradeRegistration(rawOn);
  server.addListener = guardUpgradeRegistration(rawAddListener);
  server.once        = guardUpgradeRegistration(rawOnce);

  rawOn("upgrade", claraUpgradeListener);

  server.once("listening", () => {
    console.log("[repro-relay] listening on", server.address()?.port ?? "?");
  });

  wssSarvam.on("connection", (ws, req) => {
    Promise.resolve(handleReproConnection(ws, req)).catch((err) => {
      console.error("[repro-relay] fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  return server;
};

/** Mimic sarvam-relay.mjs up to (not including) the upstream connect. */
async function handleReproConnection(browserWs, req) {
  const url = new URL(req.url, "http://x");
  const token = url.searchParams.get("token") ?? "";
  // Token check mimicked: accept anything non-empty (signature irrelevant here).
  if (!token) {
    browserWs.send(JSON.stringify({ type: "error", message: "Invalid token", fatal: true }));
    browserWs.close(1008, "Invalid token");
    return;
  }
  browserWs.send(JSON.stringify({ type: "status", value: "connecting" }));
  // HOLD the socket open — relay would proceed to realtime-init + upstream here.
  // If something external kills the socket, we will see the close event.
  browserWs.on("message", (data) => {
    console.log("[repro-relay] browser frame:", String(data).slice(0, 80));
  });
  browserWs.on("close", (code, reason) => {
    console.log(`[repro-relay] browser socket CLOSED code=${code} reason=${reason?.toString?.() ?? ""}`);
  });
}

import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const __dir = dirname(fileURLToPath(import.meta.url));
const serverJs = resolve(__dir, "ws-repro", "server.js");
if (!existsSync(serverJs)) throw new Error("standalone server.js missing — run `npm run build` first");
await import(pathToFileURL(serverJs).href);
