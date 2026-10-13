import http from "node:http";
import { WebSocketServer } from "ws";

import { handleVoiceConnection } from "../scripts/voice-relay.mjs";
import { handleTwilioStream, handleVonageStream } from "../scripts/phone-stream.mjs";
import { handleSarvamRealtimeConnection } from "../scripts/sarvam-relay.mjs";
import { handleSarvamTtsRealtimeConnection } from "../scripts/sarvam-tts-relay.mjs";
import {
  handleElevenLabsRealtimeStt,
  handleElevenLabsRealtimeTts,
} from "../scripts/elevenlabs-relay.mjs";
import { handleGeminiRealtimeConnection } from "../scripts/gemini-relay.mjs";
import { attachElevenLabsSpeechEngine } from "../scripts/elevenlabs-speech-engine.mjs";
import { resolveRealtimeChannel } from "../scripts/realtime-channels.mjs";

const server = http.createServer((_req, res) => {
  res.statusCode = 404;
  res.end("WebSocket endpoint");
});

const wss = new WebSocketServer({ noServer: true });

// ONE routing table with the standalone relay (scripts/start.mjs): both
// front doors resolve channels through scripts/realtime-channels.mjs so the
// Vercel function and the docker deployment can never drift apart again.
const CHANNEL_HANDLERS = new Map([
  ["embed", handleVoiceConnection],
  ["twilio", handleTwilioStream],
  ["vonage", handleVonageStream],
  ["sarvam", handleSarvamRealtimeConnection],
  ["sarvam-tts", handleSarvamTtsRealtimeConnection],
  ["elevenlabs-stt", handleElevenLabsRealtimeStt],
  ["elevenlabs-tts", handleElevenLabsRealtimeTts],
  ["gemini", handleGeminiRealtimeConnection],
]);

function handlerFor(pathname, searchParams) {
  // Vercel WebSocket Functions expose the exact function pathname
  // (/api/voice-realtime) with the channel as a query parameter; the legacy
  // rewrite style /api/voice-realtime/<channel> remains supported. The
  // resolver is shared with scripts/start.mjs (realtime-channels.mjs).
  const target = resolveRealtimeChannel(pathname, searchParams);
  return target.kind === "channel"
    ? CHANNEL_HANDLERS.get(target.channel) ?? null
    : null;
}

wss.on("connection", (ws, req) => {
  const parsed = new URL(req.url ?? "/", "http://vercel");
  const target = resolveRealtimeChannel(parsed.pathname, parsed.searchParams);
  const handler = target.kind === "channel"
    ? CHANNEL_HANDLERS.get(target.channel) ?? null
    : null;

  if (!handler) {
    ws.close(1008, "Unsupported realtime endpoint");
    return;
  }

  Promise.resolve(handler(ws, req)).catch((error) => {
    console.error("[vercel-realtime] handler failed:", error?.message ?? error);
    try { ws.close(1011, "Realtime handler failed"); } catch {}
  });
});

server.on("upgrade", (req, socket, head) => {
  try {
    const parsed = new URL(req.url ?? "/", "http://vercel");
    const pathname = parsed.pathname;

    // ElevenLabs Speech Engine attaches its own upgrade listener. It must see
    // this path before the generic dispatcher claims the socket.
    if (pathname === "/api/voice-realtime/speech-engine") return;

    if (!handlerFor(pathname, parsed.searchParams)) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } catch {
    socket.destroy();
  }
});

// The ElevenLabs Speech Engine SDK registers its authenticated upgrade listener
// against this same Vercel-managed Node server when configured. It is optional.
void attachElevenLabsSpeechEngine(server, "/api/voice-realtime/speech-engine").catch((error) => {
  console.warn("[vercel-realtime] Speech Engine attachment skipped:", error?.message ?? error);
});

export default server;
