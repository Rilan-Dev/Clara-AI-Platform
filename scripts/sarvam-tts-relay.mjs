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
import {
  closeUpstreamSocket,
  isSelfClosedSocket,
  isHandshakeTimedOut,
  safeWsHost,
  armHandshakeTimeout,
} from "./ws-lifecycle.mjs";

const PORT = process.env.PORT ?? 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_VERSION = "v1";
const RELAY_HEADER_PAYLOAD = "sarvam-relay-v1";

// A vendor WS upgrade normally completes in well under a second. A base URL
// that accepts TCP but never completes the upgrade (misconfigured provider
// base URL behind a proxy) must fail fast with an actionable message instead
// of parking in CONNECTING until the browser gives up.
const UPSTREAM_HANDSHAKE_TIMEOUT_MS = 10_000;

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

/**
 * Per-generation character metering (plan Task 5.3: "meter usage once").
 *
 * The hook streams MANY text frames per assistant generation (sentence
 * chunks, each with its own flush). Metering per frame would recreate the
 * sentence-by-sentence billing the plan forbids. This helper accumulates
 * characters per generationId and emits EXACTLY ONE meter callback per
 * generation — flushed when the next generation starts or the connection
 * settles. Exported for relay tests.
 */
export function createGenerationMeter(meter) {
  let generationId = null;
  let characters = 0;

  const settle = () => {
    if (characters > 0) {
      meter({ generationId, characters });
      characters = 0;
    }
    generationId = null;
  };

  return {
    /** Accumulate text for a generation; switching generation settles the old one. */
    add(nextGenerationId, text) {
      const id = nextGenerationId == null ? null : String(nextGenerationId);
      if (id !== generationId) {
        settle();
        generationId = id;
      }
      characters += typeof text === "string" ? text.trim().length : 0;
    },
    /** Meter the trailing generation (connection close). */
    settle,
  };
}

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

  if (cfg.tts?.enabled === false) {
    send(browserWs, { type: "error", message: "Sarvam realtime TTS is disabled in platform settings.", fatal: true });
    browserWs.close(1008, "Realtime TTS disabled");
    return;
  }
  const model = cfg.realtime?.ttsModel || cfg.tts?.model || "bulbul:v3";
  const speaker = cfg.tts?.speaker || "shubh";
  const language = cfg.tts?.language || "en-IN";
  const upstreamUrl =
    `${String(cfg.baseUrl || "https://api.sarvam.ai").replace(/\/+$/, "")}/text-to-speech/ws?model=${encodeURIComponent(model)}&send_completion_event=true`;

  let closed = false;
  let generationId = null;
  let upstream = null;
  let reconnectTimer = null;
  let pingTimer = null;
  const pending = [];
  // Bounded reconnect (plan Phase 9 — NO infinite reconnect loops): five
  // attempts with linear backoff, then a fatal error so the browser can
  // recover deterministically. A successful reconnect resets the budget.
  // Mirrors src/modules/voice-core/realtime/reconnect-policy.ts (plain JS —
  // relay scripts cannot import TS).
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const reconnect = {
    succeeded() { reconnectAttempts = 0; },
    nextDelayMs() {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return null;
      reconnectAttempts += 1;
      return 250 * reconnectAttempts;
    },
  };

  // One meter event per assistant generation — never per sentence frame.
  const generationMeter = createGenerationMeter(({ characters }) => {
    if (!cfg.orgId) return;
    fetch(`${BASE}/api/internal/sarvam/realtime-meter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sarvam-relay": relayHeaderValue(),
      },
      body: JSON.stringify({
        kind: "tts",
        orgId: cfg.orgId,
        kbId: claims.kbId,
        agentId: cfg.agentId ?? null,
        model,
        characters,
      }),
    }).catch((e) => console.warn("[sarvam-tts-relay] tts metering failed:", e.message));
  });

  const closeBoth = (code = 1000, reason = "closed") => {
    if (closed) return;
    closed = true; // set FIRST: synthetic abortHandshake events are filtered by `closed`
    generationMeter.settle(); // meter the trailing generation exactly once
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    closeUpstreamSocket(upstream, code, reason); // CONNECTING-safe teardown
    try { browserWs.close(code, reason); } catch {}
  };

  const openUpstream = () => {
    if (closed || upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(upstreamUrl, { headers: { "api-subscription-key": cfg.apiKey } });
    upstream = socket;
    // Disarm the handshake deadline on open/close/error — every terminal path.
    const disarmHandshakeTimer = armHandshakeTimeout({
      socket,
      url: upstreamUrl,
      timeoutMs: UPSTREAM_HANDSHAKE_TIMEOUT_MS,
      onTimeout: (host) => {
        console.error(
          `[sarvam-tts-relay] upstream (${host}) did not complete the WebSocket handshake within ${UPSTREAM_HANDSHAKE_TIMEOUT_MS} ms — check the provider base URL`,
        );
        send(browserWs, {
          type: "error",
          message: `Sarvam TTS endpoint (${host}) is not responding — check the provider base URL and network.`,
          fatal: false,
        });
      },
    });

    socket.on("open", () => {
      socket.__relayOpened = true; // handshake completed at least once (error classification)
      disarmHandshakeTimer();
      reconnect.succeeded(); // vendor is healthy again — reset the budget
      socket.send(JSON.stringify({ type: "config", data: {
        speaker, language_code: language, min_buffer_size: 30, max_chunk_length: 150, output_audio_codec: "linear16",
      }}));
      send(browserWs, { type: "status", value: "connected", model, sampleRate: 24000 });
      for (const msg of pending.splice(0)) { try { socket.send(msg); } catch {} }
    });

    socket.on("message", (data) => {
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
      send(browserWs, { type: "error", generationId, message: String(payload.message ?? "Sarvam TTS error"), fatal: false });
      return;
    }

    send(browserWs, { type: "upstream", event });
  });

    socket.on("error", (error) => {
      disarmHandshakeTimer();
      // ws@8 emits a synthetic "WebSocket was closed before the connection
      // was established" whenever close()/terminate() races a pending
      // handshake (browser disconnect, interrupt, handshake timeout). Those
      // are deliberate — never log them as vendor failures.
      if (closed || isSelfClosedSocket(socket) || isHandshakeTimedOut(socket)) return;
      const host = safeWsHost(upstreamUrl);
      console.error(`[sarvam-tts-relay] upstream error (${host}${socket.__relayOpened ? "" : ", during handshake"}):`, error.message);
      send(browserWs, {
        type: "error",
        message: socket.__relayOpened
          ? "Sarvam TTS connection error"
          : `Sarvam TTS connection failed (${host}) — check the provider base URL.`,
        fatal: false,
      });
    });

    socket.on("close", () => {
      disarmHandshakeTimer();
      if (upstream === socket) upstream = null;
      // Deliberate teardown (interrupt) never re-arms the reconnect loop —
      // the interrupt path opens a fresh socket itself. Handshake timeouts
      // DO retry: the bounded policy below gives the endpoint 5 chances.
      if (closed || isSelfClosedSocket(socket)) return;
      const delay = reconnect.nextDelayMs();
      if (delay === null) {
        // Reconnect budget exhausted — surface a FATAL error so the browser
        // recovers deterministically instead of churning forever.
        send(browserWs, { type: "error", message: "TTS connection lost after repeated retries", fatal: true });
        closeBoth(1011, "Reconnect budget exhausted");
        return;
      }
      send(browserWs, { type: "status", value: "reconnecting" });
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(openUpstream, delay);
    });
  };

  openUpstream();
  pingTimer = setInterval(() => {
    if (upstream?.readyState === WebSocket.OPEN) {
      try { upstream.send(JSON.stringify({ type: "ping", data: {} })); } catch {}
    } else {
      openUpstream();
    }
  }, 20_000);

  browserWs.on("message", (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }

    const type = String(message.type ?? "");
    if (type === "generation_start") {
      generationId = String(message.generationId ?? "");
      return;
    }

    if (type === "text") {
      if (typeof message.text !== "string" || !message.text.trim()) return;
      if (message.generationId != null) generationId = String(message.generationId);
      // Meter once per generation: accumulate chars, settle on switch/close.
      generationMeter.add(message.generationId, message.text);
      const payload = JSON.stringify({ type: "text", data: { text: message.text } });
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(payload); } catch { pending.push(payload); } }
      else { pending.push(payload); openUpstream(); }
      return;
    }

    if (type === "flush") {
      if (message.generationId != null) generationId = String(message.generationId);
      const payload = JSON.stringify({ type: "flush", data: {} });
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(payload); } catch { pending.push(payload); } }
      else { pending.push(payload); openUpstream(); }
      return;
    }

    if (type === "interrupt") {
      pending.length = 0;
      // CONNECTING-safe: an interrupt during a pending handshake must
      // terminate quietly (closeUpstreamSocket marks + terminates) instead
      // of tripping ws@8's synthetic abortHandshake error.
      closeUpstreamSocket(upstream, 1000, "generation interrupted");
      upstream = null;
      setTimeout(openUpstream, 0);
      return;
    }

    if (type === "ping") {
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(JSON.stringify({ type: "ping", data: {} })); } catch {} }
      else openUpstream();
    }
  });

  browserWs.on("close", () => closeBoth(1000, "Browser closed"));
  browserWs.on("error", () => closeBoth(1011, "Browser error"));
}
