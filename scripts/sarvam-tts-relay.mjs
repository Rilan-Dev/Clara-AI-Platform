/**
 * Server-side Sarvam Bulbul v3 realtime TTS relay.
 *
 * Browser -> Clara WS -> Sarvam TTS WS.
 * The Sarvam key and vendor endpoint stay server-side.
 * One browser session owns one warm Bulbul connection and can stream
 * multiple generations through it.
 */
import crypto from "node:crypto";
import WebSocket from "ws";

const PORT = process.env.PORT ?? 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_VERSION = "v1";
const RELAY_HEADER_PAYLOAD = "sarvam-relay-v1";

function hmacHex(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("hex");
}
function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
  catch { return false; }
}
function verifyToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, expRaw, kbId, orgId, sig] = parts;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${TOKEN_VERSION}.${expRaw}.${kbId}.${orgId}`;
  if (!safeEqualHex(hmacHex(payload), sig) || Date.now() >= expiresAtMs) return null;
  return { kbId, orgId };
}
function send(ws, value) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(value)); } catch {}
  }
}
function relayHeaderValue() { return hmacHex(RELAY_HEADER_PAYLOAD); }

export async function handleSarvamTtsRealtimeConnection(browserWs, req) {
  const url = new URL(req.url, BASE);
  const claims = verifyToken(url.searchParams.get("token"));
  if (!claims) {
    send(browserWs, { type: "error", message: "Invalid or expired realtime TTS session token", fatal: true });
    browserWs.close(1008, "Invalid token");
    return;
  }

  send(browserWs, { type: "status", value: "connecting" });

  let cfg;
  try {
    const response = await fetch(`${BASE}/api/voice/sarvam/realtime-init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sarvam-relay": relayHeaderValue(),
      },
      body: JSON.stringify({ kbId: claims.kbId, orgId: claims.orgId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      send(browserWs, { type: "error", message: body.error ?? "Realtime TTS bootstrap failed", fatal: true });
      browserWs.close(1011, "Bootstrap failed");
      return;
    }
    cfg = await response.json();
  } catch {
    send(browserWs, { type: "error", message: "Could not reach Clara backend", fatal: true });
    browserWs.close(1011, "Backend unreachable");
    return;
  }

  const model = cfg.tts?.model || "bulbul:v3";
  const speaker = cfg.tts?.speaker || "shubh";
  const language = cfg.tts?.language || "en-IN";
  const upstreamUrl =
    `${String(cfg.baseUrl || "https://api.sarvam.ai").replace(/\/+$/, "")}/text-to-speech/ws?model=${encodeURIComponent(model)}&send_completion_event=true`;
  const upstream = new WebSocket(upstreamUrl, {
    headers: { "api-subscription-key": cfg.apiKey },
  });

  let closed = false;
  let generationId = null;
  const closeBoth = (code = 1000, reason = "closed") => {
    if (closed) return;
    closed = true;
    try { upstream.close(code, reason); } catch {}
    try { browserWs.close(code, reason); } catch {}
  };

  upstream.on("open", () => {
    upstream.send(JSON.stringify({
      type: "config",
      data: {
        speaker,
        language_code: language,
        min_buffer_size: 50,
        max_chunk_length: 200,
        output_audio_codec: "linear16",
      },
    }));
    send(browserWs, { type: "status", value: "connected", sampleRate: 24000 });
  });

  upstream.on("message", (data) => {
    let event;
    try { event = JSON.parse(data.toString()); } catch { return; }
    const type = String(event.type ?? event.event ?? "");

    if (type === "audio") {
      const payload = event.data ?? {};
      send(browserWs, {
        type: "audio",
        generationId,
        audio: payload.audio ?? "",
        contentType: payload.content_type ?? "audio/linear16",
        sampleRate: 24000,
      });
      return;
    }

    if (type === "event") {
      const eventType = event.data?.event_type ?? event.event_type;
      send(browserWs, { type: "tts_event", generationId, eventType });
      return;
    }

    if (type === "error") {
      const payload = event.data ?? event;
      send(browserWs, {
        type: "error",
        generationId,
        message: String(payload.message ?? "Sarvam TTS error"),
        fatal: true,
      });
      return;
    }

    send(browserWs, { type: "upstream", event });
  });

  upstream.on("error", (error) => {
    console.error("[sarvam-tts-relay] upstream error:", error.message);
    send(browserWs, { type: "error", message: "Sarvam TTS connection error", fatal: true });
    closeBoth(1011, "Upstream error");
  });

  upstream.on("close", () => {
    send(browserWs, { type: "status", value: "closed" });
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1000, "TTS upstream closed");
  });

  browserWs.on("message", (data) => {
    let message;
    try { message = JSON.parse(data.toString()); }
    catch { return; }

    const type = String(message.type ?? "");
    if (type === "generation_start") {
      generationId = String(message.generationId ?? "");
      return;
    }

    if (type === "text") {
      if (typeof message.text !== "string" || !message.text.trim()) return;
      if (message.generationId != null) generationId = String(message.generationId);
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: "text", data: { text: message.text } }));
      }
      return;
    }

    if (type === "flush") {
      if (message.generationId != null) generationId = String(message.generationId);
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: "flush", data: {} }));
      }
      return;
    }

    if (type === "interrupt") {
      // The public Bulbul WS protocol has no generation-scoped cancel command.
      // Drop queued browser audio immediately and recreate the vendor context.
      // The next generation will be accepted on a fresh upstream socket.
      try { upstream.close(1000, "generation interrupted"); } catch {}
      return;
    }

    if (type === "ping") {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: "ping", data: {} }));
      }
    }
  });

  browserWs.on("close", () => closeBoth(1000, "Browser closed"));
  browserWs.on("error", () => closeBoth(1011, "Browser error"));
}
