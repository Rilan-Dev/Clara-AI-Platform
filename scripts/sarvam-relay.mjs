/**
 * scripts/sarvam-relay.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side Saaras realtime STT relay (V5). Runs inside the Node.js process
 * alongside Next.js (attached by scripts/start.mjs on the
 * /api/voice/sarvam/realtime upgrade path).
 *
 * Security properties:
 *   • The Sarvam API key never leaves the server (fetched server-to-server
 *     from realtime-init, HMAC-guarded by the x-sarvam-relay header)
 *   • The browser authenticates with a session-minted HMAC token (?token=),
 *     verified in-process — signature + expiry, no DB round-trip
 *   • Config (models, language, VAD tuning) is re-resolved server-side on
 *     every connection; client suggestions are never trusted
 *   • STT metering fires per transcript.final through the HMAC-guarded
 *     realtime-meter route (usage_events, provider='sarvam')
 *   • Hard caps: 60-minute connection lifetime, 120-second idle timeout
 *
 * Browser ←WebSocket→ this relay ←WebSocket→ wss://api.sarvam.ai
 *          (PCM16 base64)          (saaras:v3-realtime, vad endpointing)
 *
 * Browser→relay frames:  {"event":"audio_input","audio":"<base64 pcm16>"}
 *                        {"event":"config_update", ...}   (forwarded verbatim)
 * Relay→browser frames:  {"type":"status","value":"connected"|"connecting"|"closed"}
 *                        {"type":"transcript_partial","text":"…"}
 *                        {"type":"transcript_final","text":"…","audioSeconds":n}
 *                        {"type":"error","message":"…","fatal":bool}
 *
 * Upstream (vendor wire, plan §5.4):
 *   client→server  {"event":"audio_input","audio":"<base64>"}
 *   server→client  transcript.partial / transcript.final / error{code,is_fatal,message}
 *   close codes: 4000 = bad sample rate, others per vendor docs.
 */

import crypto from "node:crypto";
import WebSocket from "ws";

const PORT = process.env.PORT ?? 3000;
const BASE = `http://127.0.0.1:${PORT}`;

/** Connection hard caps (plan §15 V5). */
const MAX_LIFETIME_MS = 60 * 60 * 1000; // 60 minutes
const MAX_IDLE_MS = 120 * 1000;         // 120 seconds without any frame

const TOKEN_VERSION = "v1";
const RELAY_HEADER_PAYLOAD = "sarvam-relay-v1";

function hmacHex(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("hex");
}

