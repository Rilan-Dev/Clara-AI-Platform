"use client";

/**
 * src/features/agent-conversation/hooks/use-voice-chat-speech.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * VOICE CHAT inside the chat window — the turn-based STT → chat → TTS
 * pipeline (the agent's "Voice Chat" capability in AI settings):
 *
 *   dictate  → MediaRecorder utterance → POST /api/voice/{provider}/transcribe
 *              (surface "voice_chat": Voice Chat provider + STT model)
 *   listen   → POST /api/voice/{provider}/tts per sentence batch
 *              (surface "voice_chat": Voice Chat TTS model + speaker)
 *
 * This is deliberately separate from the realtime voice agent, which
 * streams over WebSockets (useVoiceClient). Providers that serve the
 * voice_chat capability with one-shot STT/TTS — Sarvam (Saaras / Bulbul)
 * and ElevenLabs (Scribe / TTS) — are supported; for any other resolved
 * provider `supported` is false and the chat window shows no controls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { sarvamSpeechLanguage } from "@/modules/assistant/core/language-policy";
import { sanitizeTtsText } from "@/modules/voice-core/tts-text";

export type VoiceChatProvider = "sarvam" | "elevenlabs";
export type DictationState = "idle" | "recording" | "transcribing";

const SUPPORTED_PROVIDERS = new Set<string>(["sarvam", "elevenlabs"]);
/** Saaras / Scribe one-shot requests cap an utterance at ~30 s. */
const MAX_DICTATION_MS = 29_000;
/** Per-request text budget (well under both vendors' per-call caps). */
const TTS_CHUNK_CHARS = 400;
/** Both TTS routes return PCM16 mono at 16 kHz unless they say otherwise. */
const PCM_SAMPLE_RATE = 16_000;

export function isVoiceChatProvider(value: string | null | undefined): value is VoiceChatProvider {
  return Boolean(value && SUPPORTED_PROVIDERS.has(value));
}

