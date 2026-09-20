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
