/**
 * scripts/bench-prod-run.mjs — production-portal realtime voice benchmark.
 *
 * Drives a real headless Chromium against the PRODUCTION embed voice surface
 * (https://clara.ai.amazetechclans.com/embed/voice?key=clr_…) with the
 * 5-question session WAV (scripts/bench-prod-wavs.mjs) mixed into the fake
 * microphone, then measures per-turn reply latency:
 *
 *  • REALTIME transports (Sarvam realtime relay, OpenAI Realtime, Gemini
 *    Live, ElevenLabs clara-stream) — the hooks emit `clara:voice:latency`
 *    events with the full stage chain; TTFA = browser.first_audio −
 *    stt.final (speech end → first audio heard), exactly the plan §11
 *    definition.
 *
 *  • MODE A batch pipelines ( ElevenLabs / Sarvam with the realtime flag
 *    off) — no telemetry events exist on that path, so per-utterance network
 *    timings are captured instead: transcribe request (fires at utterance
 *    close ≈ speech end), chat request/response, TTS request/response.
 *    TTFA_modeA = first TTS response completion − transcribe request start,
 *    clearly labelled as a network-level proxy in the output JSON.
 *
 * Usage:
 *   node scripts/bench-prod-run.mjs --provider=sarvam \
 *     --url="https://clara.ai.amazetechclans.com/embed/voice?key=clr_…" \
 *     [--wav=tool-results/voice-bench/prod/questions-session.wav] \
 *     [--run-ms=120000] [--out=tool-results/voice-bench/prod/sarvam.json]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(Math.max(Math.ceil((p / 100) * sorted.length), 1), sorted.length);
  return sorted[rank - 1];
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const provider = arg("provider", "sarvam");
const url = arg("url", null);
const wavFile = arg("wav", "tool-results/voice-bench/prod/questions-session.wav");
const runMs = Number(arg("run-ms", "120000"));
const outPath = arg("out", `tool-results/voice-bench/prod/${provider}.json`);
if (!url) { console.error("usage: --url=<embed-voice-url-with-key> required"); process.exit(1); }

async function main() {
  const launchArgs = [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    `--use-file-for-fake-audio-capture=${resolve(wavFile)}`,
  ];
  const browser = await chromium.launch({ args: launchArgs });
  const page = await browser.newPage();

  // ── 1. Realtime telemetry events (hooks emit these on realtime paths) ──
  const telemetryTurns = [];
  await page.exposeFunction("__claraBenchPush", (event) => {
    telemetryTurns.push(event);
    console.log(
      `[bench] turn provider=${event.provider} ttfa=${event.latencies?.ttfaMs ?? "n/a"}ms ` +
        `stt=${event.latencies?.sttMs ?? "n/a"} rag=${event.latencies?.ragMs ?? "n/a"} ` +
        `llm=${event.latencies?.llmMs ?? "n/a"} tts=${event.latencies?.ttsMs ?? "n/a"}`,
    );
  });
  await page.addInitScript(() => {
    window.addEventListener("clara:voice:latency", (event) => {
      const d = event.detail;
      window.__claraBenchPush({
        sessionId: d.sessionId,
        generationId: d.generationId,
        turnId: d.turnId,
        provider: d.provider,
        model: d.model,
        marks: d.marks,
        latencies: d.latencies,
      });
    });
  });

  // ── 2. Mode A pipeline network event log (post-processed) ───────────────
  const netEvents = [];
  const now = () => Date.now();
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/transcribe") || u.includes("/api/embed/chat") || u.includes("/tts")) {
      netEvents.push({ kind: "req", url: u, t: now() });
    }
  });
  page.on("response", (resp) => {
    const u = resp.url();
    if (u.includes("/api/embed/chat")) {
      netEvents.push({ kind: "chat-headers", url: u, t: now(), status: resp.status() });
    }
  });
  page.on("requestfinished", (req) => {
    const u = req.url();
    if (u.includes("/transcribe") || u.includes("/api/embed/chat") || u.includes("/tts")) {
      netEvents.push({ kind: "fin", url: u, t: now() });
    }
  });

  // ── 2b. Realtime WS frame timing (works on the DEPLOYED code too) ──────
  // STT relay WS: the final-transcript frame marks speech-end→stt.final.
  // TTS relay WS: the first binary frame is the first audio byte to the
  // browser. TTFA_ws = first TTS frame − last STT final frame (per turn).
  let sttFinalAt = null;
  page.on("websocket", (ws) => {
    const u = ws.url();
    if (u.includes("/api/voice/sarvam/realtime") || u.includes("/api/voice/elevenlabs/realtime")) {
      ws.on("framereceived", (frame) => {
        const fp = typeof frame.payload === "string" ? frame.payload : frame.payload?.toString?.("utf8") ?? "";
        if (fp.includes("final")) {
          sttFinalAt = now();
          netEvents.push({ kind: "stt-final", url: u, t: sttFinalAt });
          console.log(`[bench] STT final frame t=${sttFinalAt}`);
        }
      });
    }
    if (u.includes("/tts-realtime") || u.includes("/api/voice/elevenlabs/realtime-tts")) {
      ws.on("framereceived", (frame) => {
        const len = typeof frame.payload === "string" ? frame.payload.length : frame.payload?.length ?? 0;
        if (len > 1000) {
          netEvents.push({ kind: "tts-audio", url: u, t: now() });
        }
      });
    }
  });

  console.log(`[bench] opening ${url.split("?")[0]}?key=…`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

  const connectButton = page.locator("button:has-text('Connect'), button:has-text('Start'), button[aria-label*='connect' i]").first();
  try {
    await connectButton.waitFor({ state: "visible", timeout: 15_000 });
    await connectButton.click();
    console.log("[bench] voice session connect clicked");
  } catch {
    console.log("[bench] NOTE | no connect button found — assuming auto-connecting surface");
  }

  console.log(`[bench] collecting for ${runMs / 1000}s…`);
  await page.waitForTimeout(runMs);

  // ── 3. Aggregate ─────────────────────────────────────────────────────────
  const ttfa = telemetryTurns.map((t) => t.latencies?.ttfaMs).filter((v) => typeof v === "number");
  const stages = {};
  for (const stage of ["sttMs", "ragMs", "llmMs", "ttsMs", "playbackMs"]) {
    stages[stage] = telemetryTurns.map((t) => t.latencies?.[stage]).filter((v) => typeof v === "number");
  }

  // ── Post-process the event log into per-turn records ────────────────────
  // A turn STARTS at a speech-end marker: an stt-final WS frame (realtime
  // transports) or a /transcribe request (Mode A batch). Everything until the
  // next speech-end marker belongs to that turn.
  const networkTurns = [];
  let turn = null;
  for (const ev of netEvents) {
    const isSpeechEnd =
      ev.kind === "stt-final" ||
      (ev.kind === "req" && ev.url.includes("/transcribe"));
    if (isSpeechEnd) {
      turn = { speechEndAt: ev.t, transport: ev.kind === "stt-final" ? "realtime-ws" : "mode-a-batch" };
      networkTurns.push(turn);
      if (ev.kind === "req") turn.sttReqAt = ev.t;
      continue;
    }
    if (!turn) continue; // greeting traffic before the first question
    if (ev.kind === "fin" && ev.url.includes("/transcribe")) turn.sttEndAt = ev.t;
    if (ev.kind === "req" && ev.url.includes("/api/embed/chat")) turn.chatReqAt = ev.t;
    if (ev.kind === "chat-headers") turn.chatHeadersAt = ev.t;
    if (ev.kind === "fin" && ev.url.includes("/api/embed/chat")) turn.chatEndAt = ev.t;
    if (ev.kind === "req" && ev.url.includes("/tts") && !ev.url.includes("tts-realtime")) {
      turn.ttsReqs = (turn.ttsReqs ?? 0) + 1;
      if (!turn.ttsFirstReqAt) turn.ttsFirstReqAt = ev.t;
    }
    if (ev.kind === "fin" && ev.url.includes("/tts") && !ev.url.includes("tts-realtime")) {
      if (!turn.ttsFirstEndAt) turn.ttsFirstEndAt = ev.t;
    }
    if (ev.kind === "tts-audio" && !turn.firstAudioAt) {
      turn.firstAudioAt = ev.t;
      turn.ttfaWsMs = turn.speechEndAt ? ev.t - turn.speechEndAt : null;
      console.log(`[bench] first audio for turn (ttfa≈${turn.ttfaWsMs}ms, ${turn.transport})`);
    }
  }
  for (const t of networkTurns) {
    t.sttMs = t.sttEndAt && t.sttReqAt ? t.sttEndAt - t.sttReqAt : null;
    t.chatFullMs = t.chatEndAt && t.chatReqAt ? t.chatEndAt - t.chatReqAt : null;
    t.chatFirstMs = t.chatHeadersAt && t.chatReqAt ? t.chatHeadersAt - t.chatReqAt : null;
    t.ttsFirstMs = t.ttsFirstEndAt && t.ttsFirstReqAt ? t.ttsFirstEndAt - t.ttsFirstReqAt : null;
    t.ttfaNetworkMs = t.ttfaWsMs ?? (t.ttsFirstEndAt && t.speechEndAt ? t.ttsFirstEndAt - t.speechEndAt : null);
  }
  const modeATtfa = networkTurns.map((t) => t.ttfaNetworkMs).filter((v) => typeof v === "number");

  const summary = {
    capturedAt: new Date().toISOString(),
    provider,
    url: url.split("?")[0],
    measurement: telemetryTurns.length > 0
      ? "realtime telemetry: TTFA = browser.first_audio − stt.final"
      : networkTurns.length > 0
        ? "mode-A network proxy: TTFA = first TTS response completion − transcribe request start (speech end)"
        : "none captured",
    turns: telemetryTurns.length || networkTurns.length,
    // Prefer the hook telemetry TTFA; fall back to the WS/network-level
    // measurement when the deployed build predates the telemetry fixes.
    ttfa: ttfa.length > 0
      ? { source: "telemetry", p50: percentile(ttfa, 50), p95: percentile(ttfa, 95) }
      : { source: "ws-network", p50: percentile(modeATtfa, 50), p95: percentile(modeATtfa, 95) },
    stages: Object.fromEntries(
      Object.entries(stages).map(([stage, values]) => [
        stage,
        { p50: percentile(values, 50), p95: percentile(values, 95) },
      ]),
    ),
    modeATurns: networkTurns,
    raw: telemetryTurns,
  };

  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), JSON.stringify(summary, null, 2));
  console.log(`[bench] wrote ${outPath}`);
  console.log(`[bench] turns: ${summary.turns} (telemetry ${telemetryTurns.length}, network ${networkTurns.length})`);
  console.log(`[bench] TTFA p50/p95: ${summary.ttfa.p50} / ${summary.ttfa.p95} ms`);

  await browser.close();
}

main().catch((err) => {
  console.error("[bench] failed:", err.message);
  process.exit(1);
});
