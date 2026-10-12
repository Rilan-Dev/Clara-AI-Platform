/**
 * Adaptive five-turn realtime voice benchmark.
 *
 * Plays actual WAV files into the browser's microphone MediaStream, waits for
 * each response telemetry barrier before the next question, and records browser
 * request counts/timings plus Clara's provider-neutral latency events.
 *
 * Requires the app's provider selection to be configured before the run.
 * The --provider value is only a label; it is checked against observed telemetry.
 *
 * Usage:
 * node scripts/voice-benchmark/conversation.mjs \
 *   --url="https://.../embed/voice?key=..." --provider=openai \
 *   --input-1=questions/turn-01.wav --input-2=questions/turn-02.wav \
 *   --input-3=questions/turn-03.wav --input-4=questions/turn-04.wav \
 *   --input-5=questions/turn-05.wav --out=tool-results/openai-conversation.json
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const EXPECTED_INPUTS = [1, 2, 3, 4, 5];
const nowIso = () => new Date().toISOString();
const safePath = (url) => {
  try {
    const u = new URL(url);
    return u.origin + u.pathname; // Strip query values, including embed keys.
  } catch {
    return String(url).split("?")[0];
  }
};
const safeDiagnosticText = (value) => String(value ?? "")
  .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
  .replace(/\b(?:clr|sk|AIza|eyJ)[A-Za-z0-9_.-]{12,}\b/g, "[REDACTED_TOKEN]")
  .replace(/https?:\/\/[^\s"'<>]+/g, (url) => safePath(url))
  .slice(0, 1000);
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)];
};
function argsFrom(argv) {
  const args = { url: "", provider: "", out: "tool-results/voice-conversation.json", inputs: {}, turnTimeoutMs: 90000, welcomeTimeoutMs: 45000, welcomeDrainMs: 2000, drainMs: 1800 };
  for (const arg of argv.slice(2)) {
    const raw = arg.replace(/^--/, "");
    const i = raw.indexOf("=");
    const key = i < 0 ? raw : raw.slice(0, i);
    const value = i < 0 ? "" : raw.slice(i + 1);
    if (key.startsWith("input-")) args.inputs[Number(key.slice(6))] = value;
    else if (key === "url" || key === "provider" || key === "out") args[key] = value;
    else if (key === "turn-timeout-ms") args.turnTimeoutMs = Number(value);
    else if (key === "welcome-timeout-ms") args.welcomeTimeoutMs = Number(value);
    else if (key === "welcome-drain-ms") args.welcomeDrainMs = Number(value);
    else if (key === "drain-ms") args.drainMs = Number(value);
  }
  if (!args.url || !args.provider || EXPECTED_INPUTS.some((n) => !args.inputs[n])) {
    throw new Error("Required: --url, --provider, and --input-1 through --input-5. See scripts/voice-benchmark/README.md.");
  }
  return args;
}
const waitFor = async (fn, timeoutMs, description) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for " + description + " after " + timeoutMs + "ms");
};

async function main() {
  const args = argsFrom(process.argv);
  for (const n of EXPECTED_INPUTS) {
    const path = resolve(args.inputs[n]);
    const fileBytes = readFileSync(path);
    const bytes = path.endsWith(".gz") ? gunzipSync(fileBytes) : fileBytes;
    const isWav = bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
    const isMp3 = path.toLowerCase().endsWith(".mp3") &&
      (bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
    if (!isWav && !isMp3) {
      throw new Error(`Input ${n} must be a WAV, MP3, or gzip-compressed WAV file: ${path}`);
    }
    args.inputs[n] = { path, base64: bytes.toString("base64"), bytes: bytes.length, compressedBytes: fileBytes.length, format: isMp3 ? "mp3" : "wav" };
  }

  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  const requests = new Map();
  const failures = [];
  const responseRecords = [];
  const pendingResponseFinishes = [];
  const consoleErrors = [];
  const clientEvents = [];
  const connectClick = { wallTime: null, monotonicMs: null };
  const turnResults = [];
  let welcomeEvent = null;
  let benchmarkError = null;
  let sequence = 0;

  page.on("request", (request) => {
    const key = ++sequence;
    requests.set(request, { id: key, method: request.method(), url: safePath(request.url()), resourceType: request.resourceType(), startedAt: Date.now(), startedIso: nowIso() });
  });
  page.on("requestfailed", (request) => {
    const r = requests.get(request);
    failures.push({ ...(r ?? {}), failure: safeDiagnosticText(request.failure()?.errorText ?? "unknown") });
  });
  page.on("response", async (response) => {
    const request = response.request();
    const r = requests.get(request);
    if (!r) return;
    const doneAt = Date.now();
    const record = { ...r, status: response.status(), responseHeadersAt: doneAt, responseHeadersMs: doneAt - r.startedAt, responseFinishedAt: null, responseTotalMs: null, responseBodyError: null };
    responseRecords.push(record);
    pendingResponseFinishes.push(response.finished().then((error) => {
      record.responseFinishedAt = Date.now();
      record.responseTotalMs = record.responseFinishedAt - r.startedAt;
      record.responseBodyError = error ? safeDiagnosticText(error).slice(0, 300) : null;
    }).catch((error) => {
      record.responseFinishedAt = Date.now();
      record.responseTotalMs = record.responseFinishedAt - r.startedAt;
      record.responseBodyError = safeDiagnosticText(error).slice(0, 300);
    }));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ at: nowIso(), text: safeDiagnosticText(msg.text()) });
  });

  // Inject a controllable, silent microphone track. Each supplied WAV is played
  // into this track on demand; the real app still uses its real session/STT/RAG/
  // model/TTS paths. No text is posted directly to a RAG endpoint.
  await page.addInitScript(() => {
    const state = { events: [], dataChannelEvents: [], playedInputs: [], audioContext: null, destination: null, microphoneTrack: null, peerConnection: null, dataChannel: null, clickAt: null };
    const recordDataChannelEvent = (channel, direction, type, detail = null) => {
      state.dataChannelEvents.push({
        at: Date.now(),
        channelLabel: String(channel?.label ?? "").slice(0, 80),
        channelState: channel?.readyState ?? null,
        direction,
        type: String(type ?? "unknown").slice(0, 100),
        ...(detail ? { detail } : {}),
      });
      if (state.dataChannelEvents.length > 500) state.dataChannelEvents.shift();
    };
    // Keep diagnostics useful without recording user transcripts, audio, tokens,
    // or arbitrary provider payloads. Only protocol identifiers and error metadata
    // are retained for selected inbound events.
    const safeEventDetail = (message) => {
      const detail = {};
      for (const key of ["event_id", "item_id", "previous_item_id", "call_id", "code", "param"]) {
        if (typeof message?.[key] === "string") detail[key] = String(message[key]).slice(0, 160);
      }
      if (message?.error && typeof message.error === "object") {
        const error = message.error;
        const safeError = {};
        for (const key of ["type", "code", "param", "message"]) {
          if (typeof error[key] === "string") {
            safeError[key] = String(error[key])
              .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
              .replace(/\b(?:clr|sk|AIza|eyJ)[A-Za-z0-9_.-]{12,}\b/g, "[REDACTED_TOKEN]")
              .replace(/https?:\/\/[^\s"'<>]+/g, "[URL]")
              .slice(0, 300);
          }
        }
        if (Object.keys(safeError).length) detail.error = safeError;
      }
      if (message?.response && typeof message.response === "object") {
        const response = message.response;
        if (typeof response.status === "string") detail.responseStatus = response.status.slice(0, 80);
        if (typeof response.status_details?.reason === "string") detail.responseReason = response.status_details.reason
          .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
          .replace(/\b(?:clr|sk|AIza|eyJ)[A-Za-z0-9_.-]{12,}\b/g, "[REDACTED_TOKEN]")
          .replace(/https?:\/\/[^\s"'<>]+/g, "[URL]")
          .slice(0, 120);
      }
      for (const key of ["audio_start_ms", "audio_end_ms"]) {
        if (typeof message?.[key] === "number") detail[key] = message[key];
      }
      // Keep transcription diagnostics useful without storing transcript text.
      if (typeof message?.delta === "string") detail.deltaLength = message.delta.length;
      if (typeof message?.transcript === "string") detail.transcriptLength = message.transcript.length;
      // Record only non-secret effective input configuration returned by the service.
      if (message?.type === "session.updated" && message?.session && typeof message.session === "object") {
        const session = message.session;
        const input = session.audio?.input ?? {};
        const turn = input.turn_detection ?? session.turn_detection ?? {};
        const transcription = input.transcription ?? session.input_audio_transcription ?? {};
        detail.effectiveInputConfig = {
          turnDetectionType: typeof turn.type === "string" ? turn.type : null,
          threshold: typeof turn.threshold === "number" ? turn.threshold : null,
          prefixPaddingMs: typeof turn.prefix_padding_ms === "number" ? turn.prefix_padding_ms : null,
          silenceDurationMs: typeof turn.silence_duration_ms === "number" ? turn.silence_duration_ms : null,
          createResponse: typeof turn.create_response === "boolean" ? turn.create_response : null,
          transcriptionModel: typeof transcription.model === "string" ? transcription.model : null,
          transcriptionLanguage: typeof transcription.language === "string" ? transcription.language : null,
        };
      }
      return Object.keys(detail).length ? detail : null;
    };
    const observeDataChannel = (channel) => {
      if (!channel || channel.__claraBenchObserved) return channel;
      try { Object.defineProperty(channel, "__claraBenchObserved", { value: true }); } catch {}
      state.dataChannel = channel;
      recordDataChannelEvent(channel, "channel", "created");
      channel.addEventListener("open", () => recordDataChannelEvent(channel, "channel", "open"));
      channel.addEventListener("close", () => recordDataChannelEvent(channel, "channel", "close"));
      channel.addEventListener("error", () => recordDataChannelEvent(channel, "channel", "error"));
      channel.addEventListener("message", (event) => {
        let type = "non-json-message";
        let detail = null;
        try {
          const parsed = JSON.parse(String(event.data));
          type = typeof parsed?.type === "string" ? parsed.type : "json-without-type";
          if (type === "error" || type === "session.updated" ||
              type === "input_audio_buffer.speech_started" ||
              type === "input_audio_buffer.speech_stopped" ||
              type === "input_audio_buffer.committed" ||
              type === "input_audio_buffer.timeout_triggered" ||
              type === "input_audio_buffer.cleared" ||
              type === "conversation.item.input_audio_transcription.delta" ||
              type === "conversation.item.input_audio_transcription.completed" ||
              type === "conversation.item.input_audio_transcription.failed" ||
              type === "response.done") {
            detail = safeEventDetail(parsed);
          }
        } catch {}
        recordDataChannelEvent(channel, "inbound", type, detail);
      });
      const originalSend = channel.send.bind(channel);
      channel.send = (data) => {
        let type = "non-json-message";
        try {
          const parsed = JSON.parse(String(data));
          type = typeof parsed?.type === "string" ? parsed.type : "json-without-type";
        } catch {}
        recordDataChannelEvent(channel, "outbound", type);
        return originalSend(data);
      };
      return channel;
    };
    try {
      const originalCreateDataChannel = RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel = function(...args) {
        state.peerConnection = this;
        return observeDataChannel(originalCreateDataChannel.apply(this, args));
      };
    } catch {}
    window.__claraVoiceBench = state;
    window.addEventListener("clara:voice:latency", (event) => {
      const d = event.detail || {};
      state.events.push({
        receivedAt: Date.now(),
        sessionId: d.sessionId ?? null,
        generationId: d.generationId ?? null,
        turnId: d.turnId ?? null,
        provider: d.provider ?? null,
        model: d.model ?? null,
        marks: d.marks ?? {},
        latencies: d.latencies ?? {},
      });
    });
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.audio) return original(constraints);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const destination = ctx.createMediaStreamDestination();
      // Keep the synthetic microphone clock running between injected clips.
      // Without a continuously-rendered silent source, the destination track
      // can stop producing RTP after BufferSource.onended, so server VAD never
      // observes the trailing silence needed to emit speech_stopped/commit.
      const silenceKeepAlive = ctx.createOscillator();
      const silenceGain = ctx.createGain();
      silenceGain.gain.value = 0;
      silenceKeepAlive.connect(silenceGain);
      silenceGain.connect(destination);
      silenceKeepAlive.start();
      state.audioContext = ctx;
      state.destination = destination;
      const track = destination.stream.getAudioTracks()[0] ?? null;
      state.microphoneTrack = track;
      if (track) {
        track.addEventListener("mute", () => state.dataChannelEvents.push({ at: Date.now(), direction: "microphone", type: "track-muted" }));
        track.addEventListener("unmute", () => state.dataChannelEvents.push({ at: Date.now(), direction: "microphone", type: "track-unmuted" }));
        track.addEventListener("ended", () => state.dataChannelEvents.push({ at: Date.now(), direction: "microphone", type: "track-ended" }));
      }
      return new MediaStream(track ? [track] : []);
    };
    window.__claraVoiceBenchPlay = async (base64) => {
      if (!state.audioContext || !state.destination) throw new Error("Microphone audio track has not been initialized; connect first.");
      await state.audioContext.resume();
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audio = await state.audioContext.decodeAudioData(bytes.buffer);
      const source = state.audioContext.createBufferSource();
      source.buffer = audio;
      const playbackStartedAt = Date.now();
      const readAudioRtpStats = async () => {
        try {
          const report = await state.peerConnection?.getStats();
          if (!report) return null;
          const rows = [];
          report.forEach((stat) => {
            if (
              (stat.type === "outbound-rtp" && stat.kind === "audio") ||
              (stat.type === "remote-inbound-rtp" && stat.kind === "audio") ||
              (stat.type === "media-source" && stat.kind === "audio")
            ) {
              rows.push({
                type: stat.type,
                kind: stat.kind ?? null,
                packetsSent: typeof stat.packetsSent === "number" ? stat.packetsSent : null,
                bytesSent: typeof stat.bytesSent === "number" ? stat.bytesSent : null,
                packetsReceived: typeof stat.packetsReceived === "number" ? stat.packetsReceived : null,
                bytesReceived: typeof stat.bytesReceived === "number" ? stat.bytesReceived : null,
                audioLevel: typeof stat.audioLevel === "number" ? stat.audioLevel : null,
                totalAudioEnergy: typeof stat.totalAudioEnergy === "number" ? stat.totalAudioEnergy : null,
                totalSamplesDuration: typeof stat.totalSamplesDuration === "number" ? stat.totalSamplesDuration : null,
              });
            }
          });
          return rows;
        } catch {
          return null;
        }
      };
      const rtpBefore = await readAudioRtpStats();
      source.connect(state.destination);
      const ended = new Promise((resolve) => { source.onended = resolve; });
      source.start();
      await ended;
      let sumSquares = 0;
      let sampleCount = 0;
      let peak = 0;
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const samples = audio.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) {
          const sample = samples[i];
          sumSquares += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
          sampleCount++;
        }
      }
      const rtpAfter = await readAudioRtpStats();
      const result = {
        durationMs: audio.duration * 1000,
        sampleRate: audio.sampleRate,
        rtpBefore,
        rtpAfter,
        channels: audio.numberOfChannels,
        rms: sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0,
        peak,
        microphoneTrackState: state.microphoneTrack ? {
          readyState: state.microphoneTrack.readyState,
          enabled: state.microphoneTrack.enabled,
          muted: state.microphoneTrack.muted,
          settings: state.microphoneTrack.getSettings(),
        } : null,
        audioContextState: state.audioContext.state,
      };
      state.playedInputs.push({ playbackStartedAt, playbackCompletedAt: Date.now(), ...result });
      return result;
    };
    window.__claraVoiceBenchMarkConnect = () => {
      state.clickAt = { wallTime: Date.now(), monotonicMs: performance.now() };
    };
  });

  const startedAt = nowIso();
  try {
    console.log("[conversation-bench] opening", safePath(args.url));
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const connect = page.locator("button:has-text('Connect'), button:has-text('Start'), button[aria-label*='connect' i]").first();
    await connect.waitFor({ state: "visible", timeout: 20000 });
    await page.evaluate(() => window.__claraVoiceBenchMarkConnect());
    connectClick.wallTime = Date.now();
    connectClick.monotonicMs = await page.evaluate(() => performance.now());
    await connect.click();

    // The greeting may not emit a telemetry event on every provider yet. A
    // missing greeting event is a failed/missing metric, not a fabricated zero.
    welcomeEvent = await waitFor(async () => {
      const events = await page.evaluate(() => window.__claraVoiceBench?.events ?? []);
      const candidates = events.filter((e) => typeof e.marks?.["browser.first_audio"] === "number");
      return candidates[0] ?? null;
    }, args.welcomeTimeoutMs, "first audible welcome/assistant audio telemetry");

    const clickWallTime = await page.evaluate(() => window.__claraVoiceBench?.clickAt?.wallTime ?? null);
    const welcomeFirstAudioMark = welcomeEvent.marks["browser.first_audio"];
    // Both values use epoch milliseconds because current shared stage marks use Date.now().
    const welcomeMsFromClick = typeof clickWallTime === "number" && typeof welcomeFirstAudioMark === "number"
      ? welcomeFirstAudioMark - clickWallTime
      : null;

    console.log(`[conversation-bench] welcome first-audio mark=${welcomeFirstAudioMark ?? "missing"} click-to-first-audio=${welcomeMsFromClick ?? "unavailable"}ms`);

    // response.done / turn.complete means generation finished, not that the
    // remote audio track has finished playing. The trace showed the first test
    // input beginning ~118 ms after the welcome response.done, followed by
    // output_audio_buffer.cleared and conversation.item.truncated. Add a
    // deliberate welcome drain before touching the microphone track. This is
    // a conservative quiet period, not a claim of direct audible-playback proof.
    console.log(`[conversation-bench] draining welcome audio for ${args.welcomeDrainMs}ms before first input`);
    await page.waitForTimeout(Math.max(0, args.welcomeDrainMs));

    for (const n of EXPECTED_INPUTS) {
      const before = await page.evaluate(() => (window.__claraVoiceBench?.events ?? []).length);
      const turnStartedAt = Date.now();
      console.log(`[conversation-bench] playing input ${n}/5: ${args.inputs[n].path}`);
      const audio = await page.evaluate((b64) => window.__claraVoiceBenchPlay(b64), args.inputs[n].base64);
      const event = await waitFor(async () => {
        const events = await page.evaluate(() => window.__claraVoiceBench?.events ?? []);
        const candidates = events.slice(before).filter((e) =>
          typeof e.marks?.["stt.final"] === "number" &&
          typeof e.marks?.["turn.complete"] === "number"
        );
        return candidates.at(-1) ?? null;
      }, args.turnTimeoutMs, `completed assistant response for input ${n}`);
      // The latency event marks generation completion; it is not a reliable
      // signal that all remote audio has drained. Keep a conservative quiet
      // period before the next input to avoid truncating short spoken answers.
      await page.waitForTimeout(Math.max(0, args.drainMs));

      const providerMatch = String(event.provider ?? "").toLowerCase() === args.provider.toLowerCase();
      const result = {
        input: n,
        inputFile: args.inputs[n].path,
        inputAudio: audio,
        wallDurationMs: Date.now() - turnStartedAt,
        provider: event.provider,
        model: event.model,
        providerMatch,
        sessionId: event.sessionId,
        generationId: event.generationId,
        turnId: event.turnId,
        marks: event.marks,
        latencies: event.latencies,
        telemetryBarrierReached: true,
        responseIntegrityStatus: "not-verified-no-safe-final-text-or-finish-reason-in-common-event",
        tokenUsage: null,
        tokenUsageStatus: "not-exposed-by-current-common-latency-event",
      };
      turnResults.push(result);
      console.log(`[conversation-bench] turn=${n} provider=${result.provider} model=${result.model} wall=${result.wallDurationMs}ms stt=${result.latencies?.sttMs ?? "n/a"} rag=${result.latencies?.ragMs ?? "n/a"} llm-first=${result.latencies?.llmMs ?? "n/a"} tts-first=${result.latencies?.ttsMs ?? "n/a"} ttfa=${result.latencies?.ttfaMs ?? "n/a"}ms`);
      if (!providerMatch) throw new Error(`Expected provider '${args.provider}' but telemetry reported '${event.provider}'. Stop: this is not a valid provider comparison.`);
    }

    // Some browser responses are intentionally long-lived (for example, event streams)
    // and response.finished() may never settle before the page closes. Never let those
    // requests keep a completed five-turn benchmark alive indefinitely. Give ordinary
    // response bodies a short flush window, then serialize unfinished timings as null.
    const responseFlushTimeoutMs = 2000;
    let responseFlushTimedOut = false;
    await Promise.race([
      Promise.allSettled(pendingResponseFinishes),
      new Promise((resolve) => setTimeout(() => {
        responseFlushTimedOut = true;
        resolve();
      }, responseFlushTimeoutMs)),
    ]);
    if (responseFlushTimedOut) {
      console.log(`[conversation-bench] response-body flush window elapsed after ${responseFlushTimeoutMs}ms; continuing with any still-pending response timings unset`);
    }

    // Collect timing/counts for requests that occurred while the page was live.
    const resourceTimings = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => ({
      name: (() => { try { const u = new URL(e.name); return u.origin + u.pathname; } catch { return e.name.split("?")[0]; } })(),
      initiatorType: e.initiatorType,
      durationMs: e.duration,
      requestStartMs: e.requestStart,
      responseStartMs: e.responseStart,
      responseEndMs: e.responseEnd,
      transferSize: e.transferSize || null,
      encodedBodySize: e.encodedBodySize || null,
    })));
    const requestCounts = {};
    for (const r of responseRecords) {
      const key = `${r.method} ${r.url} ${r.status}`;
      requestCounts[key] = (requestCounts[key] ?? 0) + 1;
    }
    const metrics = {
      sessionClickToWelcomeAudioMs: welcomeMsFromClick,
      turnWallMs: turnResults.map((t) => t.wallDurationMs),
      ttfaMs: turnResults.map((t) => t.latencies?.ttfaMs).filter((v) => typeof v === "number"),
    };
    const output = {
      schemaVersion: 2,
      runStatus: "completed",
      benchmarkError: null,
      startedAt,
      finishedAt: nowIso(),
      target: safePath(args.url),
      expectedProvider: args.provider,
      browser: "Playwright Chromium",
      inputFiles: Object.fromEntries(EXPECTED_INPUTS.map((n) => [n, { path: args.inputs[n].path, bytes: args.inputs[n].bytes }])),
      session: { connectClick: connectClick.wallTime, welcomeEvent: { provider: welcomeEvent.provider, model: welcomeEvent.model, marks: welcomeEvent.marks }, sessionClickToWelcomeAudioMs: welcomeMsFromClick, metricMeaning: "first browser.first_audio telemetry mark; not independent confirmation of audible playback" },
      turns: turnResults,
      requestCounts,
      requestTimings: responseRecords,
      resourceTimings,
      failures,
      consoleErrors,
      summary: {
        telemetryBarrierTurns: turnResults.filter((t) => t.telemetryBarrierReached).length,
        responseIntegrityVerifiedTurns: turnResults.filter((t) => t.responseIntegrityStatus === "verified").length,
        requiredTurns: 5,
        providerMatches: turnResults.every((t) => t.providerMatch),
        sessionClickToWelcomeAudioMs: welcomeMsFromClick,
        ttfaMs: { p50: percentile(metrics.ttfaMs, 50), p95: percentile(metrics.ttfaMs, 95) },
        turnWallMs: { p50: percentile(metrics.turnWallMs, 50), p95: percentile(metrics.turnWallMs, 95) },
        browserRequests: responseRecords.length,
        failedRequests: failures.length,
        note: "Browser timings exclude server-internal DB/provider/Qdrant/MCP calls. A telemetry barrier is not proof of a complete, non-truncated answer. Token usage, final-answer integrity and actual audible playback are not verified by this harness version.",
      },
    };
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(output, null, 2));
    console.log("[conversation-bench] wrote", out);
    if (turnResults.length !== 5 || !turnResults.every((t) => t.telemetryBarrierReached && t.providerMatch)) process.exitCode = 2;
  } catch (error) {
    benchmarkError = safeDiagnosticText(error?.stack || error);
    // Persist diagnostics even when a provider never emits welcome/turn telemetry.
    // This prevents the most useful failure evidence from being lost on timeout.
    try {
      const events = await page.evaluate(() => window.__claraVoiceBench?.events ?? []);
      const dataChannelEvents = await page.evaluate(() => window.__claraVoiceBench?.dataChannelEvents ?? []);
      const out = resolve(args.out);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({
        schemaVersion: 2,
        runStatus: "failed",
        benchmarkError,
        startedAt,
        finishedAt: nowIso(),
        target: safePath(args.url),
        expectedProvider: args.provider,
        browser: "Playwright Chromium",
        inputFiles: Object.fromEntries(EXPECTED_INPUTS.map((n) => [n, { path: args.inputs[n].path, bytes: args.inputs[n].bytes }])),
        session: { connectClick: connectClick.wallTime, welcomeEvent: welcomeEvent ? { provider: welcomeEvent.provider, model: welcomeEvent.model, marks: welcomeEvent.marks } : null },
        playedInputs: await page.evaluate(() => window.__claraVoiceBench?.playedInputs ?? []),
        drainSettings: { welcomeDrainMs: args.welcomeDrainMs, interTurnDrainMs: args.drainMs },
        turns: turnResults,
        observedLatencyEvents: events.map((e) => ({ provider: e.provider, model: e.model, sessionId: e.sessionId, generationId: e.generationId, turnId: e.turnId, marks: e.marks, latencies: e.latencies })),
        dataChannelEvents,
        microphoneDiagnostics: await page.evaluate(async () => {
          const state = window.__claraVoiceBench;
          const pc = state?.peerConnection;
          const dc = pc?.getDataChannels?.()?.[0] ?? null;
          return {
            audioContextState: state?.audioContext?.state ?? null,
            track: state?.microphoneTrack ? {
              readyState: state.microphoneTrack.readyState,
              enabled: state.microphoneTrack.enabled,
              muted: state.microphoneTrack.muted,
              settings: state.microphoneTrack.getSettings(),
            } : null,
            peerConnection: pc ? {
              connectionState: pc.connectionState,
              iceConnectionState: pc.iceConnectionState,
              iceGatheringState: pc.iceGatheringState,
              signalingState: pc.signalingState,
              audioRtpStats: await (async () => {
                try {
                  const report = await pc.getStats();
                  const rows = [];
                  report.forEach((stat) => {
                    if (
                      (stat.type === "outbound-rtp" && stat.kind === "audio") ||
                      (stat.type === "remote-inbound-rtp" && stat.kind === "audio") ||
                      (stat.type === "media-source" && stat.kind === "audio")
                    ) {
                      rows.push({
                        type: stat.type,
                        kind: stat.kind ?? null,
                        packetsSent: typeof stat.packetsSent === "number" ? stat.packetsSent : null,
                        bytesSent: typeof stat.bytesSent === "number" ? stat.bytesSent : null,
                        packetsReceived: typeof stat.packetsReceived === "number" ? stat.packetsReceived : null,
                        bytesReceived: typeof stat.bytesReceived === "number" ? stat.bytesReceived : null,
                        audioLevel: typeof stat.audioLevel === "number" ? stat.audioLevel : null,
                        totalAudioEnergy: typeof stat.totalAudioEnergy === "number" ? stat.totalAudioEnergy : null,
                        totalSamplesDuration: typeof stat.totalSamplesDuration === "number" ? stat.totalSamplesDuration : null,
                      });
                    }
                  });
                  return rows;
                } catch {
                  return null;
                }
              })(),
            } : null,
            dataChannel: state?.dataChannelEvents?.length ? {
              readyState: dc?.readyState ?? state.dataChannelEvents[state.dataChannelEvents.length - 1]?.channelState ?? null,
              bufferedAmount: typeof dc?.bufferedAmount === "number" ? dc.bufferedAmount : null,
            } : null,
          };
        }),
        requestCounts: responseRecords.reduce((counts, r) => { const k = `${r.method} ${r.url} ${r.status}`; counts[k] = (counts[k] ?? 0) + 1; return counts; }, {}),
        requestTimings: responseRecords,
        failures,
        consoleErrors,
        summary: { telemetryBarrierTurns: turnResults.filter((t) => t.telemetryBarrierReached).length, requiredTurns: 5, browserRequests: responseRecords.length, failedRequests: failures.length, note: "Partial failure diagnostics only; no provider benchmark result should be accepted." },
      }, null, 2));
      console.error("[conversation-bench] wrote partial diagnostics", out);
    } catch (writeError) {
      console.error("[conversation-bench] could not write partial diagnostics:", String(writeError).slice(0, 500));
    }
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error("[conversation-bench] FAILED:", safeDiagnosticText(error?.stack || error));
  process.exit(1);
});
