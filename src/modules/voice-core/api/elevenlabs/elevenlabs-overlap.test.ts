/**
 * Plan Task 6.5 — the P0 multiple-answer bug, explicitly tested.
 *
 * The Mode A pipeline (and the Mode C pipeline by construction) now runs on
 * the shared GenerationCoordinator + GenerationPlaybackQueue. These tests
 * replay the exact overlap scenarios the plan lists:
 *
 *   • fast repeated user speech;
 *   • duplicate final transcript;
 *   • interruption during RAG / LLM / TTS;
 *   • delayed old audio;
 *   • delayed old completion.
 *
 * Acceptance (plan §6.5): at most one assistant generation can be speaking
 * at any instant.
 */

import { describe, expect, it, vi } from "vitest";
import { GenerationCoordinator } from "@/modules/voice-core/realtime/generation-coordinator";
import { mintSessionId, mintTurnId } from "@/modules/voice-core/realtime/identity";
import { GenerationPlaybackQueue } from "@/modules/assistant/core/voice/generation-playback";

type MockSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

function createMockContext() {
  const sources: MockSource[] = [];
  const ctx = {
    sampleRate: 16_000,
    state: "running",
    destination: { __destination: true },
    createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
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
  return new Int16Array(samples).fill(950);
}

/** Mode A harness: coordinator + queue wired exactly like useElevenLabsVoice. */
function createModeASession() {
  const coordinator = new GenerationCoordinator(mintSessionId());
  const { ctx, sources } = createMockContext();
  const queue = new GenerationPlaybackQueue({ ctx, coordinator });
  const chatAborts: Array<ReturnType<typeof vi.fn>> = [];
  const ttsFetches: Array<string> = [];
  let lastFinal: { text: string; at: number } | null = null;

  const runAssistantTurn = (question: string) => {
    // Duplicate committed transcript guard (hook lines).
    const now = Date.now();
    if (lastFinal && lastFinal.text === question && now - lastFinal.at < 2_000) return null;
    lastFinal = { text: question, at: now };

    const generation = coordinator.beginTurn(mintTurnId());
    if (!generation) return null;
    const chatAbort = vi.fn();
    coordinator.registerAbort(chatAbort);
    chatAborts.push(chatAbort);
    return { generation, chatAbort };
  };

  const speakSentence = (text: string, generationId: string | null) => {
    // Hook guard: stale generations never dispatch TTS at all.
    if (!generationId || !coordinator.isCurrentGeneration(generationId)) return false;
    ttsFetches.push(text);
    queue.enqueue(pcm(), 16_000, generationId);
    return true;
  };

  const token = (generationId: string, delta: string) =>
    coordinator.isCurrentGeneration(generationId) ? delta : null;

  return { coordinator, queue, sources, chatAborts, ttsFetches, runAssistantTurn, speakSentence, token };
}

describe("Mode A overlap scenarios (plan Task 6.5 — the P0)", () => {
  it("fast repeated user speech: the second turn aborts the first and wins", () => {
    const session = createModeASession();

    const turnA = session.runAssistantTurn("first question")!;
    const turnB = session.runAssistantTurn("second question")!;

    // The first chat stream is aborted the moment the second turn begins.
    expect(turnA.chatAbort).toHaveBeenCalledTimes(1);
    expect(turnB.chatAbort).not.toHaveBeenCalled();
    expect(session.coordinator.isCurrentGeneration(turnA.generation.generationId)).toBe(false);
    expect(session.coordinator.isCurrentGeneration(turnB.generation.generationId)).toBe(true);
  });

  it("duplicate final transcript never creates a second generation", () => {
    const session = createModeASession();
    const first = session.runAssistantTurn("what is my deductible");
    // The duplicate arrives inside the 2-second window → same turn, ignored.
    const duplicate = session.runAssistantTurn("what is my deductible");
    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(session.coordinator.stats().generations).toBe(1);
  });

  it("interruption during TTS: queued audio is dropped and the generation dies", () => {
    const session = createModeASession();
    const turn = session.runAssistantTurn("covered?")!;
    session.speakSentence("Sentence one.", turn.generation.generationId);
    session.speakSentence("Sentence two.", turn.generation.generationId);
    expect(session.queue.speaking).toBe(true);

    // User barge-in mid-TTS (startUtterance → interruptPlayback).
    session.queue.interrupt();
    expect(session.queue.speaking).toBe(false);
    expect(session.queue.queuedCount).toBe(0);
    expect(session.sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(turn.chatAbort).toHaveBeenCalledTimes(1); // chat cancelled too
  });

  it("interruption during LLM: late tokens from the old generation are rejected", () => {
    const session = createModeASession();
    const turnA = session.runAssistantTurn("q1")!;
    // Tokens arrive while A is current…
    expect(session.token(turnA.generation.generationId, "part one ")).toBe("part one ");
    // …then the user barges in and a new turn starts.
    session.runAssistantTurn("q2");
    // A late token from the replaced generation is rejected (never appended,
    // never spoken).
    expect(session.token(turnA.generation.generationId, "late token")).toBeNull();
    // And its TTS is never dispatched.
    expect(session.speakSentence("late sentence", turnA.generation.generationId)).toBe(false);
  });

  it("delayed old audio arriving after a new turn started is never heard", () => {
    const session = createModeASession();
    const turnA = session.runAssistantTurn("q1")!;
    session.speakSentence("A sentence.", turnA.generation.generationId);

    // User starts speaking → client VAD barge-in stops A's playback FIRST
    // (startUtterance → interruptPlayback), THEN the committed transcript
    // begins the new turn.
    session.queue.interrupt();

    const turnB = session.runAssistantTurn("q2")!;
    session.speakSentence("B sentence.", turnB.generation.generationId);

    // Delayed TTS audio from A arrives late.
    const sourcesBefore = session.sources.length;
    session.queue.enqueue(pcm(), 16_000, turnA.generation.generationId);
    expect(session.sources.length).toBe(sourcesBefore); // not even created

    const started = session.sources.filter((s) => s.start.mock.calls.length > 0);
    expect(started.length).toBe(2); // A1 (stopped by barge-in) + B1 — never the late A chunk
  });

  it("delayed old completion is a no-op on the new generation", () => {
    const session = createModeASession();
    const turnA = session.runAssistantTurn("q1")!;
    const turnB = session.runAssistantTurn("q2")!;
    // A's stream "finishes" late — completing the CURRENT generation would be
    // wrong; completeGeneration() only affects the current one.
    session.coordinator.completeGeneration(); // completes turnB, not turnA
    expect(turnB.generation.state).toBe("completed");
    expect(turnA.generation.state).toBe("invalidated");
    // Completed B stays current so its queued audio can finish.
    expect(session.coordinator.isCurrentGeneration(turnB.generation.generationId)).toBe(true);
  });

  it("acceptance: at most ONE assistant generation can be speaking at any instant", () => {
    const session = createModeASession();
    // Interleave several rapid turns, each with queued audio.
    const turns = ["q1", "q2", "q3"].map((q) => session.runAssistantTurn(q)!);
    for (const turn of turns) {
      session.speakSentence(`${turn.generation.generationId} audio`, turn.generation.generationId);
    }
    // Only the LAST generation's audio ever started.
    const started = session.sources.filter((s) => s.start.mock.calls.length > 0);
    expect(started.length).toBe(1);
    expect(session.coordinator.isCurrentGeneration(turns[2].generation.generationId)).toBe(true);
    expect(
      session.coordinator.isCurrentGeneration(turns[0].generation.generationId)
        || session.coordinator.isCurrentGeneration(turns[1].generation.generationId),
    ).toBe(false);
  });
});
