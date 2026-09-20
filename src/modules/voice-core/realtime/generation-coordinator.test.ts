import { describe, expect, it, vi } from "vitest";
import { GenerationCoordinator } from "./generation-coordinator";
import { mintSessionId, mintTurnId } from "./identity";

function newCoordinator(events?: ConstructorParameters<typeof GenerationCoordinator>[1]) {
  return new GenerationCoordinator(mintSessionId(), events);
}

describe("GenerationCoordinator — session identity", () => {
  it("keeps one stable sessionId for the coordinator lifetime", () => {
    const coordinator = newCoordinator();
    const a = coordinator.beginTurn(mintTurnId());
    const b = coordinator.beginTurn(mintTurnId());
    expect(coordinator.sessionId).toBeTruthy();
    expect(a?.sessionId).toBe(coordinator.sessionId);
    expect(b?.sessionId).toBe(coordinator.sessionId);
  });

  it("exposes session uniqueness across coordinators", () => {
    const a = newCoordinator();
    const b = newCoordinator();
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe("GenerationCoordinator — generation replacement", () => {
  it("replaces the current generation on a new committed turn", () => {
    const coordinator = newCoordinator();
    const genA = coordinator.beginTurn("turn-1");
    const genB = coordinator.beginTurn("turn-2");

    expect(genA).not.toBeNull();
    expect(genB).not.toBeNull();
    expect(genA?.generationId).not.toBe(genB?.generationId);
    expect(coordinator.isCurrentGeneration(genA!.generationId)).toBe(false);
    expect(coordinator.isCurrentGeneration(genB!.generationId)).toBe(true);
    expect(coordinator.stats().generations).toBe(2);
  });

  it("runs registered aborts when the next generation begins", () => {
    const coordinator = newCoordinator();
    const chatAbort = vi.fn();
    const ttsAbort = vi.fn();
    const laterAbort = vi.fn();

    coordinator.beginTurn("turn-1");
    coordinator.registerAbort(chatAbort);
    coordinator.registerAbort(ttsAbort);

    coordinator.beginTurn("turn-2");
    expect(chatAbort).toHaveBeenCalledTimes(1);
    expect(ttsAbort).toHaveBeenCalledTimes(1);

    // Abort set is cleared after a replacement: later registrations belong to
    // the NEW generation and must not re-fire the old callbacks.
    coordinator.registerAbort(laterAbort);
    coordinator.beginTurn("turn-3");
    expect(chatAbort).toHaveBeenCalledTimes(1);
    expect(laterAbort).toHaveBeenCalledTimes(1);
  });

  it("fires onGenerationInvalidated exactly once per generation, with reason", () => {
    const onInvalidated = vi.fn();
    const coordinator = newCoordinator({ onGenerationInvalidated: onInvalidated });

    const genA = coordinator.beginTurn("turn-1")!;
    expect(onInvalidated).not.toHaveBeenCalled();

    const genB = coordinator.beginTurn("turn-2")!;
    expect(onInvalidated).toHaveBeenCalledTimes(1);
    expect(onInvalidated).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: genA.generationId, state: "invalidated" }),
      "new-turn",
      genB.generationId,
    );

    coordinator.beginTurn("turn-3");
    expect(onInvalidated).toHaveBeenCalledTimes(2);
    expect(onInvalidated).toHaveBeenLastCalledWith(
      expect.objectContaining({ generationId: genB.generationId }),
      "new-turn",
      expect.any(String),
    );
  });
});

describe("GenerationCoordinator — stale-generation rejection", () => {
  it("rejects an invalidated generation's id", () => {
    const coordinator = newCoordinator();
    const gen = coordinator.beginTurn("turn-1")!;
    expect(coordinator.isCurrentGeneration(gen.generationId)).toBe(true);

    expect(coordinator.invalidateGeneration("interrupt")).toBe(true);
    expect(coordinator.isCurrentGeneration(gen.generationId)).toBe(false);
    expect(coordinator.isCurrentGeneration(null)).toBe(false);
    expect(coordinator.isCurrentGeneration(undefined)).toBe(false);
    expect(coordinator.isCurrentGeneration("")).toBe(false);
  });

  it("invalidateGeneration is idempotent and fires the event once", () => {
    const onInvalidated = vi.fn();
    const coordinator = newCoordinator({ onGenerationInvalidated: onInvalidated });
    coordinator.beginTurn("turn-1");

    expect(coordinator.invalidateGeneration("error")).toBe(true);
    expect(coordinator.invalidateGeneration("error")).toBe(false);
    expect(onInvalidated).toHaveBeenCalledTimes(1);
  });

  it("a stale generation cannot complete or re-complete the new one", () => {
    const coordinator = newCoordinator();
    const genA = coordinator.beginTurn("turn-1")!;
    const genB = coordinator.beginTurn("turn-2")!;

    // genA is already invalidated by replacement.
    coordinator.completeGeneration(); // completes genB (current)
    expect(genB.state).toBe("completed");
    expect(genA.state).toBe("invalidated");
    expect(coordinator.completeGeneration()).toBe(false); // already completed
  });

  it("a completed generation stays current so its queued audio can finish", () => {
    const coordinator = newCoordinator();
    const gen = coordinator.beginTurn("turn-1")!;
    coordinator.completeGeneration();
    expect(coordinator.isCurrentGeneration(gen.generationId)).toBe(true);
    // …until the next turn replaces it.
    coordinator.beginTurn("turn-2");
    expect(coordinator.isCurrentGeneration(gen.generationId)).toBe(false);
  });
});

describe("GenerationCoordinator — duplicate turn rejection", () => {
  it("rejects a duplicate committed turn", () => {
    const coordinator = newCoordinator();
    const first = coordinator.beginTurn("turn-dup");
    const second = coordinator.beginTurn("turn-dup");

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(coordinator.hasTurn("turn-dup")).toBe(true);
    expect(coordinator.stats().turns).toBe(1);
    expect(coordinator.stats().generations).toBe(1);
  });

  it("rejects empty turn ids", () => {
    const coordinator = newCoordinator();
    expect(coordinator.beginTurn("")).toBeNull();
    expect(coordinator.stats().turns).toBe(0);
  });

  it("duplicate rejection prevents a second generation from ever existing", () => {
    const onInvalidated = vi.fn();
    const coordinator = newCoordinator({ onGenerationInvalidated: onInvalidated });
    const gen = coordinator.beginTurn("turn-x")!;
    const duplicate = coordinator.beginTurn("turn-x");

    expect(duplicate).toBeNull();
    expect(onInvalidated).not.toHaveBeenCalled(); // no teardown happened
    expect(coordinator.isCurrentGeneration(gen.generationId)).toBe(true);
  });
});

describe("GenerationCoordinator — cancelCurrent & registerAbort", () => {
  it("cancelCurrent invalidates and aborts", () => {
    const abort = vi.fn();
    const onInvalidated = vi.fn();
    const coordinator = newCoordinator({ onGenerationInvalidated: onInvalidated });
    coordinator.beginTurn("turn-1");
    coordinator.registerAbort(abort);

    coordinator.cancelCurrent("interrupt");
    expect(abort).toHaveBeenCalledTimes(1);
    expect(onInvalidated).toHaveBeenCalledWith(
      expect.objectContaining({ state: "invalidated" }),
      "interrupt",
      null,
    );
    expect(coordinator.currentGeneration?.state).toBe("invalidated");
  });

  it("unregister stops the callback from firing", () => {
    const abort = vi.fn();
    const coordinator = newCoordinator();
    coordinator.beginTurn("turn-1");
    const unregister = coordinator.registerAbort(abort);
    unregister();
    coordinator.cancelCurrent();
    expect(abort).not.toHaveBeenCalled();
  });

  it("a throwing abort callback never blocks the next generation", () => {
    const coordinator = newCoordinator();
    coordinator.beginTurn("turn-1");
    coordinator.registerAbort(() => {
      throw new Error("teardown exploded");
    });
    const genB = coordinator.beginTurn("turn-2");
    expect(genB).not.toBeNull();
    expect(coordinator.isCurrentGeneration(genB!.generationId)).toBe(true);
  });

  it("cancelCurrent with no active generation is a no-op", () => {
    const coordinator = newCoordinator();
    expect(() => coordinator.cancelCurrent()).not.toThrow();
    expect(coordinator.stats().invalidated).toBe(0);
  });
});

describe("GenerationCoordinator — system generations", () => {
  it("beginSystemGeneration creates a generation without consuming a turn", () => {
    const coordinator = newCoordinator();
    const greeting = coordinator.beginSystemGeneration();
    expect(greeting.kind).toBe("system");
    expect(greeting.turnId).toBeNull();
    expect(coordinator.stats().turns).toBe(0);
    expect(coordinator.stats().systemGenerations).toBe(1);
    expect(coordinator.isCurrentGeneration(greeting.generationId)).toBe(true);
  });

  it("a user turn invalidates a playing greeting (barge-in semantics)", () => {
    const onInvalidated = vi.fn();
    const coordinator = newCoordinator({ onGenerationInvalidated: onInvalidated });
    const greeting = coordinator.beginSystemGeneration();
    const turn = coordinator.beginTurn("turn-after-greeting")!;

    expect(coordinator.isCurrentGeneration(greeting.generationId)).toBe(false);
    expect(coordinator.isCurrentGeneration(turn.generationId)).toBe(true);
    expect(onInvalidated).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "system" }),
      "new-turn",
      turn.generationId,
    );
  });
});

describe("GenerationCoordinator — stats", () => {
  it("tracks lifecycle counters", () => {
    const coordinator = newCoordinator();
    coordinator.beginSystemGeneration(); // 1 system, replaced
    const a = coordinator.beginTurn("t1")!;
    coordinator.completeGeneration(); // completed
    coordinator.beginTurn("t2"); // replaces a (invalidated)
    coordinator.cancelCurrent("interrupt"); // invalidates current

    const stats = coordinator.stats();
    expect(stats.generations).toBe(3);
    expect(stats.turns).toBe(2);
    expect(stats.systemGenerations).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.invalidated).toBe(3); // greeting, a, t2's generation
    expect(stats.currentState).toBe("invalidated");
    expect(coordinator.isCurrentGeneration(a.generationId)).toBe(false);
  });
});
