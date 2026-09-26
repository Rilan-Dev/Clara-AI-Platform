import { describe, expect, it } from "vitest";
import { formatVoiceTurnLatency } from "./latency-log";
import { parseServerTiming } from "@/modules/assistant/client/stream";

describe("voice latency line", () => {
  it("parses Server-Timing into stage durations", () => {
    expect(parseServerTiming("rag-metadata;dur=0, rag-retrieval;dur=312, pre-llm;dur=640")).toEqual({
      "rag-metadata": 0, "rag-retrieval": 312, "pre-llm": 640,
    });
    expect(parseServerTiming(null)).toBeNull();
    expect(parseServerTiming("cache;desc=hit")).toBeNull();
  });

  it("prints one readable line with client and server stages", () => {
    const line = formatVoiceTurnLatency(
      "elevenlabs",
      { latencies: { ttfaMs: 2140, sttMs: 380, ragMs: 900, llmMs: 1480, ttsMs: 310 } },
      { "rag-config": 12, "rag-translation": 0, "rag-retrieval": 420, "pre-llm": 910 },
    );
    expect(line).toBe(
      "[voice-latency] elevenlabs · first audio 2140 ms · speech→text 380 ms · server before model 910 ms (config 12, translation 0, retrieval 420) · first model word 1480 ms · text→speech 310 ms",
    );
  });

  it("falls back to client retrieval time when the server sent no timings", () => {
    expect(formatVoiceTurnLatency("openai", { latencies: { ragMs: 700 } })).toBe("[voice-latency] openai · retrieval 700 ms");
  });
});