function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Verify a session-minted browser token (mirrors realtime-auth.ts in TS). */
function verifyToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, expRaw, kbId, orgId, sig] = parts;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${TOKEN_VERSION}.${expRaw}.${kbId}.${orgId}`;
  if (!safeEqualHex(hmacHex(payload), sig)) return null;
  if (Date.now() >= expiresAtMs) return null;
  return { kbId, orgId };
}

function relayHeaderValue() {
  return hmacHex(RELAY_HEADER_PAYLOAD);
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (_) {}
  }
}

/** Extract the transcript text from an upstream event (tolerant of the
 *  vendor's event envelope variants). */
function transcriptText(event) {
  return String(event.transcript ?? event.text ?? event.partial ?? "");
}

/** Map a resolved Saaras STT id to the vendor realtime-WS model id.
 *  realtime-init already translates, but the relay is the LAST line of
 *  defense: the vendor rejects anything but 'saaras:v3-realtime' and
 *  'saaras:v4' with a fatal "Invalid model" error on connect. Idempotent. */
function toRealtimeModel(model) {
  const id = String(model ?? "").trim();
  if (id === "saaras:v4" || id === "saaras:v3-realtime") return id;
  return "saaras:v3-realtime"; // saaras:v3 (batch) + anything unknown
}

// ── Entry point called from start.mjs ────────────────────────────────────────

export async function handleSarvamRealtimeConnection(browserWs, req) {
  const url = new URL(req.url, BASE);
  const token = url.searchParams.get("token") ?? "";

  const claims = verifyToken(token);
  if (!claims) {
    send(browserWs, { type: "error", message: "Invalid or expired realtime session token", fatal: true });
    browserWs.close(1008, "Invalid token");
    return;
  }
  const { kbId, orgId } = claims;

  // ── 1. Config + vendor key, resolved server-side (HMAC-guarded call) ──────
  send(browserWs, { type: "status", value: "connecting" });

  let cfg;
  try {
    const res = await fetch(`${BASE}/api/voice/sarvam/realtime-init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sarvam-relay": relayHeaderValue(),
      },
      body: JSON.stringify({ kbId, orgId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      send(browserWs, { type: "error", message: err.error ?? "Relay bootstrap failed", fatal: true });
      browserWs.close(1011, "Bootstrap failed");
      return;
    }
    cfg = await res.json();
  } catch (e) {
    send(browserWs, { type: "error", message: "Could not reach backend", fatal: true });
    browserWs.close(1011, "Backend unreachable");
    return;
  }

  // ── 2. Upstream Saaras realtime socket ─────────────────────────────────────
  // Batch REST ids (saaras:v3) are invalid here — the vendor only accepts
  // 'saaras:v3-realtime' and 'saaras:v4'. One canonical realtime model id
  // feeds BOTH the upstream URL and the metering events below.
  const realtimeModel = toRealtimeModel(cfg.sttModel);
  const model = encodeURIComponent(realtimeModel);
  const language = encodeURIComponent(cfg.languageCode ?? "en-IN");
  const sampleRate = Number(cfg.sampleRate ?? 16000);
  const upstreamUrl =
    `${cfg.baseUrl}/speech-to-text-realtime/ws` +
    `?language_code=${language}` +
    `&model=${model}` +
    `&stream_type=fast` +
    `&encoding=linear16` +
    `&sample_rate=${sampleRate}` +
    `&endpointing=vad` +
    `&threshold=0.3` +
    `&silence_duration_ms=500` +
    `&min_speech_duration_ms=250`;

  const upstream = new WebSocket(upstreamUrl, {
    headers: { "api-subscription-key": cfg.apiKey },
  });

  const state = {
    upstreamReady: false,
    closed: false,
    bytesReceived: 0,
    bytesSent: 0,
    lastActivityMs: Date.now(),
    finals: 0,
  };

  // Buffer browser audio until the upstream socket is open.
  const audioQueue = [];

  const lifetimeTimer = setTimeout(() => {
    send(browserWs, { type: "status", value: "closed" });
    closeBoth(1000, "Connection lifetime cap reached");
  }, MAX_LIFETIME_MS);

  const idleTimer = setInterval(() => {
    if (state.closed) return;
    if (Date.now() - state.lastActivityMs > MAX_IDLE_MS) {
      send(browserWs, { type: "error", message: "Connection idle timeout", fatal: true });
      closeBoth(1000, "Idle timeout");
    }
  }, 5_000);

  // Sarvam realtime STT closes idle sessions with 1008. Keep a long-lived
  // voice session alive even when the caller pauses for a while.
  const keepAliveTimer = setInterval(() => {
    if (state.closed || !state.upstreamReady) return;
    try { upstream.send(JSON.stringify({ event: "ping" })); } catch {}
  }, 20_000);

  function closeBoth(code, reason) {
    if (state.closed) return;
    state.closed = true;
    clearTimeout(lifetimeTimer);
    clearInterval(idleTimer);
    clearInterval(keepAliveTimer);
    try { upstream.close(code, reason); } catch (_) {}
    try { browserWs.close(code, reason); } catch (_) {}
  }

  function trackActivity() {
    state.lastActivityMs = Date.now();
  }

  function meterFinal(audioSeconds, languageCode) {
    // Fire-and-forget metering through the HMAC-guarded internal route —
    // failure never breaks the audio stream.
    fetch(`${BASE}/api/internal/sarvam/realtime-meter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sarvam-relay": relayHeaderValue(),
      },
      body: JSON.stringify({
        orgId: cfg.orgId ?? orgId,
        kbId,
        agentId: cfg.agentId ?? null,
        model: realtimeModel,
        audioSeconds,
        languageCode: languageCode ?? cfg.languageCode ?? null,
      }),
    }).catch((e) => console.warn("[sarvam-relay] metering failed:", e.message));
  }

  upstream.on("open", () => {
    state.upstreamReady = true;
    // Flush buffered audio in order.
    for (const frame of audioQueue.splice(0)) {
      upstream.send(frame);
    }
    send(browserWs, { type: "status", value: "connected" });
  });

  upstream.on("message", (data) => {
    trackActivity();
    state.bytesReceived += data.length;

    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return; // tolerate keep-alives / non-JSON frames
    }

    const type = String(event.type ?? event.event ?? "");

    if (type === "transcript.partial" || type === "transcript_partial") {
      send(browserWs, { type: "transcript_partial", text: transcriptText(event) });
      return;
    }

    if (type === "transcript.final" || type === "transcript_final" || type === "transcript") {
      const text = transcriptText(event);
      // Metering: audio actually streamed = bytesSent / (sampleRate * 2 bytes).
      const audioSeconds = Math.max(
        1,
        Math.round(state.bytesSent / (sampleRate * 2)),
      );
      state.finals++;
      state.bytesSent = 0; // per-turn accounting, mirrors utterance metering
      send(browserWs, { type: "transcript_final", text, audioSeconds });
      meterFinal(audioSeconds, event.language_code ?? null);
      return;
    }

    if (type === "error") {
      const message = String(event.message ?? "Upstream error");
      const fatal = Boolean(event.is_fatal ?? event.fatal ?? false);
      send(browserWs, { type: "error", message, fatal });
      if (fatal) closeBoth(1011, "Upstream fatal error");
      return;
    }

    // Unknown vendor events pass through with their envelope intact so the
    // client can evolve without a relay change.
    send(browserWs, { type: "upstream", event });
  });

  upstream.on("close", (code, reason) => {
    send(browserWs, { type: "status", value: "closed" });
    closeBoth(code ?? 1000, reason?.toString?.() ?? "Upstream closed");
  });

  upstream.on("error", (err) => {
    console.error("[sarvam-relay] upstream error:", err.message);
    send(browserWs, { type: "error", message: "Upstream connection error", fatal: true });
    closeBoth(1011, "Upstream error");
  });

  // ── 3. Browser → upstream audio piping ─────────────────────────────────────
  browserWs.on("message", (data) => {
    trackActivity();

    let frame;
    try {
      const text = data.toString();
      JSON.parse(text); // validate JSON before forwarding
      frame = text;
    } catch {
      // Raw binary PCM frames are also accepted (typed as audio directly).
      frame = data;
    }

    state.bytesSent += data.length;
    if (state.upstreamReady) {
      try { upstream.send(frame); } catch (_) {}
    } else {
      audioQueue.push(frame);
      if (audioQueue.length > 600) audioQueue.shift(); // ~60 s at 100 ms frames
    }
  });

  browserWs.on("close", () => closeBoth(1000, "Browser closed"));
  browserWs.on("error", () => closeBoth(1011, "Browser error"));
}