/** Split speakable text into sentence-aligned request chunks. */
export function chunkForSpeech(text: string, maxChars = TTS_CHUNK_CHARS): string[] {
  const sentences = text.match(/[^.!?।॥\n]+[.!?।॥]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > maxChars) {
      for (let i = 0; i < sentence.length; i += maxChars) chunks.push(sentence.slice(i, i + maxChars).trim());
      continue;
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export interface UseVoiceChatSpeechOptions {
  kbId: string | null;
  /** Resolved Voice Chat provider for this agent (voice_chat axis). */
  provider: string | null | undefined;
  /** Voice disabled by runtime settings / plan. */
  enabled?: boolean;
  embedApiKey?: string;
  draftMode?: boolean;
  /** Called when a dictation reaches the vendor's one-shot length cap. */
  onDictationLimit?: () => void;
}

export function useVoiceChatSpeech({ kbId, provider, enabled = true, embedApiKey, draftMode, onDictationLimit }: UseVoiceChatSpeechOptions) {
  const supported = Boolean(kbId) && enabled && isVoiceChatProvider(provider);
  const [dictation, setDictation] = useState<DictationState>("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const speakAbortRef = useRef<AbortController | null>(null);
  const onLimitRef = useRef(onDictationLimit);
  useEffect(() => { onLimitRef.current = onDictationLimit; }, [onDictationLimit]);

  const headers = useCallback(async (extra: Record<string, string> = {}): Promise<HeadersInit> => {
    if (embedApiKey) return { ...extra, Authorization: `Bearer ${embedApiKey}` };
    const { withAuthHeaders } = await import("@/lib/client-auth");
    return withAuthHeaders(extra);
  }, [embedApiKey]);

  // ── Listen (TTS) ──────────────────────────────────────────────────────────

  const stopSpeaking = useCallback(() => {
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch {}
    }
    sourcesRef.current = [];
    setSpeakingId(null);
  }, []);

  const decode = useCallback(async (ctx: AudioContext, response: Response): Promise<AudioBuffer | null> => {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 2) return null;
    const type = response.headers.get("Content-Type") ?? "";
    if (/wav|mpeg|mp3|ogg|webm/i.test(type)) return ctx.decodeAudioData(bytes);
    const pcm = new Int16Array(bytes, 0, Math.floor(bytes.byteLength / 2));
    const buffer = ctx.createBuffer(1, pcm.length, PCM_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    return buffer;
  }, []);

  const speak = useCallback(async (messageId: string, rawText: string) => {
    if (!supported || !kbId || !provider) return;
    stopSpeaking();
    const text = sanitizeTtsText(rawText);
    if (!text) return;
    const controller = new AbortController();
    speakAbortRef.current = controller;
    setSpeakingId(messageId);
    setError(null);

    try {
      const AudioCtx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;
      await ctx.resume();
      const { apiUrl } = await import("@/lib/runtime");
      const requestHeaders = await headers({ "Content-Type": "application/json" });

      const fetchChunk = (chunk: string) =>
        fetch(apiUrl(`/api/voice/${provider}/tts`), {
          method: "POST",
          headers: requestHeaders,
          signal: controller.signal,
          body: JSON.stringify({
            kbId,
            text: chunk,
            surface: "voice_chat",
            // Sarvam voices each chunk in its own language (Bulbul needs a
            // concrete target language); ElevenLabs multilingual models
            // detect it from the text.
            ...(provider === "sarvam" && sarvamSpeechLanguage(chunk, "") ? { language: sarvamSpeechLanguage(chunk, "") } : {}),
            ...(draftMode ? { scope: "draft" } : {}),
          }),
        });

      // Pipelined: the next chunk is synthesising while the current plays.
      const chunks = chunkForSpeech(text);
      let pending = chunks.length > 0 ? fetchChunk(chunks[0]) : null;
      let startAt = ctx.currentTime;
      let last: AudioBufferSourceNode | null = null;
      for (let i = 0; i < chunks.length && pending; i++) {
        const response = await pending;
        pending = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]) : null;
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(payload.message ?? payload.error ?? `Speech failed (HTTP ${response.status})`);
        }
        const buffer = await decode(ctx, response);
        if (controller.signal.aborted) return;
        if (!buffer) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        startAt = Math.max(startAt, ctx.currentTime);
        source.start(startAt);
        startAt += buffer.duration;
        sourcesRef.current.push(source);
        last = source;
      }
      if (last) {
        last.onended = () => {
          if (speakAbortRef.current === controller) {
            speakAbortRef.current = null;
            sourcesRef.current = [];
            setSpeakingId(null);
          }
        };
      } else if (speakAbortRef.current === controller) {
        setSpeakingId(null);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      if (speakAbortRef.current === controller) {
        speakAbortRef.current = null;
        setSpeakingId(null);
      }
    }
  }, [decode, draftMode, headers, kbId, provider, stopSpeaking, supported]);

  // ── Dictate (STT) ─────────────────────────────────────────────────────────

  const releaseMic = useCallback(() => {
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopDictation = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || !kbId || !provider) {
      releaseMic();
      setDictation("idle");
      return null;
    }
    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    releaseMic();
    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (blob.size === 0) {
      setDictation("idle");
      return null;
    }

    setDictation("transcribing");
    try {
      const { apiUrl } = await import("@/lib/runtime");
      const form = new FormData();
      form.append("kbId", kbId);
      form.append("audio", blob, mimeType.includes("mp4") ? "dictation.mp4" : "dictation.webm");
      form.append("surface", "voice_chat");
      if (draftMode) form.append("scope", "draft");
      const response = await fetch(apiUrl(`/api/voice/${provider}/transcribe`), {
        method: "POST",
        headers: await headers(),
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Transcription failed (HTTP ${response.status})`);
      return payload.text?.trim() || null;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setDictation("idle");
    }
  }, [draftMode, headers, kbId, provider, releaseMic]);

  const startDictation = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    stopSpeaking();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setDictation("recording");
      // Vendor one-shot cap — the caller finishes (transcribes) the turn.
      autoStopRef.current = window.setTimeout(() => {
        autoStopRef.current = null;
        onLimitRef.current?.();
      }, MAX_DICTATION_MS);
    } catch (err) {
      releaseMic();
      setDictation("idle");
      setError(
        (err as Error).name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser to dictate."
          : (err as Error).message,
      );
    }
  }, [releaseMic, stopSpeaking, supported]);

  const cancelDictation = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch {}
    chunksRef.current = [];
    releaseMic();
    setDictation("idle");
  }, [releaseMic]);

  useEffect(() => () => {
    cancelDictation();
    stopSpeaking();
    try { void audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
  }, [cancelDictation, stopSpeaking]);

  return {
    supported,
    provider: supported ? (provider as VoiceChatProvider) : null,
    dictation,
    speakingId,
    error,
    clearError: () => setError(null),
    startDictation,
    stopDictation,
    cancelDictation,
    speak,
    stopSpeaking,
  } as const;
}

export type VoiceChatSpeech = ReturnType<typeof useVoiceChatSpeech>;
