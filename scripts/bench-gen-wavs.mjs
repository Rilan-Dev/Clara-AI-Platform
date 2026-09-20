/**
 * scripts/bench-gen-wavs.mjs — generates genuine spoken-question WAVs for the
 * voice benchmark using Sarvam Bulbul streaming TTS (the only TTS reachable
 * from this container — OpenAI/Gemini REST are region-blocked).
 *
 * Output: tool-results/voice-bench/questions/<class>/<name>.wav (PCM16 WAV).
 * The questions match the KB content ingested by scripts/bench-ingest.ts
 * (KB questions) or are general (short) or elaborate (long).
 */

import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY = process.env.SARVAM_API_KEY;
if (!KEY) { console.error("SARVAM_API_KEY required"); process.exit(1); }

const QUESTIONS = {
  short: [
    { name: "short-01", text: "Hi, what can you help me with?" },
    { name: "short-02", text: "What is the ambulance cover limit?" },
    { name: "short-03", text: "How long is the cataract waiting period?" },
    { name: "short-04", text: "Is dental treatment covered?" },
    { name: "short-05", text: "What is the free look period?" },
    { name: "short-06", text: "Can I renew my policy online?" },
    { name: "short-07", text: "What is the no claim bonus?" },
    { name: "short-08", text: "How many network hospitals are there?" },
    { name: "short-09", text: "Is air ambulance covered?" },
    { name: "short-10", text: "What is the grace period for renewal?" },
  ],
  kb: [
    { name: "kb-01", text: "What does the Health Shield policy cover?" },
    { name: "kb-02", text: "How do I file a cashless claim for a planned hospitalization?" },
    { name: "kb-03", text: "What documents are required for a reimbursement claim?" },
    { name: "kb-04", text: "What is the waiting period for pre-existing diseases?" },
    { name: "kb-05", text: "When can an insurance claim be rejected?" },
    { name: "kb-06", text: "How is my premium calculated?" },
    { name: "kb-07", text: "What are the sub limits on room rent?" },
    { name: "kb-08", text: "Is alternative medicine like Ayurveda covered?" },
    { name: "kb-09", text: "What tax benefit does the premium qualify for?" },
    { name: "kb-10", text: "What is not covered under Health Shield?" },
  ],
  long: [
    { name: "long-01", text: "Please explain the complete claims process in detail, including both cashless and reimbursement, with the timelines for each step." },
    { name: "long-02", text: "Explain everything about the waiting periods: pre-existing diseases, specific treatments, maternity, and how continuity affects them." },
    { name: "long-03", text: "Describe the full list of exclusions and explain the reasoning behind each category of exclusion." },
    { name: "long-04", text: "Walk me through how the sum insured restore benefit works, how the no claim bonus accumulates, and how a claim affects it." },
    { name: "long-05", text: "Explain the renewal process in detail, including the grace period, what happens if the policy lapses, and which continuity benefits are preserved." },
    { name: "long-06", text: "Give me a complete overview of the outpatient rider, what it includes, and how it differs from the base inpatient cover." },
    { name: "long-07", text: "Explain in detail how the proportional reduction works when the room rent exceeds the sub limit." },
    { name: "long-08", text: "Describe the network hospital ecosystem, how to find a hospital, and what day care procedures are available." },
    { name: "long-09", text: "Explain the complete maternity coverage rules, the waiting period, and the Family Care rider conditions." },
    { name: "long-10", text: "Summarize everything I should know as a new policyholder about coverage, claims, renewals, and savings." },
  ],
  tamil: [
    { name: "tamil-01", text: "சுகாதார காப்பீட்டுத் திட்டம் என்ன செலவுகளை உள்ளடக்குகிறது?" },
    { name: "tamil-02", text: "பணம் திரும்பக் கோரிக்கை எப்படி தாக்கல் செய்வது?" },
    { name: "tamil-03", text: "முன்பே இருந்த நோய்களுக்கான காத்திருப்பு காலம் எவ்வளவு?" },
  ],
  mixed: [
    { name: "mixed-01", text: "Cashless claim எப்படி apply செய்வது, எந்த documents தேவை?" },
  ],
};

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
        // Vendor signals synthesis end with event_type "final"
        // (send_completion_event=true also emits other lifecycle events —
        // wait for "final" specifically).
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

async function main() {
  const outRoot = resolve("tool-results/voice-bench/questions");
  const only = process.argv[2]; // optional: single class
  let generated = 0, failed = 0;
  for (const [cls, list] of Object.entries(QUESTIONS)) {
    if (only && cls !== only) continue;
    const dir = resolve(outRoot, cls);
    mkdirSync(dir, { recursive: true });
    for (const q of list) {
      const lang = cls === "tamil" ? "ta-IN" : "en-IN";
      const speaker = cls === "tamil" ? "kavya" : "aditya";
      try {
        const { pcm, sampleRate } = await ttsWav(q.text, lang, speaker);
        const wav = wavFromPcm16(pcm, sampleRate);
        writeFileSync(resolve(dir, `${q.name}.wav`), wav);
        generated++;
        console.log(`[wav] ${cls}/${q.name}.wav — ${(pcm.length / 1024).toFixed(0)}KB pcm @${sampleRate}Hz`);
        await new Promise(r => setTimeout(r, 400)); // gentle pacing
      } catch (e) {
        failed++;
        console.error(`[wav] FAIL ${cls}/${q.name}: ${e.message?.slice(0, 120)}`);
      }
    }
  }
  console.log(`\n[wav] done: ${generated} generated, ${failed} failed → ${outRoot}`);
}

main().catch(e => { console.error(e); process.exit(1); });
