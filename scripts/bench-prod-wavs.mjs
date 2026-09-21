/**
 * scripts/bench-prod-wavs.mjs — synthesise the 5 production-portal benchmark
 * questions via Sarvam Bulbul streaming TTS and build ONE concatenated
 * session WAV (question → answer gap → question … → long trailing silence)
 * for Chromium's --use-file-for-fake-audio-capture.
 *
 * The questions target the production FAQ KB (kb_197fbb70_faq — AmazeTechCLANS
 * AI training services) so the RAG stage is exercised for real.
 *
 * Usage: SARVAM_API_KEY=… node scripts/bench-prod-wavs.mjs
 * Output: tool-results/voice-bench/prod/questions-session.wav
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY = process.env.SARVAM_API_KEY;
if (!KEY) { console.error("SARVAM_API_KEY required"); process.exit(1); }

const QUESTIONS = [
  { name: "q1-services", text: "Hi, what services does AmazeTechCLANS provide?", gapAfterMs: 25000 },
  { name: "q2-price", text: "What is the price of the Artificial Intelligence course?", gapAfterMs: 25000 },
  { name: "q3-duration", text: "How long is the AI training program?", gapAfterMs: 25000 },
  { name: "q4-interview", text: "Does the program include interview preparation and portfolio development?", gapAfterMs: 25000 },
  { name: "q5-internship", text: "Please explain everything about the industry internship and the beginner to expert learning path.", gapAfterMs: 0 },
];

const TRAILING_SILENCE_MS = 80_000; // > run window tail so the loop never re-asks

function ttsWav(text, language = "en-IN", speaker = "aditya") {
  return new Promise((res, rej) => {
    const ws = new WebSocket("https://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true", {
      headers: { "api-subscription-key": KEY },
    });
    const chunks = [];
    let sampleRate = 24000;
    const done = setTimeout(() => { try { ws.close(); } catch {} rej(new Error("tts timeout")); }, 45000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "config", data: { speaker, language_code: language, min_buffer_size: 30, max_chunk_length: 150, output_audio_codec: "linear16" } }));
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "text", data: { text } }));
        ws.send(JSON.stringify({ type: "flush", data: {} }));
      }, 250);
    });
    ws.on("message", (d) => {
      let ev; try { ev = JSON.parse(String(d)); } catch { return; }
      if (ev.type === "audio") {
        if (ev.data?.sample_rate) sampleRate = Number(ev.data.sample_rate) || sampleRate;
        const b64 = ev.data?.audio;
        if (b64) chunks.push(Buffer.from(b64, "base64"));
      } else if (ev.type === "event") {
        const et = ev.data?.event_type ?? ev.event_type;
        if (et === "final" || et === "completion") {
          clearTimeout(done);
          try { ws.close(); } catch {}
          res({ pcm: Buffer.concat(chunks), sampleRate });
        }
      } else if (ev.type === "error") {
        clearTimeout(done);
        try { ws.close(); } catch {}
        rej(new Error(JSON.stringify(ev).slice(0, 200)));
      }
    });
    ws.on("error", (e) => { clearTimeout(done); rej(e); });
  });
}

function wavFromPcm16(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);        // PCM
  header.writeUInt16LE(1, 22);        // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);        // block align
  header.writeUInt16LE(16, 34);       // bits
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function silence(ms, sampleRate) {
  return Buffer.alloc(Math.round((ms / 1000) * sampleRate) * 2, 0); // PCM16 mono
}

async function main() {
  const outDir = resolve("tool-results/voice-bench/prod");
  mkdirSync(outDir, { recursive: true });
  const parts = [];
  const manifest = [];
  for (const q of QUESTIONS) {
    const { pcm, sampleRate } = await ttsWav(q.text);
    const durMs = Math.round((pcm.length / 2 / sampleRate) * 1000);
    parts.push({ pcm, sampleRate });
    manifest.push({ name: q.name, durationMs: durMs, gapAfterMs: q.gapAfterMs });
    console.log(`[wav] ${q.name}: ${durMs}ms`);
    await new Promise(r => setTimeout(r, 400));
  }
  // All Bulbul chunks share the negotiated rate; concatenate with gaps.
  const sampleRate = parts[0].sampleRate;
  const segments = [];
  parts.forEach((p, i) => {
    segments.push(p.pcm);
    const gap = QUESTIONS[i].gapAfterMs;
    if (gap) segments.push(silence(gap, sampleRate));
  });
  segments.push(silence(TRAILING_SILENCE_MS, sampleRate));
  const sessionWav = wavFromPcm16(Buffer.concat(segments), sampleRate);
  const outPath = resolve(outDir, "questions-session.wav");
  writeFileSync(outPath, sessionWav);
  writeFileSync(resolve(outDir, "questions-manifest.json"), JSON.stringify({ sampleRate, questions: manifest, trailingSilenceMs: TRAILING_SILENCE_MS }, null, 2));
  const totalMs = Math.round((sessionWav.length - 44) / 2 / sampleRate * 1000);
  console.log(`[wav] session WAV: ${outPath} (${totalMs}ms loop, ${sampleRate}Hz)`);
}

main().catch(e => { console.error(e); process.exit(1); });
