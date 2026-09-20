import { describe, expect, it, vi } from "vitest";
import {
  LatencyTracker,
  percentile,
  summarizeLatency,
  type TurnLatencyRecord,
} from "./latency-tracker";
import { GenerationCoordinator } from "./generation-coordinator";
import { mintSessionId, mintTurnId } from "./identity";

describe("LatencyTracker — stage marks", () => {
  it("marks stages idempotently (first mark wins)", () => {
    vi.useFakeTimers();
    try {
      const tracker = new LatencyTracker();
      tracker.beginTurn({ sessionId: "vrs_1", provider: "openai", model: "gpt-realtime-2.1-mini" });

      vi.setSystemTime(1_000);
      tracker.mark("stt.final");
      vi.setSystemTime(5_000);
      tracker.mark("stt.final"); // duplicate — must NOT overwrite
      expect(tracker.current?.marks["stt.final"]).toBe(1_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores marks before a turn begins", () => {
    const tracker = new LatencyTracker();
    tracker.mark("stt.final");
    expect(tracker.current).toBeNull();
  });

  it("beginTurn resets marks and stamps turn.start", () => {
    const tracker = new LatencyTracker();
    tracker.beginTurn({ sessionId: "vrs_1", provider: "openai" });
    tracker.mark("stt.final");
    tracker.beginTurn({ sessionId: "vrs_1", provider: "openai" });
    expect(tracker.current?.marks["stt.final"]).toBeUndefined();
    expect(tracker.current?.marks["turn.start"]).toBeGreaterThan(0);
  });
});

describe("LatencyTracker — TTFA + stage latencies (plan Task 4.2)", () => {
  it("computes TTFA = browser.first_audio - stt.final and the stage profile", () => {
    vi.useFakeTimers();
    try {
      const tracker = new LatencyTracker();
      tracker.beginTurn({ sessionId: "vrs_1", provider: "openai", model: "gpt-realtime-2.1-mini" });

      vi.setSystemTime(0);
      tracker.mark("stt.first_partial", 0);
      tracker.mark("stt.final", 400);        // STT: 400 ms after first partial
      tracker.mark("rag.start", 410);
      tracker.mark("rag.end", 900);           // RAG: 490 ms
      tracker.mark("llm.start", 905);
      tracker.mark("llm.first_token", 1_200); // LLM: 295 ms
      tracker.mark("tts.start", 1_210);
      tracker.mark("tts.first_audio", 1_500); // TTS: 290 ms
      tracker.mark("browser.first_audio", 1_560); // playback: 60 ms
      tracker.mark("turn.complete", 4_000);

      const latencies = tracker.latencies()!;
      expect(latencies.sttMs).toBe(400);
      expect(latencies.ragMs).toBe(490);
      expect(latencies.llmMs).toBe(295);
      expect(latencies.ttsMs).toBe(290);
      expect(latencies.playbackMs).toBe(60);
      expect(latencies.ttfaMs).toBe(1_160); // 1560 - 400
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to turn.start as the STT base when no partial arrived", () => {
    const tracker = new LatencyTracker();
    tracker.beginTurn({ sessionId: "vrs_1", provider: "openai", startedAt: 0 });
    tracker.mark("stt.final", 300);
    tracker.mark("browser.first_audio", 1_000);
    const latencies = tracker.latencies()!;
    expect(latencies.sttMs).toBe(300);
    expect(latencies.ttfaMs).toBe(700);
  });

  it("returns nulls for stages without both endpoints", () => {
    const tracker = new LatencyTracker();
    tracker.beginTurn({ sessionId: "vrs_1", provider: "openai" });
    tracker.mark("rag.start", 100);
    const latencies = tracker.latencies()!;
    expect(latencies.ragMs).toBeNull();
    expect(latencies.ttfaMs).toBeNull();
  });

  it("telemetry carries identity + timings, never transcripts", () => {
    const tracker = new LatencyTracker();
    tracker.beginTurn({ sessionId: "vrs_1", generationId: "vrg_9", turnId: "vrt_2", provider: "openai", model: "m" });
    tracker.mark("stt.final", 0);
    tracker.mark("browser.first_audio", 800);
    const event = tracker.telemetry()!;
    expect(event.sessionId).toBe("vrs_1");
    expect(event.generationId).toBe("vrg_9");
    expect(event.turnId).toBe("vrt_2");
    expect(event.provider).toBe("openai");
    expect(event.latencies.ttfaMs).toBe(800);
    expect(JSON.stringify(event)).not.toContain("question");
    expect(JSON.stringify(event)).not.toContain("answer");
  });

  it("beginGenerationTurn wires coordinator identity", () => {
    const coordinator = new GenerationCoordinator(mintSessionId());
    const generation = coordinator.beginTurn(mintTurnId())!;
    const tracker = new LatencyTracker();
    tracker.beginGenerationTurn(generation, "sarvam", "sarvam-105b-conversations");
    expect(tracker.current?.sessionId).toBe(coordinator.sessionId);
    expect(tracker.current?.generationId).toBe(generation.generationId);
    expect(tracker.current?.turnId).toBe(generation.turnId);
    expect(tracker.current?.provider).toBe("sarvam");
  });
});

describe("percentile + summarizeLatency", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10], 50)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3); // sorts before ranking
  });

  it("aggregates a baseline run into p50/p95 per stage", () => {
    const mk = (t0: number, ttfa: number): TurnLatencyRecord => ({
      sessionId: "vrs_1",
      generationId: "vrg_x",
      turnId: null,
      provider: "openai",
      model: "gpt-realtime-2.1-mini",
      marks: {
        "turn.start": t0,
        "stt.first_partial": t0 + 100,
        "stt.final": t0 + 400,
        "rag.start": t0 + 410,
        "rag.end": t0 + 900,
        "llm.start": t0 + 905,
        "llm.first_token": t0 + 1_200,
        "tts.start": t0 + 1_210,
        "tts.first_audio": t0 + 1_500,
        "browser.first_audio": t0 + 400 + ttfa,
        "turn.complete": t0 + 4_000,
      },
    });

    // TTFA samples: 1200, 1300, 1400, 1600 → p50 = 1300, p95 = 1600.
    // playback = browser.first_audio - tts.first_audio = ttfa - 1100.
    const turns = [mk(0, 1_200), mk(10_000, 1_300), mk(20_000, 1_400), mk(30_000, 1_600)];
    const summary = summarizeLatency(turns);

    expect(summary.count).toBe(4);
    expect(summary.ttfa.p50).toBe(1_300);
    expect(summary.ttfa.p95).toBe(1_600);
    expect(summary.stt.p50).toBe(300);
    expect(summary.rag.p50).toBe(490);
    expect(summary.llm.p50).toBe(295);
    expect(summary.tts.p50).toBe(290);
    expect(summary.playback.p50).toBe(200);
    expect(summary.playback.p95).toBe(500);
  });

  it("sttMarks/carrySttMarks preserve STT timestamps across a record replacement (the committed-turn bug)", () => {
    // Exact sequence of every Clara-owned realtime hook:
    //   stt.first_partial + stt.final are marked on the INTERIM record,
    //   then beginGenerationTurn REPLACES the record for the committed user
    //   turn. Before the carry API this dropped the STT marks and TTFA was
    //   null on every real session.
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "sarvam" });
    t.mark("stt.first_partial", 1_000);
    t.mark("stt.final", 1_500);

    const carried = t.sttMarks();
    expect(carried).toEqual({ firstPartial: 1_000, final: 1_500 });

    // The replacement (simulates beginGenerationTurn for the committed turn).
    t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_1", turnId: "vrt_1", provider: "sarvam" });
    expect(t.current?.marks["stt.final"]).toBeUndefined();

    t.carrySttMarks(carried);
    t.mark("rag.start", 1_600);
    t.mark("rag.end", 1_800);
    t.mark("tts.first_audio", 2_100);
    t.mark("browser.first_audio", 2_120);

    const lat = t.latencies()!;
    expect(lat.sttMs).toBe(500);      // 1500 - 1000 — preserved
    expect(lat.ttfaMs).toBe(620);     // 2120 - 1500 — no longer null
  });

  it("sttMarks on a tracker without STT marks carries nothing (greeting/system generation)", () => {
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "openai" });
    const carried = t.sttMarks();
    expect(carried).toEqual({});
    t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_1", provider: "openai" });
    t.carrySttMarks(carried);
    expect(t.current?.marks["stt.first_partial"]).toBeUndefined();
    expect(t.current?.marks["stt.final"]).toBeUndefined();
  });

  it("carrySttMarks is first-wins: later vendor STT events cannot rewrite the carried values", () => {
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "sarvam" });
    t.mark("stt.final", 1_500);
    const carried = t.sttMarks();
    t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_1", provider: "sarvam" });
    t.carrySttMarks(carried);
    // A late duplicate final arriving after the replacement:
    t.mark("stt.final", 9_999);
    expect(t.current?.marks["stt.final"]).toBe(1_500);
  });

  it("prepareForUtterance resets for a new utterance after a completed turn (multi-turn TTFA correctness)", () => {
    // Turn 1 completes; turn 2's partials must NOT collide with turn 1's
    // first-wins stt marks — the tracker opens a fresh interim record.
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "sarvam" });
    t.mark("stt.first_partial", 1_000);
    t.mark("stt.final", 1_500);
    t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_1", turnId: "vrt_1", provider: "sarvam" });
    t.carrySttMarks(t.sttMarks());
    t.mark("browser.first_audio", 2_100);
    t.mark("turn.complete", 5_000);

    // Turn 2 begins speaking:
    t.prepareForUtterance();
    t.mark("stt.first_partial", 6_000);
    t.mark("stt.final", 6_400);
    const carried = t.sttMarks();
    t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_2", turnId: "vrt_2", provider: "sarvam" });
    t.carrySttMarks(carried);
    t.mark("browser.first_audio", 7_000);
    t.mark("turn.complete", 9_000);

    const lat = t.latencies()!;
    expect(lat.sttMs).toBe(400);   // 6400 - 6000 — turn 2's OWN partials
    expect(lat.ttfaMs).toBe(600);  // 7000 - 6400 — not turn 1's 1500
  });

  it("prepareForUtterance is a no-op on a live interim record", () => {
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "sarvam" });
    t.mark("stt.first_partial", 1_000);
    t.prepareForUtterance();
    t.mark("stt.first_partial", 1_200); // first-wins still applies
    expect(t.current?.marks["stt.first_partial"]).toBe(1_000);
    expect(t.current?.marks["turn.start"]).toBeTypeOf("number");
  });

  it("prepareForUtterance does not reset an interim record that carries a barge-in interrupt mark", () => {
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "sarvam" });
    t.mark("stt.first_partial", 1_000);
    t.mark("interrupt", 1_100); // barge-in landed on the live interim
    t.prepareForUtterance();
    t.mark("stt.final", 1_500);
    expect(t.current?.marks["stt.first_partial"]).toBe(1_000); // same record
    expect(t.current?.marks["stt.final"]).toBe(1_500);
  });

  it("turn handles are immune to record replacement — the in-flight chat bleed bug", () => {
    // Exact live scenario from the first real benchmark run: the looping
    // question WAV opened a SECOND utterance while turn 1's chat was still
    // streaming. tracker-level mark() bled turn 1's rag/llm/complete marks
    // onto the new interim record; turn 1's own record never emitted.
    const t = new LatencyTracker();
    t.beginTurn({ sessionId: "vrs_1", provider: "sarvam" });
    t.mark("stt.first_partial", 1_000);
    t.mark("stt.final", 1_500);

    // Turn 1 commits: handle-bound marks.
    const carried = t.sttMarks();
    const turn1 = t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_1", turnId: "vrt_1", provider: "sarvam" });
    t.carrySttMarks(carried);
    turn1.mark("llm.start", 1_600);

    // Second utterance opens MID-STREAM (barge-in / looping input):
    t.prepareForUtterance(); // fresh interim record
    t.mark("stt.first_partial", 2_000);

    // Turn 1's stream keeps marking THROUGH ITS HANDLE:
    turn1.mark("rag.end", 2_100);
    turn1.mark("llm.first_token", 2_200);
    turn1.mark("tts.first_audio", 2_400);
    turn1.mark("browser.first_audio", 2_420);
    turn1.mark("turn.complete", 3_000);

    const ev1 = turn1.telemetry()!;
    expect(ev1.generationId).toBe("vrg_1");
    expect(ev1.marks["stt.final"]).toBe(1_500);       // carried, not bled
    expect(ev1.marks["stt.first_partial"]).toBe(1_000);
    expect(ev1.latencies.ttfaMs).toBe(920);           // 2420 - 1500
    expect(ev1.latencies.llmMs).toBe(600);            // 2200 - 1600

    // The interim record for utterance 2 is untouched by turn 1's marks:
    const cur = t.current!;
    expect(cur.generationId).toBeNull();
    expect(cur.marks["rag.end"]).toBeUndefined();
    expect(cur.marks["turn.complete"]).toBeUndefined();
    expect(cur.marks["stt.first_partial"]).toBe(2_000);
  });

  it("handle.mark is first-wins and handle telemetry is timings-only", () => {
    const t = new LatencyTracker();
    const h = t.beginTurn({ sessionId: "vrs_1", generationId: "vrg_1", provider: "openai" });
    h.mark("llm.start", 1_000);
    h.mark("llm.start", 9_999); // late duplicate
    const ev = h.telemetry()!;
    expect(ev.marks["llm.start"]).toBe(1_000);
    expect(Object.keys(ev)).toEqual(expect.arrayContaining(["sessionId", "generationId", "turnId", "provider", "model", "marks", "latencies"]));
  });

  it("handles records with missing stages", () => {
    const turns: TurnLatencyRecord[] = [
      {
        sessionId: "vrs_1",
        generationId: null,
        turnId: null,
        provider: "openai",
        model: null,
        marks: { "turn.start": 0, "stt.final": 100 }, // no audio → no TTFA
      },
    ];
    const summary = summarizeLatency(turns);
    expect(summary.count).toBe(1);
    expect(summary.ttfa.p50).toBeNull();
    expect(summary.rag.p50).toBeNull();
  });
});
