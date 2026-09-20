/**
 * Gemini Live latency telemetry (gap-closure Phase J leftover).
 *
 * Drives the exact vendor event sequences the hook observes and asserts the
 * measurement contract the benchmark harness relies on:
 *
 *   TTFA = browser.first_audio - stt.final
 *   STT  = stt.final - stt.first_partial
 *   RAG  = rag.end - rag.start
 *   LLM  = llm.first_token - llm.start
 *   TTS  = tts.first_audio - tts.start
 *
 * Gemini-specific rules under test:
 *   • no explicit final transcript event — stt.final is committed
 *     retroactively at the first VAD-commit evidence (toolCall/modelTurn);
 *   • utterance boundary — the first inputTranscription after
 *     turnComplete/interrupted starts a fresh record (the greeting is a
 *     system generation replaced by the first committed user utterance);
 *   • timings only — the emitted event has no transcript/secret fields.
 */

import { describe, expect, it } from "vitest";
import { GeminiTurnTelemetry } from "./gemini-telemetry";

/** Deterministic clock: starts at t=1000, +10ms per call. */
function fakeClock() {
  let t = 1000;
  return () => (t += 10);
}

function boot(model = "gemini-2.5-flash-native-audio-preview") {
  const clock = fakeClock();
  const tel = new GeminiTurnTelemetry(clock);
  tel.sessionReady(model);
  return { tel, clock };
}

