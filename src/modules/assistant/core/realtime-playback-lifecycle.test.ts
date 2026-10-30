import { describe, expect, it } from "vitest";
import { RealtimePlaybackLifecycle } from "./realtime-playback-lifecycle";

function created(id = "r1") {
  return { type: "response.created", response: { id, status: "in_progress" } };
}
function done(id: string, status: string, reason?: string) {
  return { type: "response.done", response: {
    id, status, status_details: reason ? { reason } : null,
  } };
}
function started(id = "r1") {
  return { type: "output_audio_buffer.started", response_id: id };
}
function stopped(id = "r1") {
  return { type: "output_audio_buffer.stopped", response_id: id };
}

describe("WebRTC playback lifecycle — no premature completion", () => {
  it("waits for audio buffer drain after response.done completed", () => {
    const monitor = new RealtimePlaybackLifecycle();
    expect(monitor.consume(created(), "turn-1")?.phase).toBe("created");
    monitor.consume(started(), null);
    expect(monitor.consume(done("r1", "completed"), null)?.phase).toBe("generation_done");
    expect(monitor.awaitingAudioDrain).toBe(true);
    expect(monitor.consume(stopped(), "turn-2")).toMatchObject({
      phase: "delivered", turnId: "turn-1", responseId: "r1",
    });
    expect(monitor.awaitingAudioDrain).toBe(false);
    expect(monitor.consume(stopped(), "turn-2")).toBeNull();
  });

  it("does not report an incomplete, cancelled or failed generation as delivered", () => {
    for (const status of ["incomplete", "cancelled", "failed"]) {
      const m = new RealtimePlaybackLifecycle();
      m.consume(created(), "turn");
      m.consume(started(), "turn");
      expect(m.consume(done("r1", status, "max_output_tokens"), null)).toMatchObject({
        phase: status, reason: "max_output_tokens", turnId: "turn",
      });
      expect(m.consume(stopped(), null)).toBeNull();
    }
  });

  it("recognizes VAD buffer clearing without inventing playback success", () => {
    const m = new RealtimePlaybackLifecycle();
    m.consume(created(), "turn-1");
    m.consume(started(), "turn-1");
    expect(m.consume({ type: "output_audio_buffer.cleared", response_id: "r1" }, null)?.phase)
      .toBe("cleared");
    expect(m.consume(done("r1", "cancelled"), null)).toBeNull();
  });

  it("keeps two response IDs and turn IDs isolated", () => {
    const m = new RealtimePlaybackLifecycle();
    m.consume(created("r1"), "turn-1");
    m.consume(started("r1"), "turn-1");
    m.consume(created("r2"), "turn-2");
    m.consume(started("r2"), "turn-2");
    expect(m.consume(done("r1", "completed"), null)?.turnId).toBe("turn-1");
    expect(m.consume(done("r2", "completed"), null)?.turnId).toBe("turn-2");
    expect(m.consume(stopped("r1"), null)?.turnId).toBe("turn-1");
    expect(m.consume(stopped("r2"), null)?.turnId).toBe("turn-2");
  });

  it("a tool-only response completes without waiting for audio", () => {
    const m = new RealtimePlaybackLifecycle();
    m.consume(created(), "turn");
    expect(m.consume(done("r1", "completed"), null)?.phase).toBe("no_audio");
  });

  it("unknown payloads and out-of-order responses never generate phantom success", () => {
    const m = new RealtimePlaybackLifecycle();
    expect(m.consume(done("absent", "completed"), null)).toBeNull();
    expect(m.consume({ type: "output_audio_buffer.stopped" }, null)).toBeNull();
    m.consume(created(), "turn");
    m.consume({ type: "response.output_audio.delta", response_id: "r1" }, null);
    expect(m.consume(done("r1", "not-a-real-status"), null)?.phase).toBe("cancelled");
  });

  it("reset drops prior session identities", () => {
    const m = new RealtimePlaybackLifecycle();
    m.consume(created(), "turn");
    m.consume(started(), "turn");
    m.reset();
    expect(m.consume(stopped(), "new")).toBeNull();
    expect(m.activeResponseId).toBeNull();
  });
});
