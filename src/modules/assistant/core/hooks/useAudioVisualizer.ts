"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * useAudioVisualizer
 *
 * Creates a Web Audio analyser attached to a MediaStream, AudioNode, or an
 * existing AnalyserNode and returns 24 normalised frequency-band levels (0…1)
 * at ~60 fps for rendering.
 *
 * ── Accepting an existing AnalyserNode (FIX Bug 4) ───────────────────────────
 *
 * Gemini plays audio internally via its own AudioContext (24 kHz playback
 * context in useGeminiLive).  That hook now wires all PCM buffer sources
 * through a dedicated AnalyserNode before the destination so real frequency
 * data is available.  It exposes this node as `outputAnalyserNode`.
 *
 * The problem with the previous approach (passing the node as a generic
 * AudioNode):
 *
 *   • This hook always created its OWN AudioContext, then called
 *     `inputNode.connect(newAnalyser)`.
 *   • Connecting a node to an analyser in a DIFFERENT AudioContext is
 *     forbidden by the Web Audio spec — browsers throw a
 *     "NotSupportedError: Cannot connect to a destination belonging to a
 *     different audio context" DOMException.
 *
 * Fix: detect when the input is already an AnalyserNode and short-circuit
 * directly to the read loop on that node, skipping AudioContext creation
 * entirely.  This is the only safe path for cross-context visualisation.
 *
 * ── P10 FIX: Skip setLevels() when bars haven't meaningfully changed ──────────
 *
 * Old behaviour: setLevels(bars) was called unconditionally on every
 * requestAnimationFrame tick (~60 times per second). During silence — which is
 * the majority of voice session time — getByteFrequencyData() fills the array
 * with zeros, producing the same 24-element all-zero array every single frame.
 * Each setLevels() call triggered a React state update, a diff, and a re-render
 * of every component consuming `levels`. That is 60 wasted re-renders per second
 * for as long as the visualiser is mounted and silent.
 *
 * Fix: compare the newly computed bars against the previous frame's values.
 * If no bar has changed by more than CHANGE_THRESHOLD (0.005 — invisible to the
 * human eye at the bar's pixel resolution), skip the state update entirely.
 * During active audio the bars change on every frame, so the visualiser still
 * updates at full 60 fps. During silence the rAF loop still runs (maintaining
 * correct timing when audio resumes) but produces zero React renders.
 *
 * ── AudioContext user-gesture guard (pre-existing) ────────────────────────────
 *
 * Browsers enforce an "autoplay policy" for the Web Audio API: constructing
 * an AudioContext before a user gesture leaves it in "suspended" state.
 * After construction we always call ac.resume(). If that is blocked we attach
 * a one-time document gesture listener and retry on the next interaction.
 * The cleanup function calls ac.close() to prevent "too many contexts" warnings.
 */

/** Minimum per-bar change required to trigger a state update (0–1 scale). */
const CHANGE_THRESHOLD = 0.005;

/** Number of frequency bands shown by the visualiser. */
const NUM_BARS = 24;

/** Shared bar-computation logic used by both code paths. */
function computeBars(
  analyser: AnalyserNode,
  data: Uint8Array,
  prevLevels: number[]
): { bars: number[]; changed: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (analyser as any).getByteFrequencyData(data);
  const group = Math.floor(data.length / NUM_BARS);
  const bars: number[] = [];
  let changed = false;

  for (let i = 0; i < NUM_BARS; i++) {
    let sum = 0;
    const start = i * group;
    const end   = i === NUM_BARS - 1 ? data.length : (i + 1) * group;
    for (let j = start; j < end; j++) sum += data[j]!;
    const avg = sum / (end - start || 1);
    const level = Math.max(0, Math.min(1, avg / 255));
    bars.push(level);

    if (!changed && Math.abs(level - (prevLevels[i] ?? 0)) > CHANGE_THRESHOLD) {
      changed = true;
    }
  }

  return { bars, changed };
}

export function useAudioVisualizer(input?: AnalyserNode | MediaStream | AudioNode | null) {
  const [levels, setLevels] = useState<number[]>(() => Array(NUM_BARS).fill(0));

  // Stores the bars from the previous rAF tick so we can skip identical frames.
  const prevLevelsRef = useRef<number[]>(Array(NUM_BARS).fill(0));

  const contextRef  = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const source = useMemo(() => input ?? null, [input]);

  useEffect(() => {
    if (!source) return;

    // ── FIX Bug 4: AnalyserNode fast-path ────────────────────────────────────
    //
    // When the caller provides an existing AnalyserNode (e.g. Gemini's
    // playback-chain analyser from useGeminiLive), use it directly without
    // creating a new AudioContext.
    //
    // WHY: Web Audio forbids connecting a node to an analyser belonging to a
    // different AudioContext — browsers throw NotSupportedError.  Gemini's
    // AnalyserNode lives in the playback AudioContext (24 kHz), not in a new
    // one this hook would create.  The correct solution is to read from the
    // already-configured analyser without any additional connection.
    if (source instanceof AnalyserNode) {
      const analyser = source;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;

      const tick = () => {
        const { bars, changed } = computeBars(analyser, data, prevLevelsRef.current);
        if (changed) {
          prevLevelsRef.current = bars;
          setLevels(bars);
        }
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(raf);
        // Reset to silence when the analyser is removed.
        setLevels(Array(NUM_BARS).fill(0));
        prevLevelsRef.current = Array(NUM_BARS).fill(0);
      };
    }

    // ── Original path: MediaStream or generic AudioNode ───────────────────────
    const win = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) {
      console.warn("[useAudioVisualizer] AudioContext is not available in this environment.");
      return;
    }

    const ac = new AudioContextCtor();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;

    // ── AudioContext user-gesture guard ──────────────────────────────────────
    let gestureListenerCleanup: (() => void) | null = null;

    const tryResume = () => {
      if (ac.state === "running") return;
      void ac.resume().catch(() => {
        // Still blocked — will retry on next user gesture.
      });
    };

    if (ac.state !== "running") {
      void ac.resume().catch(() => {
        const events = ["click", "keydown", "touchstart"] as const;
        const onGesture = () => {
          tryResume();
          events.forEach((evt) => document.removeEventListener(evt, onGesture));
          gestureListenerCleanup = null;
        };
        events.forEach((evt) =>
          document.addEventListener(evt, onGesture, { once: true, passive: true })
        );
        gestureListenerCleanup = () => {
          events.forEach((evt) => document.removeEventListener(evt, onGesture));
        };
      });
    }

    let srcNode:   MediaStreamAudioSourceNode | null = null;
    let inputNode: AudioNode | null = null;
    let initialized = false;
    let removeTrackHandler: (() => void) | null = null;

    const tryInitSource = () => {
      if (initialized) return;
      if (source instanceof MediaStream) {
        if (source.getAudioTracks().length === 0) return;
        srcNode = ac.createMediaStreamSource(source);
        srcNode.connect(analyser);
        initialized = true;
        tryResume();
      } else if (source) {
        inputNode = source as AudioNode;
        inputNode.connect(analyser);
        initialized = true;
        tryResume();
      }
    };

    if (source instanceof MediaStream) {
      tryInitSource();
      const onAddTrack = () => tryInitSource();
      source.addEventListener("addtrack", onAddTrack);
      removeTrackHandler = () =>
        source.removeEventListener("addtrack", onAddTrack);
    } else {
      tryInitSource();
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      const { bars, changed } = computeBars(analyser, data, prevLevelsRef.current);
      if (changed) {
        prevLevelsRef.current = bars;
        setLevels(bars);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    contextRef.current  = ac;
    analyserRef.current = analyser;

    return () => {
      cancelAnimationFrame(raf);
      if (gestureListenerCleanup) gestureListenerCleanup();
      if (removeTrackHandler)     removeTrackHandler();
      try { analyser.disconnect(); } catch {}
      try { srcNode?.disconnect();  } catch {}
      try { inputNode?.disconnect(); } catch {}
      try { ac.close();              } catch {}
      contextRef.current  = null;
      analyserRef.current = null;
    };
  }, [source]);

  return levels;
}