describe("GeminiTurnTelemetry", () => {
  it("marks session.start on the boot record", () => {
    const { tel } = boot();
    const ev = tel.telemetry();
    expect(ev?.provider).toBe("gemini");
    expect(ev?.model).toBe("gemini-2.5-flash-native-audio-preview");
    expect(ev?.sessionId).toBeTruthy();
    expect(ev?.marks["session.start"]).toBeTypeOf("number");
    expect(ev?.marks["turn.start"]).toBeTypeOf("number");
  });

  it("greeting is a system generation: llm.start == tts.start, no stt marks, null TTFA", () => {
    const { tel } = boot();
    tel.greetingTurn();                       // t=1020
    tel.modelAudio();                         // t=1030 → first audio
    tel.turnComplete();                       // t=1040
    const ev = tel.telemetry()!;
    expect(ev.marks["llm.start"]).toBe(1020);
    expect(ev.marks["tts.start"]).toBe(1020);
    expect(ev.marks["tts.first_audio"]).toBe(1030);
    expect(ev.marks["browser.first_audio"]).toBe(1030);
    expect(ev.marks["turn.complete"]).toBe(1040);
    expect(ev.marks["stt.final"]).toBeUndefined();
    expect(ev.latencies.ttfaMs).toBeNull();
    expect(ev.latencies.ttsMs).toBe(10);
  });

  it("user turn: stt.final is the LAST transcript, committed retroactively at first model output", () => {
    const { tel } = boot();
    tel.greetingTurn();
    tel.modelAudio();
    tel.turnComplete();                       // greeting closes the utterance

    tel.userTranscript(2000);                 // partial 1 (utterance opens)
    tel.userTranscript(2050);                 // partial 2
    tel.userTranscript(2100);                 // partial 3 — LAST transcript
    tel.modelAudio(2400);                     // VAD committed → first audio
    tel.modelText(2450);
    tel.turnComplete(3000);

    const ev = tel.telemetry()!;
    expect(ev.marks["stt.first_partial"]).toBe(2000);
    expect(ev.marks["stt.final"]).toBe(2100); // retro — NOT 2400
    expect(ev.marks["browser.first_audio"]).toBe(2400);
    expect(ev.latencies.ttfaMs).toBe(300);    // 2400 - 2100
    expect(ev.latencies.sttMs).toBe(100);     // 2100 - 2000
    expect(ev.latencies.llmMs).toBe(50);      // 2450 - 2400
    expect(ev.latencies.ttsMs).toBe(0);       // native audio: same instant
  });

  it("rag_search window: toolCall is the model's first output, rag marks bracket the fetch", () => {
    const { tel } = boot();
    tel.userTranscript(2000);
    tel.userTranscript(2100);
    tel.ragStart(2150);                       // toolCall arrives
    tel.ragEnd(2350);                         // fetch resolved
    tel.modelAudio(2500);
    tel.modelText(2550);
    tel.turnComplete(3000);

    const ev = tel.telemetry()!;
    expect(ev.marks["stt.final"]).toBe(2100); // committed by the toolCall
    expect(ev.marks["llm.start"]).toBe(2150); // toolCall = first model output
    expect(ev.marks["tts.start"]).toBe(2150);
    expect(ev.marks["rag.start"]).toBe(2150);
    expect(ev.marks["rag.end"]).toBe(2350);
    expect(ev.latencies.ragMs).toBe(200);
    expect(ev.latencies.ttfaMs).toBe(400);    // 2500 - 2100
    expect(ev.latencies.ttsMs).toBe(350);     // 2500 - 2150
  });

  it("barge-in: interrupt closes the utterance; the next transcript opens a fresh record", () => {
    const { tel } = boot();
    tel.userTranscript(2000);
    tel.userTranscript(2100);
    tel.modelAudio(2400);                     // assistant starts answering…
    tel.interrupted(2600);                    // …user barges in

    // Second utterance — fresh record, no leaked marks from turn #1.
    tel.userTranscript(3000);
    tel.userTranscript(3100);
    tel.modelAudio(3400);
    tel.turnComplete(4000);

    const ev = tel.telemetry()!;
    expect(ev.marks["stt.first_partial"]).toBe(3000);
    expect(ev.marks["stt.final"]).toBe(3100);
    expect(ev.marks["browser.first_audio"]).toBe(3400);
    expect(ev.marks["interrupt"]).toBeUndefined();   // interrupt belonged to the dead record
    expect(ev.latencies.ttfaMs).toBe(300);           // 3400 - 3100
  });

  it("turnComplete then a new question: records do not bleed across turns", () => {
    const { tel } = boot();
    // Turn 1
    tel.userTranscript(2000);
    tel.modelAudio(2200);
    tel.turnComplete(2500);
    // Turn 2
    tel.userTranscript(5000);
    tel.userTranscript(5100);
    tel.modelAudio(5400);
    tel.turnComplete(6000);

    const ev = tel.telemetry()!;
    expect(ev.marks["stt.first_partial"]).toBe(5000);
    expect(ev.marks["browser.first_audio"]).toBe(5400);
    expect(ev.marks["turn.complete"]).toBe(6000);
    expect(ev.latencies.ttfaMs).toBe(300);
  });

  it("first-wins: duplicate/late vendor events cannot rewrite the measurement", () => {
    const { tel } = boot();
    tel.userTranscript(2000);
    tel.userTranscript(2100);
    tel.modelAudio(2400);
    tel.modelAudio(2700);                     // late duplicate audio
    tel.modelText(2800);
    tel.modelText(2900);                      // late duplicate text
    tel.turnComplete(3000);

    const ev = tel.telemetry()!;
    expect(ev.marks["tts.first_audio"]).toBe(2400);
    expect(ev.marks["llm.first_token"]).toBe(2800);
    expect(ev.marks["stt.final"]).toBe(2100);
  });

  it("emits timings only — no transcript, secret, or authorization fields exist", () => {
    const { tel } = boot();
    tel.userTranscript(2000);
    tel.modelAudio(2400);
    tel.turnComplete(3000);
    const ev = tel.telemetry()!;
    const keys = Object.keys(ev);
    expect(keys).toEqual(expect.arrayContaining(["sessionId", "generationId", "turnId", "provider", "model", "marks", "latencies"]));
    expect(ev.generationId).toBeNull();
    expect(ev.turnId).toBeNull();
    // The record structurally has no field for transcripts or credentials.
    expect(JSON.stringify(ev)).not.toMatch(/transcript(?!s)|apiKey|api_key|secret|authorization|bearer/i);
  });
});
