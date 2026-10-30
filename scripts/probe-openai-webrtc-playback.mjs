#!/usr/bin/env node
/**
 * Opt-in headless WebRTC playback probe. Execute inside an authorized Clara
 * backend container with OPENAI_API_KEY configured. Uses an existing,
 * permission-checked RAG retrieval export as evidence, not direct Qdrant.
 *
 * Usage:
 * node scripts/probe-openai-webrtc-playback.mjs /tmp/probe.json /tmp/questions.json
 *
 * Questions JSON is an array of strings. No credentials, question contents,
 * retrieved evidence or generated transcripts are written to stdout/files.
 * This exercises the Realtime provider and WebRTC, not an authenticated Clara
 * browser session or a human microphone. Never claim human playback UAT.
 */
import fs from "node:fs/promises";
import { chromium } from "playwright";

async function main() {
  const [evidenceFile, questionsFile] = process.argv.slice(2);
  if (!evidenceFile || !questionsFile || !process.env.OPENAI_API_KEY)
    throw new Error("Provide retrieval export, questions JSON, and configured OPENAI_API_KEY");
  const probe = JSON.parse(await fs.readFile(evidenceFile, "utf8"));
  const questions = JSON.parse(await fs.readFile(questionsFile, "utf8"));
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10 ||
    !questions.every(q => typeof q === "string" && q.trim().length > 3 && q.length < 1000))
    throw new Error("Questions file must contain 1–10 nonempty bounded questions");
  const context = probe.response?.context;
  if (!probe.response?.grounded || typeof context !== "string" || !context.trim())
    throw new Error("Evidence export must contain an authorized, grounded retrieval context");
  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini",
    instructions: [
      "You are a grounded assistant. Answer exclusively from the evidence below. For explicit complete-list requests, enumerate all supported items. Finish spoken sentences.",
      probe.response.guidance || "", context,
    ].join("\n\n"),
    output_modalities: ["audio"],
    max_output_tokens: "inf",
    tool_choice: "none",
    tools: [],
    audio: {
      output: { voice: "marin" },
      input: { turn_detection: { type: "server_vad", create_response: false, interrupt_response: false } },
    },
  };
  const tokenResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!tokenResponse.ok) throw new Error(`Realtime session HTTP ${tokenResponse.status}`);
  const ephemeral = (await tokenResponse.json()).value;
  if (!ephemeral) throw new Error("Realtime session did not return an ephemeral key");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CLARA_TEST_CHROME || "/ms-playwright/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage();
    const offer = await page.evaluate(async () => {
      window._p = new RTCPeerConnection();
      window._p.addTransceiver("audio", { direction: "recvonly" });
      window._dc = window._p.createDataChannel("oai-events");
      window._ob = { created: 0, generated: 0, done: 0, started: 0, stopped: 0,
        cleared: 0, status: null, reason: null, transcript: "", media: false,
        playbackStartMs: 0, playbackStopMs: 0, autoplay: false, errors: [], bufferStopHasResponseId: 0, bufferStopMissingResponseId: 0,
        bufferStartHasResponseId: 0, bufferStartMissingResponseId: 0 };
      window._p.ontrack = ({ track, streams }) => {
        window._ob.media = track.readyState === "live";
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.srcObject = streams[0];
        document.body.append(audio);
        audio.play().then(() => { window._ob.autoplay = true; })
          .catch(() => { window._ob.errors.push("autoplay"); });
        track.onended = () => window._ob.errors.push("track-ended");
      };
      window._dc.onmessage = ({ data }) => {
        const event = JSON.parse(data);
        const type = event.type;
        const state = window._ob;
        if (type === "response.created") state.created++;
        if (type === "response.done") {
          state.done++;
          state.status = event.response?.status ?? null;
          state.reason = event.response?.status_details?.reason ?? null;
        }
        if (type === "response.output_audio.done") state.generated++;
        if (type === "output_audio_buffer.started") {
          state.started++;
          if (!state.playbackStartMs) state.playbackStartMs = performance.now();
          if (typeof event.response_id === "string") state.bufferStartHasResponseId++;
          else state.bufferStartMissingResponseId++;
        }
        if (type === "output_audio_buffer.stopped") {
          state.stopped++;
          state.playbackStopMs = performance.now();
          if (typeof event.response_id === "string") state.bufferStopHasResponseId++;
          else state.bufferStopMissingResponseId++;
        }
        if (type === "output_audio_buffer.cleared") state.cleared++;
        if (type === "response.output_audio_transcript.delta")
          state.transcript += event.delta || "";
        if (type === "error") state.errors.push(event.error?.code ?? "provider-error");
      };
      const offer = await window._p.createOffer();
      await window._p.setLocalDescription(offer);
      return window._p.localDescription.sdp;
    });
    const exchanged = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${ephemeral}`, "Content-Type": "application/sdp" },
      body: offer,
      signal: AbortSignal.timeout(25_000),
    });
    if (!exchanged.ok) throw new Error(`Realtime SDP HTTP ${exchanged.status}`);
    await page.evaluate(async sdp => window._p.setRemoteDescription({ type: "answer", sdp }), await exchanged.text());
    await page.waitForFunction(() => window._dc.readyState === "open", null, { timeout: 25_000 });
    for (let i = 0; i < questions.length; i++) {
      await page.evaluate(question => {
        window._ob = { ...window._ob, created: 0, generated: 0, done: 0,
          started: 0, stopped: 0, cleared: 0, status: null, reason: null,
          transcript: "", errors: [], playbackStartMs: 0, playbackStopMs: 0, bufferStopHasResponseId: 0, bufferStopMissingResponseId: 0,
          bufferStartHasResponseId: 0, bufferStartMissingResponseId: 0 };
        window._dc.send(JSON.stringify({ type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: question }] } }));
        window._dc.send(JSON.stringify({ type: "response.create", response: { tool_choice: "none" } }));
      }, questions[i]);
      let timedOut = false;
      try {
        await page.waitForFunction(() => window._ob.done > 0 &&
          (window._ob.stopped > 0 || window._ob.cleared > 0 ||
           (window._ob.started === 0 && window._ob.generated === 0)),
          null, { timeout: 105_000 });
      } catch { timedOut = true; }
      const result = await page.evaluate(() => {
        const s = window._ob;
        return { status: s.status, reason: s.reason, created: s.created,
          audioGenerated: s.generated, audioStarted: s.started,
          bufferDrained: s.stopped, bufferCleared: s.cleared,
          receivedMediaTrack: s.media, autoplayStarted: s.autoplay,
          transcriptCharacters: s.transcript.length, errors: s.errors,
          playbackDurationMs: s.playbackStartMs && s.playbackStopMs
            ? Math.round(s.playbackStopMs - s.playbackStartMs) : null,
          bufferStopHasResponseId: s.bufferStopHasResponseId,
          bufferStopMissingResponseId: s.bufferStopMissingResponseId,
          bufferStartHasResponseId: s.bufferStartHasResponseId,
          bufferStartMissingResponseId: s.bufferStartMissingResponseId };
      });
      const ok = !timedOut && result.status === "completed" &&
        result.audioStarted > 0 && result.bufferDrained > 0 && result.receivedMediaTrack &&
        result.autoplayStarted && result.errors.length === 0;
      console.log(JSON.stringify({ turn: i + 1, outcome: ok ? "PASS" : "FAIL", timedOut, ...result }));
      if (!ok) { process.exitCode = 1; break; }
    }
    await page.evaluate(() => { window._dc.close(); window._p.close(); });
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("WebRTC acceptance could not complete:", error.name, error.message.slice(0, 200));
  process.exitCode = 1;
});
