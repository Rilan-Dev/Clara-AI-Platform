/**
 * scripts/phone-stream.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully self-contained WebSocket handler for live phone calls.
 * Runs inside the Node.js process alongside Next.js (no TypeScript imports).
 *
 * Architecture — identical to voice-relay.mjs but for telephony:
 *
 *   Twilio/Vonage WebSocket  ──audio──▶  CallBridge  ──PCM16──▶  OpenAI Realtime WS
 *                            ◀─audio──               ◀─audio──
 *
 * Twilio audio:  JSON frames { event:"media", media:{ payload: "<base64 mulaw 8kHz>" } }
 * Vonage audio:  raw binary L16 PCM at 16kHz
 * OpenAI input:  base64-encoded PCM16 at 24kHz
 * OpenAI output: base64-encoded PCM16 at 24kHz → resampled → sent back to provider
 *
 * Called from start.mjs for WebSocket upgrades on:
 *   /api/phone/twilio/stream
 *   /api/phone/vonage/stream
 */

import WebSocket from "ws";

const PORT = process.env.PORT ?? 3000;
const BASE = `http://127.0.0.1:${PORT}`;

// ── Twilio handler ─────────────────────────────────────────────────────────────

export async function handleTwilioStream(phoneWs, req) {
  const url = new URL(req.url, BASE);
  let callSid = url.searchParams.get("callSid") ?? "";
  let kbId    = url.searchParams.get("kbId")    ?? "";

  const mediaBuffer = []; // buffer media frames until "start" arrives
  let   bridge      = null;
  let   started     = false;

  phoneWs.on("message", async (data) => {
    // ws library passes all frames as Buffer — always parse as string first
    const str = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);

    let msg;
    try { msg = JSON.parse(str); } catch { return; } // non-JSON = binary audio, skip
    const ev = msg.event ?? "";

    if (ev === "connected") return;

    if (ev === "start") {
      if (started) return;
      started = true;

      // Pull kbId/callSid from custom parameters if not in URL
      const startData = msg.start ?? {};
      const cp = startData.customParameters ?? {};
      if (cp.callSid || startData.callSid) callSid = cp.callSid || startData.callSid || callSid;
      if (cp.kbId) kbId = cp.kbId;
      // streamSid (MZ...) is what Twilio expects in media responses — different from callSid (CA...)
      const streamSid = msg.streamSid || startData.streamSid || callSid;
      console.log("[phone/twilio] kbId=" + kbId + " callSid=" + callSid + " streamSid=" + streamSid);

      if (!kbId) {
        console.error("[phone/twilio] No kbId — closing");
        phoneWs.close(1008, "Missing kbId");
        return;
      }

      const cfg = await fetchPhoneSession(kbId, "twilio");
      if (!cfg) { phoneWs.close(1011, "Session failed"); return; }

      bridge = new TwilioCallBridge(phoneWs, callSid, streamSid, kbId, cfg);
      await bridge.start();

      // Replay buffered media
      for (const frame of mediaBuffer) bridge.handleTwilioMedia(frame);
      mediaBuffer.length = 0;
      return;
    }

    if (ev === "media") {
      if (bridge) bridge.handleTwilioMedia(msg);
      else        mediaBuffer.push(msg);
      return;
    }

    if (ev === "stop") { bridge?.end("call ended"); return; }
    if (ev === "mark")  return;
  });

  phoneWs.on("close",  () => bridge?.end("phone disconnected"));
  phoneWs.on("error",  (e) => { console.error("[phone/twilio] ws error:", e.message); bridge?.end("phone error"); });
}

// ── Vonage handler ─────────────────────────────────────────────────────────────

