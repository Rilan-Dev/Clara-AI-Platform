/**
 * Plan Task 5.3 — persistent Bulbul WebSocket TTS: "meter usage once".
 *
 * The hook streams many text frames per assistant generation (sentence chunks
 * each with its own flush). createGenerationMeter accumulates characters per
 * generationId and emits EXACTLY ONE meter callback per generation — when the
 * next generation starts, or when the connection settles (close).
 */

import { describe, expect, it, vi } from "vitest";
import { createGenerationMeter } from "../../../../../scripts/sarvam-tts-relay.mjs";

describe("createGenerationMeter — one meter event per generation", () => {
  it("accumulates sentence frames of one generation into a single meter call", () => {
    const meter = vi.fn();
    const gen = createGenerationMeter(meter);

    gen.add("vrg_1", "First sentence.");
    gen.add("vrg_1", "Second sentence.");
    gen.add("vrg_1", "Third.");

    expect(meter).not.toHaveBeenCalled();
    gen.settle();
    expect(meter).toHaveBeenCalledTimes(1);
    expect(meter).toHaveBeenCalledWith({ generationId: "vrg_1", characters: 37 });
  });

  it("settles the previous generation when a new one begins", () => {
    const meter = vi.fn();
    const gen = createGenerationMeter(meter);

    gen.add("vrg_1", "Answer one.");
    gen.add("vrg_2", "Answer two starts."); // generation switch → meter gen 1 once
    expect(meter).toHaveBeenCalledTimes(1);
    expect(meter).toHaveBeenCalledWith({ generationId: "vrg_1", characters: 11 });

    gen.settle();
    expect(meter).toHaveBeenCalledTimes(2);
    expect(meter).toHaveBeenLastCalledWith({ generationId: "vrg_2", characters: 18 });
  });

  it("never meters empty generations", () => {
    const meter = vi.fn();
    const gen = createGenerationMeter(meter);
    gen.add("vrg_1", "   "); // whitespace-only frame → 0 billable chars
    gen.settle();
    expect(meter).not.toHaveBeenCalled();
  });

  it("settling twice does not double-meter", () => {
    const meter = vi.fn();
    const gen = createGenerationMeter(meter);
    gen.add("vrg_1", "text");
    gen.settle();
    gen.settle();
    expect(meter).toHaveBeenCalledTimes(1);
  });

  it("treats null generationId frames as the same (unattributed) generation", () => {
    const meter = vi.fn();
    const gen = createGenerationMeter(meter);
    gen.add(null, "a");
    gen.add(undefined, "b");
    gen.add(null, "c");
    gen.settle();
    expect(meter).toHaveBeenCalledTimes(1);
    expect(meter).toHaveBeenCalledWith({ generationId: null, characters: 3 });
  });

  it("reuses a generation id after it was settled (replay safety)", () => {
    const meter = vi.fn();
    const gen = createGenerationMeter(meter);
    gen.add("vrg_1", "one");
    gen.add("vrg_2", "two");
    gen.add("vrg_1", "three"); // gen 1 again → settles gen 2, starts fresh gen 1
    gen.settle();
    expect(meter).toHaveBeenCalledTimes(3);
    expect(meter).toHaveBeenNthCalledWith(1, { generationId: "vrg_1", characters: 3 });
    expect(meter).toHaveBeenNthCalledWith(2, { generationId: "vrg_2", characters: 3 });
    expect(meter).toHaveBeenNthCalledWith(3, { generationId: "vrg_1", characters: 5 });
  });
});
