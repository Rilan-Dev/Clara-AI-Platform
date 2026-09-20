/**
 * src/modules/assistant/core/voice/generation-playback.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generation-aware WebAudio playback queue (plan Task 2.3).
 *
 * Every queued audio item carries the generationId of the assistant
 * generation that produced it. Before an item is queued — and again before it
 * actually starts — the queue consults the GenerationCoordinator:
 *
 *     if (!coordinator.isCurrentGeneration(item.generationId)) discard();
 *
 * On interrupt the queue:
 *   1. clears every queued item;
 *   2. stops the currently playing source;
 *   3. invalidates the generation (via the coordinator);
 *   4. resets the speaking state.
 *
 * Acceptance (plan): start answer A → interrupt → start answer B → delayed
 * audio from A arrives → A's audio is never heard. Enforced both at enqueue
 * time AND at play time (a generation can go stale between the two).
 *
 * This is deliberately a small, testable class — no React, no provider
 * knowledge. The provider hooks own the AudioContext/AnalyserNode and pass
 * PCM16 in; the queue owns ordering + generation gating.
 */

import type { GenerationCoordinator } from "@/modules/voice-core/realtime/generation-coordinator";

export interface GenerationPlaybackEvents {
  /** Speaking-state transitions (idle ↔ playing). */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Fired whenever a stale item is discarded (telemetry / debugging). */
  onDiscarded?: (generationId: string, stage: "enqueue" | "play") => void;
}

interface QueueItem {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode;
  generationId: string;
}

export interface GenerationPlaybackInit {
  ctx: BaseAudioContext;
  coordinator: GenerationCoordinator;
  /** Output node; defaults to ctx.destination. */
  destination?: AudioNode;
  events?: GenerationPlaybackEvents;
}

export class GenerationPlaybackQueue {
  private readonly ctx: BaseAudioContext;
  private readonly coordinator: GenerationCoordinator;
  private readonly destination: AudioNode;
  private readonly events: GenerationPlaybackEvents;
  private queue: QueueItem[] = [];
  private playing = false;
  private playingItem: QueueItem | null = null;
  private notifiedPlaying: boolean | null = null;

  constructor(init: GenerationPlaybackInit) {
    this.ctx = init.ctx;
    this.coordinator = init.coordinator;
    this.destination = init.destination ?? init.ctx.destination;
    this.events = init.events ?? {};
  }

  get speaking(): boolean {
    return this.playing;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  /**
   * Queue one PCM16 chunk for a specific generation.
   * Returns false (and discards) when the generation is no longer current.
   */
  enqueue(pcm16: Int16Array, sourceSampleRate = 16_000, generationId: string): boolean {
    if (!this.coordinator.isCurrentGeneration(generationId)) {
      this.events.onDiscarded?.(generationId, "enqueue");
      return false;
    }
    if (pcm16.length === 0) return false;

    const floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) floats[i] = pcm16[i] / 32768;

    // PCM16 arrives at the provider's declared sample rate — honour it so
    // browsers running AudioContext at 48 kHz do not resample-speed the audio.
    const rate =
      Number.isFinite(sourceSampleRate) && sourceSampleRate > 0 ? sourceSampleRate : 16_000;
    const buffer = this.ctx.createBuffer(1, floats.length, rate);
    buffer.copyToChannel(floats, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);

    this.queue.push({ buffer, source, generationId });
    this.playNext();
    return true;
  }

  /**
   * Barge-in / user interrupt: clear the queue, stop the playing source,
   * invalidate the generation, reset speaking. Idempotent.
   */
  interrupt(): void {
    this.coordinator.cancelCurrent("interrupt");
    this.stopAllSources();
  }

  /** Session teardown: flush audio without touching coordinator state. */
  stop(): void {
    this.stopAllSources();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private playNext(): void {
    if (this.playing) return;
    const next = this.queue.shift();
    if (!next || this.ctx.state === "closed") {
      this.setPlaying(false);
      return;
    }

    // Play-time gate: the generation may have gone stale while this item sat
    // in the queue behind a longer one.
    if (!this.coordinator.isCurrentGeneration(next.generationId)) {
      this.events.onDiscarded?.(next.generationId, "play");
      try {
        next.source.disconnect();
      } catch {
        // already disconnected
      }
      this.playNext();
      return;
    }

    this.setPlaying(true);
    this.playingItem = next;
    next.source.onended = () => {
      this.playingItem = null;
      this.setPlaying(false);
      this.playNext();
    };
    try {
      next.source.start();
    } catch {
      // start() throws when the ctx closed between shift and start.
      this.setPlaying(false);
    }
  }

  private stopAllSources(): void {
    // The currently playing item was shifted out of the queue — stop it
    // explicitly (plan: "stop current source").
    const playingNow = this.playingItem;
    this.playingItem = null;
    const items = playingNow ? [playingNow, ...this.queue.splice(0)] : this.queue.splice(0);
    for (const item of items) {
      try {
        item.source.onended = null;
        item.source.stop();
      } catch {
        // source was never started
      }
      try {
        item.source.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.setPlaying(false);
  }

  private setPlaying(value: boolean): void {
    this.playing = value;
    if (this.notifiedPlaying === value) return;
    this.notifiedPlaying = value;
    this.events.onSpeakingChange?.(value);
  }
}
