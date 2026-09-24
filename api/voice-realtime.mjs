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

const server = http.createServer((_req, res) => {
  res.statusCode = 404;
  res.end("WebSocket endpoint");
});

const wss = new WebSocketServer({ noServer: true });

function handlerFor(pathname, searchParams) {
  // Vercel WebSocket Functions expose the exact function pathname
  // (/api/voice-realtime). The legacy rewrite targets below remain supported
  // for long-running Node deployments, while Vercel uses a channel query.
  if (pathname === "/api/voice-realtime") {
    switch (searchParams?.get("channel")) {
      case "embed":
        return handleVoiceConnection;
      case "twilio":
        return handleTwilioStream;
      case "vonage":
        return handleVonageStream;
      case "sarvam":
        return handleSarvamRealtimeConnection;
      case "sarvam-tts":
        return handleSarvamTtsRealtimeConnection;
      case "elevenlabs-stt":
        return handleElevenLabsRealtimeStt;
      case "elevenlabs-tts":
        return handleElevenLabsRealtimeTts;
      case "gemini":
        return handleGeminiRealtimeConnection;
      default:
        return null;
    }
  }
  switch (pathname) {
    case "/api/voice-realtime/embed":
      return handleVoiceConnection;
    case "/api/voice-realtime/twilio":
      return handleTwilioStream;
    case "/api/voice-realtime/vonage":
      return handleVonageStream;
    case "/api/voice-realtime/sarvam":
      return handleSarvamRealtimeConnection;
    case "/api/voice-realtime/sarvam-tts":
      return handleSarvamTtsRealtimeConnection;
    case "/api/voice-realtime/elevenlabs-stt":
      return handleElevenLabsRealtimeStt;
    case "/api/voice-realtime/elevenlabs-tts":
      return handleElevenLabsRealtimeTts;
    case "/api/voice-realtime/gemini":
      return handleGeminiRealtimeConnection;
    default:
      return null;
  }
}

wss.on("connection", (ws, req) => {
  const parsed = new URL(req.url ?? "/", "http://vercel");
  const handler = handlerFor(parsed.pathname, parsed.searchParams);

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
