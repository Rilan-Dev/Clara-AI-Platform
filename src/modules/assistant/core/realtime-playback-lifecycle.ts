/**
 * Content-free OpenAI WebRTC response lifecycle accounting.
 *
 * response.done is GENERATION completion, not audio playback completion.
 * A WebRTC audio turn is only delivered after output_audio_buffer.stopped.
 * Server events can arrive with some audio events absent; unknown is never
 * silently classified as a successful playback.
 * No transcript, prompt, audio bytes, identity or credentials are persisted.
 */
import { realtimeCompletionOutcome, type RealtimeCompletionStatus } from "./realtime-events";

export type PlaybackPhase =
  | "created" | "audio_started" | "audio_generated"
  | "generation_done" | "delivered" | "no_audio"
  | "incomplete" | "failed" | "cancelled" | "cleared" | "undrained";

export type PlaybackTransition = {
  phase: PlaybackPhase;
  responseId: string;
  turnId: string | null;
  status: RealtimeCompletionStatus;
  reason: string | null;
  hasAudio: boolean;
};

type Entry = {
  id: string;
  turnId: string | null;
  status: RealtimeCompletionStatus;
  reason: string | null;
  hasAudio: boolean;
  drained: boolean;
  finished: boolean;
  cleared: boolean;
};

const audioSignals = new Set([
  "response.output_audio.delta", "response.audio.delta",
  "response.output_audio.done", "response.audio.done",
  "output_audio_buffer.started",
]);

export class RealtimePlaybackLifecycle {
  private entries = new Map<string, Entry>();
  private lastId: string | null = null;
  private order: string[] = [];

  reset(): void {
    this.entries.clear();
    this.order = [];
    this.lastId = null;
  }

  get activeResponseId(): string | null {
    const id = this.lastId;
    return id && !this.entries.get(id)?.finished ? id : null;
  }

  get awaitingAudioDrain(): boolean {
    return [...this.entries.values()].some((e) => !e.finished && e.status === "completed" && e.hasAudio && !e.drained);
  }

  consume(event: Record<string, unknown>, currentTurnId: string | null): PlaybackTransition | null {
    const type = typeof event.type === "string" ? event.type : "";
    const payload = event.response && typeof event.response === "object"
      ? event.response as Record<string, unknown> : null;
    const responseId = typeof payload?.id === "string" ? payload.id
      : typeof event.response_id === "string" ? event.response_id : null;
    if (!responseId) return null;

    if (type === "response.created") {
      const entry: Entry = {
        id: responseId, turnId: currentTurnId, status: "unknown",
        reason: null, hasAudio: false, drained: false, finished: false, cleared: false,
      };
      if (!this.entries.has(responseId)) {
        this.order.push(responseId);
        if (this.order.length > 64) {
          const evicted = this.order.shift();
          if (evicted) this.entries.delete(evicted);
        }
      }
      this.entries.set(responseId, entry);
      this.lastId = responseId;
      return this.result(entry, "created");
    }

    const entry = this.entries.get(responseId);
    if (!entry) return null;

    if (audioSignals.has(type)) {
      entry.hasAudio = true;
      return this.result(entry, type === "output_audio_buffer.started" ? "audio_started" : "audio_generated");
    }

    if (type === "output_audio_buffer.cleared") {
      if (entry.finished) return null;
      entry.cleared = true;
      entry.finished = true;
      return this.result(entry, "cleared");
    }

    if (type === "output_audio_buffer.stopped") {
      entry.drained = true;
      if (entry.finished || entry.status !== "completed") return null;
      entry.finished = true;
      return this.result(entry, "delivered");
    }

    if (type === "response.done") {
      const outcome = realtimeCompletionOutcome(payload);
      entry.status = outcome.status;
      entry.reason = outcome.reason;
      if (entry.finished) return null;
      if (outcome.status !== "completed") {
        entry.finished = true;
        return this.result(entry,
          outcome.status === "incomplete" ? "incomplete" :
          outcome.status === "failed" ? "failed" : "cancelled");
      }
      if (!entry.hasAudio) {
        entry.finished = true;
        return this.result(entry, "no_audio");
      }
      if (entry.drained) {
        entry.finished = true;
        return this.result(entry, "delivered");
      }
      return this.result(entry, "generation_done");
    }
    return null;
  }

  /** A watchdog may report missing buffer-drained after the provider finished.
   * Do not call this a successful delivery and never resend automatically. */
  timeoutUndrained(responseId: string): PlaybackTransition | null {
    const entry = this.entries.get(responseId);
    if (!entry || entry.finished || entry.status !== "completed" ||
        !entry.hasAudio || entry.drained) return null;
    entry.finished = true;
    return this.result(entry, "undrained");
  }

  private result(entry: Entry, phase: PlaybackPhase): PlaybackTransition {
    return {
      phase, responseId: entry.id, turnId: entry.turnId,
      status: entry.status, reason: entry.reason, hasAudio: entry.hasAudio,
    };
  }
}
