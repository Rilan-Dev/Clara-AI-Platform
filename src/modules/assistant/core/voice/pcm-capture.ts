/**
 * src/modules/assistant/core/voice/pcm-capture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared mic → PCM16 capture wiring for the realtime voice pipelines.
 *
 * THE PITFALL THIS MODULE EXISTS FOR:
 * Web Audio is a PULL graph — the audio render thread only pulls data through
 * nodes that are (directly or indirectly) connected to the destination. A
 * ScriptProcessorNode wired ONLY to a source (mic) has nothing pulling it, so
 * `onaudioprocess` never fires in Safari and in current Chromium builds.
 * Production symptom (2026-09-20): the mic indicator is on, the realtime
 * socket is open, the assistant greets — but ZERO audio_input frames are ever
 * sent, the vendor VAD never sees speech, and no error surfaces anywhere.
 *
 * The canonical fix (same pattern as recorder.js / hark.js): route the
 * processor through a zero-gain tap into the destination. The render thread
 * then pulls through the processor, `onaudioprocess` fires, and the gain of 0
 * guarantees nothing is audible — no echo, no feedback loop.
 */

/** Convert Float32 [-1, 1] samples to little-endian PCM16 samples. */
export function floatToPcm16(input: Float32Array): Int16Array {
  const pcm16 = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm16;
}

export interface Pcm16Capture {
  /** The processor node (kept so callers can tear it down). */
  processor: ScriptProcessorNode;
  /** Disconnect the processor and its zero-gain tap. Idempotent. */
  stop: () => void;
}

/**
 * Wire `source` (mic MediaStreamSource) into a PCM16-emitting ScriptProcessor
 * that the render thread actually pulls. `onPcmFrame` receives raw PCM16
 * frames at the context's sample rate — convert/flush upstream.
 */
export function connectPcm16Capture(
  ctx: BaseAudioContext,
  source: AudioNode,
  onPcmFrame: (pcm16: Int16Array) => void,
): Pcm16Capture {
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = (audioEvent: AudioProcessingEvent) => {
    onPcmFrame(floatToPcm16(audioEvent.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);

  // Pull-through: processor → gain(0) → destination. Without a path to the
  // destination the graph is never pulled and onaudioprocess never fires.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(ctx.destination);

  return {
    processor,
    stop: () => {
      try { processor.onaudioprocess = null; } catch {}
      try { source.disconnect(processor); } catch {}
      try { processor.disconnect(mute); } catch {}
      try { mute.disconnect(ctx.destination); } catch {}
    },
  };
}

// ─── AudioWorklet capture (plan Task 5.4) ────────────────────────────────────

/** Shared worklet module: Float32 mic frames → Int16 posted messages. */
const PCM16_WORKLET_MODULE = "/worklets/audio-recorder-worklet.js";
const PCM16_WORKLET_PROCESSOR = "audio-recorder-worklet";

export interface WorkletPcm16Capture {
  /** The AudioWorkletNode (kept so callers can tear it down). */
  node: AudioWorkletNode;
  /** Detach the message handler and disconnect the node. Idempotent. */
  stop: () => void;
}

/**
 * Preferred realtime capture path: the shared AudioWorklet
 * (public/worklets/audio-recorder-worklet.js — the same module the Gemini
 * Live path loads). The worklet converts Float32 mic frames to PCM16 on the
 * audio render thread and posts them through its MessagePort, which:
 *   • removes the realtime path's dependency on ScriptProcessorNode;
 *   • runs off the main thread (no onaudioprocess main-thread jank);
 *   • delivers stable 128-frame render quanta instead of variable
 *     ScriptProcessor callbacks.
 *
 * The node's output is intentionally NOT connected anywhere — its sole
 * purpose is port.postMessage (same wiring as useGeminiLive; AudioWorklet
 * nodes with an active input keep processing without a destination tap).
 *
 * Falls back to connectPcm16Capture in the CALLER when addModule or the
 * AudioWorkletNode constructor is unavailable (engines without AudioWorklet).
 */
export async function connectWorkletPcm16Capture(
  ctx: AudioContext,
  source: AudioNode,
  onPcmFrame: (pcm16: Int16Array) => void,
  moduleUrl: string = PCM16_WORKLET_MODULE,
): Promise<WorkletPcm16Capture> {
  await ctx.audioWorklet.addModule(moduleUrl);
  const node = new AudioWorkletNode(ctx, PCM16_WORKLET_PROCESSOR);
  node.port.onmessage = (event: MessageEvent<Int16Array>) => {
    onPcmFrame(event.data);
  };
  source.connect(node);
  return {
    node,
    stop: () => {
      node.port.onmessage = null;
      try { node.disconnect(); } catch { /* already disconnected */ }
    },
  };
}