export async function handleVonageStream(phoneWs, req) {
  const url = new URL(req.url, BASE);
  let callSid = url.searchParams.get("callSid") ?? "";
  let kbId    = url.searchParams.get("kbId")    ?? "";

  const audioBuffer = [];
  let   bridge      = null;
  let   started     = false;

  phoneWs.on("message", async (data) => {
    // ws library: all frames arrive as Buffer. Try JSON first, treat rest as binary audio.
    const str = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    const looksLikeJson = str.trimStart().startsWith("{") || str.trimStart().startsWith("[");
    if (looksLikeJson) {
      // Text frame — Vonage call metadata JSON
      try {
        const msg = JSON.parse(str);
        if (msg.uuid)              callSid = msg.uuid;
        if (msg.headers?.kbId)     kbId    = msg.headers.kbId;
        if (msg.headers?.callSid)  callSid = msg.headers.callSid;
      } catch { /* ignore */ }

      if (kbId && !started) {
        started = true;
        const cfg = await fetchPhoneSession(kbId, "vonage");
        if (!cfg) { phoneWs.close(1011, "Session failed"); return; }

        bridge = new VonageCallBridge(phoneWs, callSid, kbId, cfg);
        await bridge.start();

        for (const buf of audioBuffer) bridge.handleAudio(buf);
        audioBuffer.length = 0;
      }
      return;
    }

    // Binary audio frame
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (bridge) bridge.handleAudio(buf);
    else        audioBuffer.push(buf);
  });

  phoneWs.on("close",  () => bridge?.end("phone disconnected"));
  phoneWs.on("error",  (e) => { console.error("[phone/vonage] ws error:", e.message); bridge?.end("phone error"); });
}

// ── Fetch session config from Next.js internal API ─────────────────────────────

