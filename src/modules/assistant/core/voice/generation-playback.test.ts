import { describe, expect, it, vi } from "vitest";
import { GenerationPlaybackQueue } from "./generation-playback";
import { GenerationCoordinator } from "@/modules/voice-core/realtime/generation-coordinator";
import { mintSessionId, mintTurnId } from "@/modules/voice-core/realtime/identity";

// ── Minimal WebAudio mocks (node environment, no real audio) ────────────────

type MockSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

function createMockContext(sampleRate = 16_000) {
  const sources: MockSource[] = [];
  const ctx = {
    sampleRate,
    state: "running",
    destination: { __destination: true },
    createBuffer: vi.fn((channels: number, length: number, rate: number) => ({
      channels,
      length,
      rate,
      copyToChannel: vi.fn(),
    })),
    createBufferSource: vi.fn(() => {
      const source: MockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }),
  };
  return { ctx: ctx as unknown as AudioContext, sources };
}

function pcm(samples = 160): Int16Array {
  return new Int16Array(samples).fill(1000);
}

function freshQueue(sampleRate = 16_000) {
  const coordinator = new GenerationCoordinator(mintSessionId());
  const { ctx, sources } = createMockContext(sampleRate);
  const queue = new GenerationPlaybackQueue({ ctx, coordinator });
  return { coordinator, queue, sources, ctx };
}

describe("GenerationPlaybackQueue — happy path", () => {
  it("plays queued items of the current generation in order", () => {
    const { coordinator, queue, sources } = freshQueue();
    const gen = coordinator.beginTurn(mintTurnId())!;

    expect(queue.enqueue(pcm(), 16_000, gen.generationId)).toBe(true);
    expect(queue.enqueue(pcm(), 16_000, gen.generationId)).toBe(true);

    // First item started, second stays queued behind it.
    expect(sources[0]?.start).toHaveBeenCalledTimes(1);
    expect(sources[1]?.start).not.toHaveBeenCalled();
    expect(queue.speaking).toBe(true);
    expect(queue.queuedCount).toBe(1);
  });

  it("notifies speaking transitions", () => {
    const coordinator = new GenerationCoordinator(mintSessionId());
    const { ctx, sources } = createMockContext();
    const onSpeakingChange = vi.fn();
    const queue = new GenerationPlaybackQueue({ ctx, coordinator, events: { onSpeakingChange } });
    const gen = coordinator.beginTurn(mintTurnId())!;

    queue.enqueue(pcm(), 16_000, gen.generationId);
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);

    sources[0]!.onended?.();
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
    expect(queue.speaking).toBe(false);
  });

  it("uses the provider-declared sample rate for the buffer", () => {
    const { coordinator, ctx, queue } = freshQueue();
    const gen = coordinator.beginTurn(mintTurnId())!;
    queue.enqueue(pcm(10), 24_000, gen.generationId);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 10, 24_000);
  });
});

describe("GenerationPlaybackQueue — plan acceptance test (Task 2.3)", () => {
  it("delayed audio from an interrupted generation is never heard", () => {
    const { coordinator, queue, sources } = freshQueue();

    // 1. Start answer A.
    const generationA = coordinator.beginTurn(mintTurnId())!;
    queue.enqueue(pcm(), 16_000, generationA.generationId);
    queue.enqueue(pcm(), 16_000, generationA.generationId);
    const startedCountA = sources.filter((s) => s.start.mock.calls.length > 0).length;
    expect(startedCountA).toBe(1); // A1 playing, A2 queued

    // 2. Interrupt.
    queue.interrupt();
    expect(queue.speaking).toBe(false);
    expect(queue.queuedCount).toBe(0);
    expect(sources[0]?.stop).toHaveBeenCalled();

    // 3. Start answer B.
    const generationB = coordinator.beginTurn(mintTurnId())!;
    expect(queue.enqueue(pcm(), 16_000, generationB.generationId)).toBe(true);

    // 4. Delayed audio from A arrives.
    const sourcesBefore = sources.length;
    expect(queue.enqueue(pcm(), 16_000, generationA.generationId)).toBe(false);

    // A's audio is never heard: no new source was even created for it, and
    // every source that DID start belongs to generation A1 (stopped) or B.
    expect(sources.length).toBe(sourcesBefore);
    const startedAfterInterrupt = sources
      .slice(startedCountA) // sources created after A's items
      .filter((s) => s.start.mock.calls.length > 0);
    expect(startedAfterInterrupt.length).toBe(1); // only B's item
    expect(coordinator.isCurrentGeneration(generationA.generationId)).toBe(false);
    expect(coordinator.isCurrentGeneration(generationB.generationId)).toBe(true);
  });
});

