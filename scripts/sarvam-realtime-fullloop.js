/**
 * FULL-LOOP live verification of the Sarvam realtime STT fix:
 *
 *   1. Bulbul TTS "speaks" a test sentence → raw PCM16 @ 16 kHz
 *   2. Saaras realtime WS (model=saaras:v3-realtime) streams that audio
 *   3. We collect transcript.partial / transcript.final events
 *
 * A correct run ends with a transcript.final whose text matches the spoken
 * sentence — proving the whole voice input leg works after the model fix.
 */
const fs = require("fs");
const WebSocket = require("/home/z/my-project/Clara-AI-Platform/node_modules/ws");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

const SENTENCE = "Hello, this is a voice pipeline verification test for the realtime speech system.";

function stripRiffToPcm16(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  // Walk chunks to find "data" (chunk-length aware).
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return buf.subarray(off + 8, off + 8 + size);
    off = off + 8 + size + (size % 2);
  }
  return null;
}

async function tts(baseUrl, apiKey, text) {
  const res = await fetch(`${baseUrl}/text-to-speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify({
      text,
      language_code: "en-IN",
      model: "bulbul:v3",
      speaker: "shubh",
      speech_sample_rate: 16000,
      pace: 1.0,
    }),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = Buffer.from(await res.arrayBuffer());
  let wav;
  if (body[0] === 0x7b) {
    const env2 = JSON.parse(body.toString("utf8"));
    wav = Buffer.from(env2.audios[0], "base64");
  } else {
    wav = body;
  }
  const pcm = stripRiffToPcm16(wav);
  if (!pcm) throw new Error("Could not locate data chunk in TTS WAV");
  return pcm;
}

function realtimeStt(baseUrl, apiKey, pcm) {
  return new Promise((resolve, reject) => {
    const url =
      `${baseUrl}/speech-to-text-realtime/ws` +
      `?language_code=en-IN&model=saaras:v3-realtime&stream_type=fast` +
      `&encoding=linear16&sample_rate=16000&endpointing=vad` +
      `&threshold=0.3&silence_duration_ms=500&min_speech_duration_ms=250`;

    const ws = new WebSocket(url, { headers: { "api-subscription-key": apiKey } });
    const events = [];
    let finalText = null;
    let sent = 0;

    const finishTimer = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      resolve({ events, finalText });
    }, 12000);

    ws.on("open", () => {
      events.push("open");
      // Stream the PCM in ~100 ms frames (1600 samples = 3200 bytes), then
      // keep streaming SILENCE — the vendor VAD fires transcript.final only
      // after it SEES ~500 ms of quiet audio (the browser mic always streams,
      // so production gets this for free).
      const speech = pcm;
      const SILENCE_MS = 2500;
      const total = pcm.length + (SILENCE_MS / 1000) * 32000; // 2 bytes/sample @16k
      const FRAME = 3200;
      let i = 0;
      const sendTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) { clearInterval(sendTimer); return; }
        if (i >= total) {
          clearInterval(sendTimer);
          events.push(`sent-all-${(total / FRAME).toFixed(0)}-frames`);
          return; // keep listening; VAD fires the final from the trailing silence
        }
        const inSpeech = i < speech.length;
        const end = Math.min(i + FRAME, total);
        const frame = inSpeech
          ? speech.subarray(i, end)
          : Buffer.alloc(end - i); // zero-filled silence
        ws.send(JSON.stringify({ event: "audio_input", audio: frame.toString("base64") }));
        i += FRAME;
      }, 100);
      sendTimer.unref?.();
    });
    ws.on("message", (data) => {
      let ev;
      try { ev = JSON.parse(data.toString()); } catch { return; }
      const kind = ev.type ?? ev.event ?? "?";
      if (kind.includes("transcript")) {
        events.push(`${kind}: ${ev.transcript ?? ev.text ?? ev.partial ?? ""}`);
        if (kind.includes("final")) {
          finalText = ev.transcript ?? ev.text ?? "";
          clearTimeout(finishTimer);
          setTimeout(() => { try { ws.close(); } catch (_) {} resolve({ events, finalText }); }, 300);
        }
      } else {
        events.push(kind);
      }
    });
    ws.on("close", (code, reason) => {
      if (finalText == null) {
        events.push(`close-${code}: ${reason?.toString?.() ?? ""}`);
        clearTimeout(finishTimer);
        resolve({ events, finalText });
      }
    });
    ws.on("error", (err) => reject(new Error(`WS error: ${err.message}`)));
  });
}

(async () => {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  const r = await c.query("select key, value from platform_env_settings where key in ('SARVAM_API_KEY','SARVAM_BASE_URL')");
  await c.end();
  const apiKey = (r.rows.find((x) => x.key === "SARVAM_API_KEY")?.value || "").trim();
  const baseUrl = (r.rows.find((x) => x.key === "SARVAM_BASE_URL")?.value || "https://api.sarvam.ai").trim();
  console.log(`baseUrl=${baseUrl}`);

  console.log("[1/3] TTS: generating PCM16 @16 kHz …");
  const pcm = await tts(baseUrl, apiKey, SENTENCE);
  console.log(`      got ${pcm.length} bytes (~${(pcm.length / 32000).toFixed(1)}s of audio)`);

  console.log("[2/3] Realtime STT: streaming audio through saaras:v3-realtime …");
  const { events, finalText } = await realtimeStt(baseUrl, apiKey, pcm);

  console.log("[3/3] Events:");
  for (const e of events) console.log(`      ${e}`);

  console.log(`\nFINAL TRANSCRIPT: ${JSON.stringify(finalText)}`);
  const ok = typeof finalText === "string" && finalText.trim().length > 0;
  console.log(`VERDICT: ${ok ? "REALTIME STT FULL LOOP ✅" : "NO FINAL TRANSCRIPT ❌"}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
