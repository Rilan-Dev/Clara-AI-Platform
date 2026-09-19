/**
 * Unit tests for the mic → PCM16 capture wiring (realtime voice pipelines).
 *
 * The production incident these guard against (2026-09-20): a
 * ScriptProcessorNode wired only to the mic source is never pulled by the
 * Web Audio render thread, so onaudioprocess never fires and ZERO audio
 * frames reach the vendor — "mic on, assistant greets, but it never listens".
 * The wiring MUST include the zero-gain pull-through to the destination.
 */

import { describe, expect, it, vi } from "vitest";
import { connectPcm16Capture, floatToPcm16 } from "./pcm-capture";

// ─── Minimal Web Audio mocks (node environment — no real DOM types) ─────────

interface MockNode {
  onaudioprocess: ((event: unknown) => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function mockGraph() {
  const processor: MockNode = {
    onaudioprocess: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const mute = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const ctx = {
    destination: { isDestination: true },
    createScriptProcessor: vi.fn(() => processor),
    createGain: vi.fn(() => mute),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  return { ctx, source, processor, mute };
}

// ─── floatToPcm16 ─────────────────────────────────────────────────────────────

describe("floatToPcm16", () => {
  it("converts the canonical range endpoints", () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1]));
    expect(Array.from(pcm)).toEqual([0, 32767, -32768]);
  });

  it("maps asymmetrical positive/negative scaling like the wire format", () => {
    const pcm = floatToPcm16(new Float32Array([0.5, -0.5]));
    expect(pcm[0]).toBe(Math.trunc(0.5 * 0x7fff)); // 16383
    expect(pcm[1]).toBe(-0.5 * 0x8000);            // -16384
  });

  it("clamps out-of-range floats instead of wrapping", () => {
    const pcm = floatToPcm16(new Float32Array([2, -2, 100]));
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
    expect(pcm[2]).toBe(32767);
  });
});

// ─── connectPcm16Capture wiring ─────────────────────────────────────────────

describe("connectPcm16Capture", () => {
  it("wires source → processor → zero-gain mute → destination (the pull-through)", () => {
    const { ctx, source, processor, mute } = mockGraph();
    connectPcm16Capture(
      ctx as unknown as BaseAudioContext,
      source as unknown as AudioNode,
      () => {},
    );

    expect(ctx.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
    expect(source.connect).toHaveBeenCalledWith(processor);
    // THE regression guard: without a path to the destination the render
    // thread never pulls the node and onaudioprocess never fires.
    expect(processor.connect).toHaveBeenCalledWith(mute);
    expect(mute.connect).toHaveBeenCalledWith(ctx.destination);
    expect(mute.gain.value).toBe(0);
  });

  it("emits converted PCM16 frames on every audioprocess callback", () => {
    const { ctx, source, processor } = mockGraph();
    const seen: number[][] = [];
    connectPcm16Capture(
      ctx as unknown as BaseAudioContext,
      source as unknown as AudioNode,
      (pcm16) => seen.push(Array.from(pcm16)),
    );

    expect(processor.onaudioprocess).toBeTypeOf("function");
    processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0, 0.5, -1]) },
    } as unknown);
    expect(seen).toEqual([[0, Math.trunc(0.5 * 0x7fff), -32768]]);
  });

  it("stop() tears the whole chain down idempotently", () => {
    const { ctx, source, processor, mute } = mockGraph();
    const capture = connectPcm16Capture(
      ctx as unknown as BaseAudioContext,
      source as unknown as AudioNode,
      () => {},
    );

    capture.stop();
    expect(processor.onaudioprocess).toBeNull();
    expect(source.disconnect).toHaveBeenCalledWith(processor);
    expect(processor.disconnect).toHaveBeenCalledWith(mute);
    expect(mute.disconnect).toHaveBeenCalledWith(ctx.destination);

    expect(() => capture.stop()).not.toThrow(); // second stop is a no-op
  });
});