describe("GenerationPlaybackQueue — enqueue-time gating", () => {
  it("discards audio for an unknown/stale generation at enqueue", () => {
    const { queue, sources } = freshQueue();
    const onDiscarded = vi.fn();
    queue["events"].onDiscarded = onDiscarded; // internal injection for assertion

    expect(queue.enqueue(pcm(), 16_000, "vrg_not-current")).toBe(false);
    expect(queue.enqueue(pcm(), 16_000, "")).toBe(false);
    expect(sources.length).toBe(0);
    expect(onDiscarded).toHaveBeenCalledWith("vrg_not-current", "enqueue");
  });

  it("discards audio that arrives after the generation completed AND was replaced", () => {
    const { coordinator, queue } = freshQueue();
    const genA = coordinator.beginTurn(mintTurnId())!;
    coordinator.completeGeneration();
    // Completed generation's queued audio may still play…
    expect(queue.enqueue(pcm(), 16_000, genA.generationId)).toBe(true);
    // …but once a new turn replaces it, late A audio is stale.
    coordinator.beginTurn(mintTurnId());
    expect(queue.enqueue(pcm(), 16_000, genA.generationId)).toBe(false);
  });
});

describe("GenerationPlaybackQueue — play-time gating", () => {
  it("skips queued items whose generation went stale while waiting", () => {
    const { coordinator, queue, sources } = freshQueue();
    const onDiscarded = vi.fn();
    queue["events"].onDiscarded = onDiscarded;

    const genA = coordinator.beginTurn(mintTurnId())!;
    queue.enqueue(pcm(), 16_000, genA.generationId); // A1 — starts playing
    queue.enqueue(pcm(), 16_000, genA.generationId); // A2 — waits in queue

    // User barges in with a new turn while A1 is still playing.
    coordinator.beginTurn(mintTurnId());

    // A1 finishes naturally.
    sources[0]!.onended?.();

    // A2 must NOT start — its generation was replaced.
    expect(sources[1]?.start).not.toHaveBeenCalled();
    expect(onDiscarded).toHaveBeenCalledWith(genA.generationId, "play");
    expect(queue.speaking).toBe(false);
    expect(queue.queuedCount).toBe(0);
  });
});

describe("GenerationPlaybackQueue — interrupt semantics", () => {
  it("interrupt stops playing sources, clears the queue and invalidates", () => {
    const onInvalidated = vi.fn();
    const coordinator = new GenerationCoordinator(mintSessionId(), {
      onGenerationInvalidated: onInvalidated,
    });
    const { ctx, sources } = createMockContext();
    const queue = new GenerationPlaybackQueue({ ctx, coordinator });
    const gen = coordinator.beginTurn(mintTurnId())!;
    queue.enqueue(pcm(), 16_000, gen.generationId);
    queue.enqueue(pcm(), 16_000, gen.generationId);

    queue.interrupt();

    expect(sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(queue.queuedCount).toBe(0);
    expect(queue.speaking).toBe(false);
    expect(onInvalidated).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: gen.generationId }),
      "interrupt",
      null,
    );
    // A late onended from the stopped source must not resurrect speaking.
    sources[0]!.onended?.();
    expect(queue.speaking).toBe(false);
  });

  it("interrupt runs registered abort callbacks (chat/TTS cancellation)", () => {
    const { coordinator, queue } = freshQueue();
    const chatAbort = vi.fn();
    coordinator.beginTurn(mintTurnId());
    coordinator.registerAbort(chatAbort);
    queue.interrupt();
    expect(chatAbort).toHaveBeenCalledTimes(1);
  });

  it("interrupt with nothing playing is a no-op", () => {
    const { queue } = freshQueue();
    expect(() => queue.interrupt()).not.toThrow();
    expect(queue.speaking).toBe(false);
  });
});

describe("GenerationPlaybackQueue — stop (session teardown)", () => {
  it("stop flushes audio without invalidating the generation", () => {
    const onInvalidated = vi.fn();
    const coordinator = new GenerationCoordinator(mintSessionId(), {
      onGenerationInvalidated: onInvalidated,
    });
    const { ctx, sources } = createMockContext();
    const queue = new GenerationPlaybackQueue({ ctx, coordinator });
    const gen = coordinator.beginTurn(mintTurnId())!;
    queue.enqueue(pcm(), 16_000, gen.generationId);

    queue.stop();
    expect(queue.speaking).toBe(false);
    expect(onInvalidated).not.toHaveBeenCalled();
    expect(sources[0]?.stop).toHaveBeenCalledTimes(1);
  });
});
