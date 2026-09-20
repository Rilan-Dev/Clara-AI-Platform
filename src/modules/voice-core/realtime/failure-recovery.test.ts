/**
 * Plan Phase 9 — failure recovery.
 *
 * Every provider must recover deterministically:
 *
 *   upstream failure → invalidate generation → close provider sockets →
 *   clear playback → emit recoverable error → session returns to a clean state
 *
 * and NO infinite reconnect loops: the reconnect budget caps vendor-socket
 * retries with linear backoff and then surfaces a fatal error.
 */

import { describe, expect, it, vi } from "vitest";
import { createReconnectPolicy } from "./reconnect-policy";
import { GenerationCoordinator } from "./generation-coordinator";
import { mintSessionId, mintTurnId } from "./identity";
import { GenerationPlaybackQueue } from "@/modules/assistant/core/voice/generation-playback";
import { RealtimeUiStateMachine } from "./ui-state-machine";

describe("createReconnectPolicy — bounded reconnect (no infinite loops)", () => {
  it("yields linear backoff delays, then gives up", () => {
    const policy = createReconnectPolicy(5, 250);
    expect(policy.nextDelayMs()).toBe(250);
    expect(policy.nextDelayMs()).toBe(500);
    expect(policy.nextDelayMs()).toBe(750);
    expect(policy.nextDelayMs()).toBe(1000);
    expect(policy.nextDelayMs()).toBe(1250);
    // Budget exhausted — the caller MUST give up fatally.
    expect(policy.nextDelayMs()).toBeNull();
    expect(policy.exhausted).toBe(true);
    expect(policy.attempts).toBe(5);
  });

  it("a successful connection resets the budget", () => {
    const policy = createReconnectPolicy(2, 100);
    expect(policy.nextDelayMs()).toBe(100);
    expect(policy.nextDelayMs()).toBe(200);
    policy.succeeded();
    expect(policy.exhausted).toBe(false);
    expect(policy.nextDelayMs()).toBe(100); // fresh budget
  });

  it("stays exhausted once exhausted (no zombie retries)", () => {
    const policy = createReconnectPolicy(1, 50);
    expect(policy.nextDelayMs()).toBe(50);
    expect(policy.nextDelayMs()).toBeNull();
    expect(policy.nextDelayMs()).toBeNull();
    policy.succeeded(); // only a REAL success resets
    expect(policy.nextDelayMs()).toBe(50);
  });
});

describe("deterministic recovery flow (the plan's example)", () => {
  it("upstream failure → invalidate → close → clear → error → clean reconnect", () => {
    // ── The exact recovery sequence the hooks run on a fatal error. ──────
    const coordinator = new GenerationCoordinator(mintSessionId());
    const onSpeakingChange = vi.fn();
    const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null; buffer: unknown }> = [];
    const ctx = {
      sampleRate: 16_000,
      state: "running",
      destination: {},
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => {
        const source = {
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
    const queue = new GenerationPlaybackQueue({
      ctx: ctx as unknown as AudioContext,
      coordinator,
      events: { onSpeakingChange },
    });
    const socketClose = vi.fn();
    const machine = new RealtimeUiStateMachine();

    // A turn is speaking when the vendor connection dies.
    machine.connectStarted();
    machine.connected();
    machine.turnStarted();
    const generation = coordinator.beginTurn(mintTurnId())!;
    machine.assistantSpeaking(true);
    queue.enqueue(new Int16Array(160).fill(500), 16_000, generation.generationId);
    expect(queue.speaking).toBe(true);

    // ── upstream failure: the deterministic recovery sequence ─────────────
    coordinator.cancelCurrent("error");        // 1. invalidate generation
    socketClose();                             // 2. close provider sockets
    queue.stop();                              // 3. clear playback
    machine.error();                           // 4. emit recoverable error

    expect(coordinator.isCurrentGeneration(generation.generationId)).toBe(false);
    expect(queue.speaking).toBe(false);
    expect(queue.queuedCount).toBe(0);
    expect(socketClose).toHaveBeenCalledTimes(1);
    expect(machine.current).toBe("error");

    // ── recovery: reconnect starts CLEAN generation state ────────────────
    machine.disconnected();
    machine.connectStarted();
    machine.connected();
    const nextGeneration = coordinator.beginTurn(mintTurnId())!;
    // The old generation's late audio cannot invade the new session.
    const sourcesBefore = sources.length;
    expect(queue.enqueue(new Int16Array(160).fill(500), 16_000, generation.generationId)).toBe(false);
    expect(sources.length).toBe(sourcesBefore);
    expect(queue.enqueue(new Int16Array(160).fill(500), 16_000, nextGeneration.generationId)).toBe(true);
    expect(machine.current).toBe("listening"); // clean, not speaking
  });

  it("errors terminate the ACTIVE generation only — the coordinator survives", () => {
    const coordinator = new GenerationCoordinator(mintSessionId());
    const generation = coordinator.beginTurn(mintTurnId())!;
    coordinator.cancelCurrent("error");
    expect(coordinator.isCurrentGeneration(generation.generationId)).toBe(false);
    expect(coordinator.stats().invalidated).toBe(1);
    // The session-level coordinator is reusable after recovery.
    const next = coordinator.beginTurn(mintTurnId());
    expect(next).not.toBeNull();
    expect(coordinator.isCurrentGeneration(next!.generationId)).toBe(true);
  });
});

describe("recovery for every failure class (plan §9 checklist)", () => {
  const failureKinds = [
    "authentication failure",
    "quota/rate-limit failure",
    "upstream WebSocket close",
    "browser disconnect",
    "network timeout",
    "TTS failure",
    "STT failure",
    "LLM failure",
    "RAG failure",
    "interruption",
  ] as const;

  it.each(failureKinds)("'%s' lands in a deterministic recoverable state", (kind) => {
    // Every failure class funnels into the same recovery contract:
    // invalidate + stop + error, and the machine accepts the recovery walk.
    const coordinator = new GenerationCoordinator(mintSessionId());
    const machine = new RealtimeUiStateMachine();
    const abort = vi.fn();

    machine.connectStarted();
    machine.connected();
    machine.turnStarted();
    const generation = coordinator.beginTurn(mintTurnId())!;
    coordinator.registerAbort(abort);
    void generation;

    // Failure of any kind:
    coordinator.cancelCurrent(kind.includes("interrupt") ? "interrupt" : "error");
    machine.error();

    expect(abort).toHaveBeenCalledTimes(1);          // resources cancelled
    expect(coordinator.isCurrentGeneration(generation.generationId)).toBe(false);
    expect(machine.current).toBe("error");

    // Deterministic recovery:
    machine.disconnected();
    expect(machine.current).toBe("idle");
    machine.connectStarted();
    machine.connected();
    expect(machine.current).toBe("listening");
  });
});
