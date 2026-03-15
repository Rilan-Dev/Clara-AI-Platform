/**
 * scripts/phone-stream.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * WebSocket handler for live phone call audio streams.
 * Instantiates a CallHandler per call and bridges provider audio ↔ OpenAI.
 *
 * Twilio stream: sends JSON frames with base64-encoded mulaw audio
 *   { event:"media", media:{ payload:"<base64 mulaw>" }, streamSid:"..." }
 *
 * Vonage stream: sends raw binary L16 PCM at 16kHz directly over WebSocket
 *
 * Called from start.mjs which routes WS upgrades by pathname.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const BASE = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

// ── Twilio handler ─────────────────────────────────────────────────────────────

export async function handleTwilioStream(ws, req) {
  const url    = new URL(req.url, BASE);
  let   callSid = url.searchParams.get("callSid") ?? "";
  let   kbId    = url.searchParams.get("kbId")    ?? "";

  // Twilio also sends start event with params
  const buffer = [];

  ws.on("message", async (data, isBinary) => {
    if (isBinary) return; // Twilio always sends JSON text frames

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    const event = msg.event;

    if (event === "connected") return;

    if (event === "start") {
      // Extract callSid/kbId from start message if not in URL
      const cp = msg.start?.customParameters ?? {};
      if (cp.callSid) callSid = cp.callSid;
      if (cp.kbId)    kbId    = cp.kbId;

      if (!callSid || !kbId) {
        console.error("[phone/twilio] Missing callSid or kbId — closing");
        ws.close(1008, "Missing callSid or kbId");
        return;
      }

      // Load phone config
      const config = await fetchPhoneConfig(kbId, "twilio");
      if (!config) { ws.close(1008, "Config not found"); return; }

      // Start the CallHandler — it takes ownership of ws
      const { CallHandler } = await importCallHandler();
      const handler = new CallHandler(ws, callSid, kbId, "twilio", "mulaw_8khz", config);

      // Replay any buffered media frames
      for (const frame of buffer) handler._forwardTwilioFrame(frame);
      buffer.length = 0;

      await handler.start();
      return;
    }

    if (event === "media") {
      buffer.push(msg); // buffer until start arrives
      return;
    }

    if (event === "stop") {
      ws.close(1000);
    }
  });

  ws.on("error", err => console.error("[phone/twilio/stream] ws error:", err.message));
}

// ── Vonage handler ─────────────────────────────────────────────────────────────

export async function handleVonageStream(ws, req) {
  const url    = new URL(req.url, BASE);
  let   callSid = url.searchParams.get("callSid") ?? "";
  let   kbId    = url.searchParams.get("kbId")    ?? "";

  let   handler  = null;
  const binBuf   = [];

  // Vonage sends a text JSON message first with call metadata, then binary audio
  ws.on("message", async (data, isBinary) => {
    if (!isBinary) {
      // Text frame — call metadata from Vonage
      try {
        const msg = JSON.parse(data.toString());
        if (msg.uuid)     callSid = msg.uuid;
        if (msg.headers?.kbId) kbId = msg.headers.kbId;
      } catch { /* ignore */ }

      if (callSid && kbId && !handler) {
        const config = await fetchPhoneConfig(kbId, "vonage");
        if (!config) { ws.close(1008, "Config not found"); return; }

        const { CallHandler } = await importCallHandler();
        handler = new CallHandler(ws, callSid, kbId, "vonage", "linear16_16khz", config);

        // Replay buffered binary frames
        for (const buf of binBuf) handler._handleRawAudio(buf);
        binBuf.length = 0;

        await handler.start();
      }
      return;
    }

    // Binary audio frame
    if (handler) {
      handler._handleRawAudio(data);
    } else {
      binBuf.push(Buffer.from(data));
    }
  });

  ws.on("error", err => console.error("[phone/vonage/stream] ws error:", err.message));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchPhoneConfig(kbId, provider) {
  try {
    const res = await fetch(`${BASE}/api/kbs/${kbId}/phone`, {
      headers: { "x-phone-internal": "1" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Return the first enabled config matching the provider (or first enabled)
    const configs = data.configs ?? [];
    return configs.find(c => c.enabled && c.provider === provider)
        ?? configs.find(c => c.enabled)
        ?? null;
  } catch (e) {
    console.error("[phone] fetchPhoneConfig failed:", e.message);
    return null;
  }
}

async function importCallHandler() {
  // Dynamic import from the standalone Next.js output
  // The TypeScript is compiled to JS at build time
  try {
    return await import("../src/modules/phone/core/call-handler.js");
  } catch {
    // In dev, try ts-node transpile-only path (not available in standalone)
    // Fall back to a no-op so the WS doesn't crash
    return { CallHandler: class NoOpHandler {
      constructor(ws) { ws.close(1011, "Phone module not compiled"); }
      async start() {}
    }};
  }
}
