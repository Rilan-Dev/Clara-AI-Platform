"use client";

/**
 * src/features/agent-conversation/hooks/use-mic-visualizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Visualisation-only microphone capture for the USER-SPEAKING orb state.
 *
 * The provider voice hooks own the production mic capture (AudioWorklet PCM
 * pipeline) and none of them expose an input AnalyserNode uniformly across
 * the seven transports. Rather than touching all of them, this hook opens a
 * SECOND, visualisation-only getUserMedia stream while a voice session is
 * active and feeds it through the existing useAudioVisualizer — browsers
 * allow multiple consumers of the same device (no second permission prompt,
 * the permission was already granted by the session start click) and the
 * default echoCancellation keeps the agent's speaker output from bleeding
 * into the user-level read.
 *
 * The stream is opened lazily (only while `active`) and every track is
 * stopped on cleanup so the mic indicator in the browser tab turns off.
 */

import { useEffect, useState } from "react";
import { useAudioVisualizer } from "@/modules/assistant/core/hooks/useAudioVisualizer";

export function useMicVisualizer(active: boolean): { levels: number[]; error: string | null } {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let cancelled = false;
    let current: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        current = s;
        setStream(s);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Microphone unavailable");
      });

    return () => {
      cancelled = true;
      current?.getTracks().forEach((track) => track.stop());
      current = null;
      setStream(null);
    };
  }, [active]);

  const levels = useAudioVisualizer(stream);
  return { levels, error };
}
