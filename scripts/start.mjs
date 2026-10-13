/**
 * scripts/start.mjs
 * Custom server entry point — monkey-patches http.createServer to attach
 * WebSocket servers for voice relay and phone call streams before Next.js starts.
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { handleVoiceConnection } from "./voice-relay.mjs";
import { handleTwilioStream, handleVonageStream } from "./phone-stream.mjs";
import { handleSarvamRealtimeConnection } from "./sarvam-relay.mjs";
import { handleSarvamTtsRealtimeConnection } from "./sarvam-tts-relay.mjs";
import {
  handleElevenLabsRealtimeStt,
  handleElevenLabsRealtimeTts,
} from "./elevenlabs-relay.mjs";
import { handleGeminiRealtimeConnection } from "./gemini-relay.mjs";
import { attachElevenLabsSpeechEngine } from "./elevenlabs-speech-engine.mjs";
import { resolveRealtimeChannel } from "./realtime-channels.mjs";

const _orig = http.createServer.bind(http);

http.createServer = (...args) => {
  const server    = _orig(...args);
  const wss       = new WebSocketServer({ noServer: true });
  const wssTwilio = new WebSocketServer({ noServer: true });
  const wssVonage = new WebSocketServer({ noServer: true });
  const wssSarvam = new WebSocketServer({ noServer: true });
  const wssSarvamTts = new WebSocketServer({ noServer: true });
  const wssElevenLabsStt = new WebSocketServer({ noServer: true });
  const wssElevenLabsTts = new WebSocketServer({ noServer: true });
  const wssGemini = new WebSocketServer({ noServer: true });

  // Channel front door (mirrors api/voice-realtime.mjs — ONE table, see
  // scripts/realtime-channels.mjs). The ElevenLabs clara-stream session
  // descriptor points browsers at /api/voice-realtime?channel=… on every
  // deployment, so the standalone relay must route those upgrades too.
  const channelWss = {
    embed: wss,
    twilio: wssTwilio,
    vonage: wssVonage,
    sarvam: wssSarvam,
    "sarvam-tts": wssSarvamTts,
    "elevenlabs-stt": wssElevenLabsStt,
    "elevenlabs-tts": wssElevenLabsTts,
    gemini: wssGemini,
  };

  const claraUpgradeListener = (req, socket, head) => {
    try {
      const url = new URL(req.url, "http://x");
      const target = resolveRealtimeChannel(url.pathname, url.searchParams);

      // The Speech Engine registers its own authenticated upgrade listener
      // and must see these upgrades untouched so the SDK can accept them.
      if (
        target.kind === "speech-engine"
        || url.pathname === "/api/voice/elevenlabs/speech-engine"
      ) {
        return;
      }

      // Channel front door: /api/voice-realtime?channel=… and
      // /api/voice-realtime/<channel>.
      if (target.kind === "unknown") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }
      if (target.kind === "channel") {
        const wssTarget = channelWss[target.channel];
        if (wssTarget) {
          wssTarget.handleUpgrade(req, socket, head, ws => wssTarget.emit("connection", ws, req));
        } else {
          // Defensive: channel table out of sync with REALTIME_CHANNELS.
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
        }
        return;
      }

      // Legacy per-purpose relay paths.
      const { pathname } = url;
      if (pathname === "/api/embed/voice") {
        wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
      } else if (pathname === "/api/phone/twilio/stream") {
        wssTwilio.handleUpgrade(req, socket, head, ws => wssTwilio.emit("connection", ws, req));
      } else if (pathname === "/api/phone/vonage/stream") {
        wssVonage.handleUpgrade(req, socket, head, ws => wssVonage.emit("connection", ws, req));
      } else if (pathname === "/api/voice/sarvam/realtime") {
        wssSarvam.handleUpgrade(req, socket, head, ws => wssSarvam.emit("connection", ws, req));
      } else if (pathname === "/api/voice/sarvam/tts-realtime") {
        wssSarvamTts.handleUpgrade(req, socket, head, ws => wssSarvamTts.emit("connection", ws, req));
      } else if (pathname === "/api/voice/elevenlabs/realtime") {
        wssElevenLabsStt.handleUpgrade(req, socket, head, ws => wssElevenLabsStt.emit("connection", ws, req));
      } else if (pathname === "/api/voice/elevenlabs/tts-realtime") {
        wssElevenLabsTts.handleUpgrade(req, socket, head, ws => wssElevenLabsTts.emit("connection", ws, req));
      } else if (pathname === "/api/voice/gemini/realtime") {
        wssGemini.handleUpgrade(req, socket, head, ws => wssGemini.emit("connection", ws, req));
      } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
      }
    } catch { socket.destroy(); }
  };

  // In a production standalone build Next's upgrade listener has no job we
  // need (HMR is dev-only; assetPrefix proxying is unused), and it is actively
  // HARMFUL on relay paths that also ship a route.ts (e.g. the Vercel
  // experimental_upgradeWebSocket routes at /api/voice/sarvam/realtime): the
  // router-server upgrade handler matches them as appFiles and socket.end()s
  // the tunnel right after our 101 — no close frame, browser sees 1006 and
  // reconnects forever. So the relay claims the 'upgrade' event exclusively:
  // any foreign 'upgrade' listener registration is refused.
  //
  // The ONE legitimate foreign registrant is the ElevenLabs Speech Engine
  // SDK (attachElevenLabsSpeechEngine below); attachSpeechEngine() opens a
  // guarded registration window for it.
  let speechEngineRegistrationWindow = false;
  const guardUpgradeRegistration = (register) => (event, listener, ...rest) => {
    if (
      event === "upgrade"
      && listener !== claraUpgradeListener
      && !speechEngineRegistrationWindow
    ) {
      console.warn(
        "[clara-relay] refused foreign 'upgrade' listener " +
        "(relay owns WS routing; Next would socket.end() relay tunnels)",
      );
      return server; // swallow — the registrant never knows
    }
    return register(event, listener, ...rest);
  };
  server.on          = guardUpgradeRegistration(server.on.bind(server));
  server.addListener = guardUpgradeRegistration(server.addListener.bind(server));
  server.once       = guardUpgradeRegistration(server.once.bind(server));

  server.on("upgrade", claraUpgradeListener);

  let speechEngineAttached = false;

  const attachSpeechEngine = async () => {
    if (speechEngineAttached) return speechEngineAttached;
    // The ElevenLabs Speech Engine SDK registers its own authenticated
    // 'upgrade' listener on this server — open the guarded registration
    // window for the duration of the attach (plus a short grace tick for
    // any synchronous follow-up registrations inside the SDK).
    speechEngineRegistrationWindow = true;
    try {
      const attachment = await attachElevenLabsSpeechEngine(server);
      speechEngineAttached = Boolean(attachment);
    } catch (error) {
      console.error("[elevenlabs-speech-engine] failed to attach:", error?.message ?? error);
    } finally {
      setTimeout(() => { speechEngineRegistrationWindow = false; }, 1_000);
    }
    return speechEngineAttached;
  };
  // Saving the Speech Engine settings in Settings → Environment calls this
  // (same process) so the engine starts without a container restart.
  globalThis.__claraAttachSpeechEngine = attachSpeechEngine;

  server.once("listening", () => {
    const addr = server.address();
    const port = typeof addr === "object" ? addr?.port : addr;
    console.log("[clara-relay] Listening on port " + port);
    console.log("[clara-relay]    /api/voice-realtime?channel=… — unified realtime channel front door");
    console.log("[clara-relay]    /api/embed/voice         — voice relay");
    console.log("[clara-relay]    /api/phone/twilio/stream — Twilio phone");
    console.log("[clara-relay]    /api/phone/vonage/stream — Vonage phone");
    console.log("[clara-relay]    /api/voice/sarvam/realtime — Saaras realtime STT relay");
    console.log("[clara-relay]    /api/voice/elevenlabs/realtime — Scribe realtime STT relay");
    console.log("[clara-relay]    /api/voice/elevenlabs/tts-realtime — ElevenLabs streaming TTS relay");
    console.log("[clara-relay]    /api/voice/elevenlabs/speech-engine — ElevenLabs Speech Engine upstream WSS");
    console.log("[clara-relay]    /api/voice/gemini/realtime — Gemini Live passthrough relay");

    // Platform Settings are persisted in Postgres and mirrored into
    // process.env by /api/internal/init. Attach Speech Engine only after the
    // HTTP server is listening so the init route can run first when the
    // runtime credentials are DB-managed.
    void (async () => {
      if (!process.env.ELEVENLABS_SPEECH_ENGINE_ID || !process.env.ELEVENLABS_API_KEY) {
        const secret = process.env.LOCAL_INIT_SECRET;
        if (secret) {
          try {
            const response = await fetch(
              `http://127.0.0.1:${port ?? 3000}/api/internal/init`,
              {
                method: "POST",
                headers: { "x-clara-init-secret": secret },
              },
            );
            if (!response.ok) {
              console.warn("[startup] internal init returned", response.status);
            }
          } catch (error) {
            console.warn("[startup] internal init failed:", error?.message ?? error);
          }
        }
      }
      await attachSpeechEngine();
    })();
  });

  wss.on("connection", (ws, req) => handleVoiceConnection(ws, req));

  wssSarvamTts.on("connection", (ws, req) => {
    Promise.resolve(handleSarvamTtsRealtimeConnection(ws, req)).catch(err => {
      console.error("[sarvam-tts-relay] fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  wssSarvam.on("connection", (ws, req) => {
    Promise.resolve(handleSarvamRealtimeConnection(ws, req)).catch(err => {
      console.error("[sarvam-relay] fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  wssElevenLabsStt.on("connection", (ws, req) => {
    Promise.resolve(handleElevenLabsRealtimeStt(ws, req)).catch(err => {
      console.error("[elevenlabs-relay] stt fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  wssElevenLabsTts.on("connection", (ws, req) => {
    Promise.resolve(handleElevenLabsRealtimeTts(ws, req)).catch(err => {
      console.error("[elevenlabs-relay] tts fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

  wssGemini.on("connection", (ws, req) => {
    Promise.resolve(handleGeminiRealtimeConnection(ws, req)).catch(err => {
      console.error("[gemini-relay] fatal:", err && err.message);
      try { ws.close(1011); } catch (_) {}
    });
  });

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
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dir    = dirname(fileURLToPath(import.meta.url));
const serverCandidates = [
  resolve(__dir, "..", "server.js"),
  resolve(__dir, "..", ".next", "standalone", "server.js"),
];
const serverJs = serverCandidates.find((candidate) => existsSync(candidate));
if (!serverJs) {
  throw new Error("Could not locate standalone Next server.js for relay startup");
}

// Standalone output doesn't include .next/static or public/ (the Dockerfile
// COPYs them separately). When running `npm start` straight from a repo
// checkout, sync them in so CSS/JS chunks and public assets resolve —
// without this the app boots but every page renders unstyled (404 on
// /_next/static/css/*). Mirrors the Dockerfile steps:
//   COPY .next/static    ./.next/static
//   COPY public          ./public
const standaloneDir = dirname(serverJs);
const assetSyncs = [
  [resolve(__dir, "..", ".next", "static"), resolve(standaloneDir, ".next", "static")],
  [resolve(__dir, "..", "public"), resolve(standaloneDir, "public")],
];
for (const [src, dst] of assetSyncs) {
  // Sync whenever the SOURCE is present — do not skip when dst already
  // exists, except when Docker has already placed the asset at the exact same path. `next build` (output: standalone) creates a PARTIAL public/ dir
  // (only the assets referenced by the build manifest); the old
  // !existsSync(dst) guard then skipped the sync entirely, so
  // /worklets/audio-recorder-worklet.js 404'd on every `npm start`
  // deployment and the Sarvam/Gemini capture path silently fell back to the
  // deprecated ScriptProcessorNode. cpSync is an additive recursive copy:
  // it overwrites same-name files and never deletes extras, so re-syncing
  // an already-complete dst is a no-op.
  if (resolve(src) === resolve(dst)) {
    console.log("[clara-relay] asset sync skipped (source and destination are identical):", src);
    continue;
  }
  if (existsSync(src)) {
    try {
      cpSync(src, dst, { recursive: true });
      console.log("[clara-relay] synced", src, "→", dst);
    } catch (err) {
      console.warn("[clara-relay] could not sync", src, ":", err && err.message);
    }
  }
}

await import(pathToFileURL(serverJs).href);

