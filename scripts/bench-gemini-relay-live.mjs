/**
 * scripts/bench-gemini-relay-live.mjs — LIVE round-trip validation of the
 * Gemini Live passthrough relay against Google (gap-closure Phase D).
 *
 * Chain under test (all real, no mocks):
 *   this script ⇄ ws://127.0.0.1:3100/api/voice/gemini/realtime?token=<HMAC>
 *             ⇄ scripts/gemini-relay.mjs (token verified in-process)
 *             ⇄ wss://generativelanguage.googleapis.com/…?key=<GEMINI_API_KEY>
 *
 * Steps: status=connected → setup (native-audio model, AUDIO modality,
 * input transcription) → setupComplete → stream a real spoken question
 * (16 kHz PCM16, resampled from the benchmark WAV) → vendor VAD commits →
 * modelTurn inlineData audio arrives → turnComplete.
 *
 * SUCCESS = the relay pipes a complete live voice turn; the long-lived
 * GEMINI_API_KEY never appears on the browser side of the socket.
 */

import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BASE = process.env.BENCH_URL ?? "http://127.0.0.1:3100";
const token = readFileSync("/tmp/gem-token.txt", "utf-8").trim();
const wavPath = resolve("tool-results/voice-bench/questions/short/short-02.wav");

// ── WAV → 16 kHz mono PCM16 (linear resample from the 24 kHz question WAV) ──
const wav = readFileSync(wavPath);
const sampleRate = wav.readUInt32LE(24);
const dataLen = wav.readUInt32LE(40);
const pcm24 = wav.subarray(44, 44 + dataLen);
let pcm16;
if (sampleRate === 16000) {
  pcm16 = Buffer.from(pcm24);
} else {
  const inFrames = Math.floor(pcm24.length / 2);
  const outFrames = Math.floor((inFrames * 16000) / sampleRate);
  pcm16 = Buffer.alloc(outFrames * 2);
  for (let i = 0; i < outFrames; i++) {
    const srcPos = (i * sampleRate) / 16000;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, inFrames - 1);
    const frac = srcPos - i0;
    const s0 = pcm24.readInt16LE(i0 * 2);
    const s1 = pcm24.readInt16LE(i1 * 2);
    pcm16.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2);
  }
}
console.log(`[gem-live] question WAV: ${sampleRate}Hz → 16kHz, ${pcm16.length / 2} frames (${(pcm16.length / 32000).toFixed(1)}s)`);

// Chunk the speech into ~100 ms realtimeInput frames (3200 bytes @16k mono16).
const CHUNK = 3200;
const chunks = [];
for (let i = 0; i < pcm16.length; i += CHUNK) chunks.push(pcm16.subarray(i, i + CHUNK));

const results = {
  statusConnected: false,
  setupComplete: false,
  inputTranscription: null,
  modelAudioBytes: 0,
  modelAudioChunks: 0,
  turnComplete: false,
  serverContentMessages: 0,
  errors: [],
};

const ws = new WebSocket(`ws://127.0.0.1:3100/api/voice/gemini/realtime?token=${token}`);
const t0 = Date.now();
const timeout = setTimeout(() => { console.log("[gem-live] TIMEOUT 45s"); report(false); }, 45_000);

function report(ok) {
  clearTimeout(timeout);
  try { ws.close(); } catch {}
  console.log("[gem-live] RESULT:", JSON.stringify({
    ...results,
    totalMs: Date.now() - t0,
    passed: ok,
  }, null, 1));
  process.exit(ok ? 0 : 1);
}

ws.on("open", () => {
  console.log(`[gem-live] relay WS open (${Date.now() - t0}ms) — token accepted`);
});

ws.on("message", (data) => {
  let msg;
  try { msg = JSON.parse(data.toString()); } catch { return; }
  const type = String(msg.type ?? "");

  if (type === "status") {
    if (msg.value === "connected") {
      results.statusConnected = true;
      console.log(`[gem-live] upstream Google WS connected (${Date.now() - t0}ms) — sending setup`);
      ws.send(JSON.stringify({
        setup: {
          model: "gemini-2.5-flash-native-audio-preview-12-2025",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
            inputAudioTranscription: {},
          },
          systemInstruction: { parts: [{ text: "You are Clara, a concise voice assistant. Answer in one short sentence." }] },
        },
      }));
    }
    return;
  }

  if (type === "error") {
    results.errors.push(String(msg.message ?? "unknown"));
    console.log("[gem-live] relay error:", msg.message);
    report(false);
    return;
  }

  if ("setupComplete" in msg) {
    results.setupComplete = true;
    console.log(`[gem-live] setupComplete (${Date.now() - t0}ms) — streaming ${chunks.length} audio chunks`);
    let i = 0;
    const sendNext = () => {
      if (i >= chunks.length) {
        // Speech done — let the vendor VAD finalize; keepalive not needed.
        return;
      }
      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: chunks[i].toString("base64") }],
        },
      }));
      i += 1;
      setTimeout(sendNext, 100);
    };
    sendNext();
    return;
  }

  const sc = msg.serverContent;
  if (sc) {
    results.serverContentMessages += 1;
    if (sc.inputTranscription) {
      const text = JSON.stringify(sc.inputTranscription);
      results.inputTranscription = text.slice(0, 120);
    }
    if (sc.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        if (part.inlineData?.data) {
          results.modelAudioChunks += 1;
          results.modelAudioBytes += Math.round((part.inlineData.data.length * 3) / 4);
        }
      }
    }
    if (sc.turnComplete) {
      results.turnComplete = true;
      console.log(`[gem-live] turnComplete — model audio: ${results.modelAudioChunks} chunks / ${results.modelAudioBytes} bytes`);
      report(results.statusConnected && results.setupComplete && results.modelAudioBytes > 1000 && results.inputTranscription != null);
    }
    if (sc.interrupted) {
      console.log("[gem-live] vendor interruption");
    }
  }

  if (msg.toolCall) console.log("[gem-live] toolCall frame received (not expected for this prompt)");
});

ws.on("error", (e) => {
  results.errors.push(e.message);
  console.log("[gem-live] WS error:", e.message);
  report(false);
});