async function fetchPhoneSession(kbId, provider) {
  try {
    const res = await fetch(`${BASE}/api/phone/session`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-phone-internal": "1" },
      body:    JSON.stringify({ kbId, provider }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[phone] session failed (${res.status}):`, err);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[phone] fetchPhoneSession error:", e.message);
    return null;
  }
}

// ── RAG search helper ─────────────────────────────────────────────────────────

async function fetchRagContext(kbId, query) {
  try {
    const res = await fetch(`${BASE}/api/embed/search`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-phone-internal": "1", "x-kb-id": kbId },
      body:    JSON.stringify({ query, limit: 5 }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.context ?? "";
  } catch { return ""; }
}

// ── Update call log ───────────────────────────────────────────────────────────

async function logCallEnd(callSid, updates) {
  try {
    await fetch(`${BASE}/api/phone/log`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-phone-internal": "1" },
      body:    JSON.stringify({ callSid, ...updates }),
    });
  } catch { /* ignore */ }
}

// ── Codec helpers ─────────────────────────────────────────────────────────────

// mulaw byte → int16
function mulawDecode(byte) {
  byte = ~byte & 0xff;
  const sign     = byte & 0x80;
  const exp      = (byte >> 4) & 0x07;
  const mantissa = byte & 0x0f;
  let   sample   = ((mantissa << 1) + 33) << (exp + 2);
  sample -= 132; // MULAW_BIAS = 0x84
  return sign ? -sample : sample;
}

// int16 → mulaw byte
function mulawEncode(sample) {
  const sign = sample < 0 ? 0x80 : 0;
  sample = Math.min(Math.abs(sample) + 132, 32767 + 132);
  let exp = 7;
  for (let m = 0x4000; (sample & m) === 0 && exp > 0; exp--, m >>= 1) {}
  return ~(sign | (exp << 4) | ((sample >> (exp + 3)) & 0x0f)) & 0xff;
}

// mulaw buffer → PCM16 LE buffer
function mulawToPcm16(buf) {
  const out = Buffer.allocUnsafe(buf.length * 2);
  for (let i = 0; i < buf.length; i++) out.writeInt16LE(mulawDecode(buf[i]), i * 2);
  return out;
}

// PCM16 → mulaw
function pcm16ToMulaw(buf) {
  const out = Buffer.allocUnsafe(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = mulawEncode(buf.readInt16LE(i * 2));
  return out;
}

// PCM16 8kHz → 24kHz (ratio 3:1 linear interpolation)
function resample8To24(pcm8) {
  const n8 = pcm8.length / 2;
  const out = Buffer.allocUnsafe(n8 * 3 * 2);
  for (let i = 0; i < n8; i++) {
    const s = pcm8.readInt16LE(i * 2);
    const n = i + 1 < n8 ? pcm8.readInt16LE((i + 1) * 2) : s;
    out.writeInt16LE(s,                          i * 6);
    out.writeInt16LE(Math.round((s*2+n)/3),      i * 6 + 2);
    out.writeInt16LE(Math.round((s+n*2)/3),      i * 6 + 4);
  }
  return out;
}

// PCM16 24kHz → 8kHz (average every 3)
function resample24To8(pcm24) {
  const n24 = pcm24.length / 2;
  const n8  = Math.floor(n24 / 3);
  const out = Buffer.allocUnsafe(n8 * 2);
  for (let i = 0; i < n8; i++) {
    const a = pcm24.readInt16LE(i*6), b = pcm24.readInt16LE(i*6+2), c = pcm24.readInt16LE(i*6+4);
    out.writeInt16LE(Math.round((a+b+c)/3), i*2);
  }
  return out;
}

// PCM16 16kHz → 24kHz (ratio 3:2)
function resample16To24(pcm16) {
  const n16 = pcm16.length / 2;
  const n24 = Math.floor(n16 * 3 / 2);
  const out = Buffer.allocUnsafe(n24 * 2);
  let   j = 0;
  for (let i = 0; i + 1 < n16 && j + 2 < n24; i += 2) {
    const a = pcm16.readInt16LE(i*2), b = pcm16.readInt16LE((i+1)*2);
    out.writeInt16LE(a,                     j*2); j++;
    out.writeInt16LE(Math.round((a+b)/2),   j*2); j++;
    out.writeInt16LE(b,                     j*2); j++;
  }
  return out.slice(0, j * 2);
}

// PCM16 24kHz → 16kHz
function resample24To16(pcm24) {
  const n24 = pcm24.length / 2;
  const n16 = Math.floor(n24 * 2 / 3);
  const out = Buffer.allocUnsafe(n16 * 2);
  let   j = 0;
  for (let i = 0; i + 2 < n24 && j + 1 < n16; i += 3) {
    const a = pcm24.readInt16LE(i*2), b = pcm24.readInt16LE((i+1)*2), c = pcm24.readInt16LE((i+2)*2);
    out.writeInt16LE(Math.round((a+b)/2), j*2); j++;
    out.writeInt16LE(Math.round((b+c)/2), j*2); j++;
  }
  return out.slice(0, j * 2);
}

// ── Base CallBridge ───────────────────────────────────────────────────────────

class CallBridge {
  constructor(phoneWs, callSid, kbId, cfg) {
    this.phoneWs     = phoneWs;
    this.callSid     = callSid;
    this.kbId        = kbId;
    this.cfg         = cfg;
    this.openaiWs    = null;
    this.userQuery   = "";
    this.ragAbort    = null;
    this.callTimer   = null;
    this.transcript  = [];
    this.turnCount   = 0;
    this.toolBuf     = {};
    this.startedAt   = new Date();
  }

  async start() {
    const { ephemeralKey, model } = this.cfg;

    this.openaiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      { headers: { Authorization: `Bearer ${ephemeralKey}` } }
    );

    this.openaiWs.on("open", () => {
      console.log(`[phone] OpenAI WS open — callSid=${this.callSid}`);

      // Speak greeting
      const greeting = this.cfg.greetingMessage;
      if (greeting?.trim()) {
        this.sendToOpenAI({
          type: "response.create",
          response: { instructions: `Say exactly: "${greeting}"`, tool_choice: "none" },
        });
      }

      // Enforce max call duration
      this.callTimer = setTimeout(() => {
        this.sendToOpenAI({
          type: "response.create",
          response: { instructions: "Tell the caller the maximum time has been reached and say goodbye.", tool_choice: "none" },
        });
        setTimeout(() => this.end("max duration"), 12_000);
      }, this.cfg.maxCallDurationSec * 1000);
    });

    this.openaiWs.on("message", (data) => {
      try { this.handleOpenAIEvent(JSON.parse(data.toString())); } catch { /* ignore */ }
    });

    this.openaiWs.on("close",  () => this.end("openai closed"));
    this.openaiWs.on("error",  (e) => { console.error("[phone] OpenAI ws error:", e.message); this.end("openai error"); });
  }

  handleOpenAIEvent(ev) {
    const type = ev.type ?? "";

    if (type === "input_audio_buffer.speech_started") {
      this.userQuery = "";
      this.ragAbort?.abort();
    }

    if (type === "conversation.item.input_audio_transcription.delta") {
      if (ev.delta) this.userQuery += ev.delta;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const final = ev.transcript ?? this.userQuery;
      if (final.trim()) {
        this.userQuery = final;
        this.transcript.push({ speaker: "user", text: final.trim(), ts: new Date().toISOString() });
        this.turnCount++;
        this.ragAndRespond();
      }
    }

    // AI audio output → send to phone
    if (type === "response.audio.delta" && ev.delta) {
      this.sendAudioToPhone(Buffer.from(ev.delta, "base64"));
    }

    // Collect AI transcript for logging
    if (type === "response.created") {
      this._asstTurn = { text: "", ts: new Date().toISOString() };
      this.transcript.push({ speaker: "assistant", text: "", ts: this._asstTurn.ts });
    }
    if ((type === "response.audio_transcript.delta" || type === "response.text.delta") && ev.delta) {
      const turn = this.transcript.findLast?.(t => t.speaker === "assistant") ?? null;
      if (turn) turn.text += ev.delta;
    }
    if (type === "response.done") {
      this.turnCount++;
    }

    // Tool call — return empty, we inject context proactively
    if (type === "response.function_call_arguments.delta" && ev.call_id) {
      this.toolBuf[ev.call_id] = (this.toolBuf[ev.call_id] ?? "") + (ev.delta ?? "");
    }
    if (type === "response.function_call_arguments.done" && ev.call_id) {
      delete this.toolBuf[ev.call_id];
      this.sendToOpenAI({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: ev.call_id,
          output: JSON.stringify({ info: "Context injected via system message." }) },
      });
      this.sendToOpenAI({ type: "response.create" });
    }
  }

  async ragAndRespond() {
    const query = this.userQuery.trim();
    if (!query) return;
    this.ragAbort?.abort();
    const ctrl = new AbortController();
    this.ragAbort = ctrl;
    try {
      const context = await fetchRagContext(this.kbId, query);
      if (ctrl.signal.aborted) return;

      if (context.trim()) {
        this.sendToOpenAI({
          type: "conversation.item.create",
          item: { type: "message", role: "system",
            content: [{ type: "input_text",
              text: `Knowledge base context:\n\n${context.trim()}\n\nAnswer the caller using this context. Be concise (under 3 sentences).` }] },
        });
      }
      this.sendToOpenAI({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text: query }] },
      });
      this.sendToOpenAI({ type: "response.create", response: { tool_choice: "none" } });
      this.userQuery = "";
    } catch (e) {
      if (e?.name === "AbortError") return;
      this.sendToOpenAI({ type: "response.create", response: { tool_choice: "none" } });
    }
  }

  sendToOpenAI(obj) {
    if (this.openaiWs?.readyState === WebSocket.OPEN) {
      try { this.openaiWs.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }

  end(reason) {
    if (this.callTimer) { clearTimeout(this.callTimer); this.callTimer = null; }
    this.ragAbort?.abort();
    try { this.openaiWs?.close(1000); } catch { /* ignore */ }
    const dur = Math.round((Date.now() - this.startedAt.getTime()) / 1000);
    console.log(`[phone] Call ended (${reason}) callSid=${this.callSid} dur=${dur}s turns=${this.turnCount}`);
  }

  // Override in subclasses
  sendAudioToPhone(_pcm24k) { /* subclass */ }
}

// ── Twilio bridge ─────────────────────────────────────────────────────────────

class TwilioCallBridge extends CallBridge {
  constructor(phoneWs, callSid, streamSid, kbId, cfg) {
    super(phoneWs, callSid, kbId, cfg);
    this.streamSid = streamSid || callSid;
  }

  handleTwilioMedia(msg) {
    const payload = msg?.media?.payload;
    if (!payload || !this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) return;
    const mulaw  = Buffer.from(payload, "base64");
    const pcm8k  = mulawToPcm16(mulaw);
    const pcm24k = resample8To24(pcm8k);
    this.sendToOpenAI({ type: "input_audio_buffer.append", audio: pcm24k.toString("base64") });
  }

  sendAudioToPhone(pcm24k) {
    if (this.phoneWs.readyState !== WebSocket.OPEN) return;
    const pcm8k  = resample24To8(pcm24k);
    const mulaw  = pcm16ToMulaw(pcm8k);
    this.phoneWs.send(JSON.stringify({
      event:     "media",
      streamSid: this.streamSid,
      media:     { payload: mulaw.toString("base64") },
    }));
  }
}

// ── Vonage bridge ─────────────────────────────────────────────────────────────

class VonageCallBridge extends CallBridge {
  handleAudio(buf) {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) return;
    const pcm24k = resample16To24(buf);
    this.sendToOpenAI({ type: "input_audio_buffer.append", audio: pcm24k.toString("base64") });
  }

  sendAudioToPhone(pcm24k) {
    if (this.phoneWs.readyState !== WebSocket.OPEN) return;
    this.phoneWs.send(resample24To16(pcm24k));
  }
}
