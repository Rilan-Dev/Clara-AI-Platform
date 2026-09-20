"use client";

/**
 * src/modules/assistant/core/hooks/useSarvamVoice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sarvam Indic voice pipeline (Mode A) — Saaras STT + platform RAG/chat +
 * Bulbul TTS, with the V5 REALTIME STT upgrade.
 *
 *   REALTIME mode (session.stt.realtime present — SARVAM_REALTIME_STT_ENABLED):
 *     mic ──(PCM16 frames, base64)──► /api/voice/sarvam/realtime  (platform relay)
 *          relay ⇄ Saaras realtime WS
 *          transcript_partial ──► live captions + EARLY barge-in
 *          transcript_final  ──► chat turn
 *     answer tokens ──(sentence-chunked)──► /api/voice/sarvam/tts (Bulbul PCM16)
 *     PCM16 audio ──► queued AudioBufferSourceNodes ──► speakers
 *
 *   UTTERANCE mode (fallback — identical shape to useElevenLabsVoice):
 *     mic ──(webm/opus utterances)──► /api/voice/sarvam/transcribe (Saaras REST)
 *     text ▼ /api/chat ▼ sentence-chunked TTS ▼ playback queue
 *
 * Data boundary: only user audio (STT) and answer text (TTS) cross to Sarvam
 * — through platform endpoints only. The vendor key never reaches the
 * browser (the relay holds it server-side). Documents/KBs never leave.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Source } from "../models";
import type { VoiceStatus, VoiceTurn } from "../voice/types";
import type { VoiceClientOptions } from "../voice/types";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { streamChatCompletion } from "../../client/stream";
import { splitSentences } from "../voice/sentence-split";
import { connectPcm16Capture, type Pcm16Capture } from "../voice/pcm-capture";
import { isNonSpeechTranscript, sanitizeTtsText } from "@/modules/voice-core/tts-text";

// ─── VAD tuning (utterance mode — mirrors useElevenLabsVoice) ──────────────
const VAD_THRESHOLD = 0.02;
const VAD_START_FRAMES = 6;
const VAD_SILENCE_MS = 700;

// ─── Realtime mode tuning ────────────────────────────────────────────────────
/** How often captured PCM frames are flushed upstream (~100 ms batches). */
const REALTIME_FLUSH_MS = 100;
/** Sarvam fast realtime STT rejects a single audio frame above 16000 bytes. */
const REALTIME_MAX_FRAME_BYTES = 16_000;

type SessionPayload = {
  mode: "pipeline";
  stt: {
    endpoint: string;
    model: string;
    language: string;
    sampleRate: number;
    maxAudioSeconds: number;
    realtime?: {
      endpoint: string;
      token: string;
      sampleRate: number;
      encoding: string;
      vadSilenceMs: number;
    };
  };
  tts: {
    endpoint: string;
    model: string;
    speaker: string;
    outputFormat: string;
    language: string;
  };
  chat: { endpoint: string; kbId: string | null; ragMode: string };
  kbId: string | null;
};

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a ws:// / wss:// URL on the CURRENT origin (CSP: connect-src 'self'
 *  wss: is already allowed — the vendor host never appears in the browser). */
function realtimeWsUrl(endpoint: string, token: string): string {
  const apiBase = apiUrl(endpoint); // absolute or same-origin path
  const url = new URL(apiBase, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

export function useSarvamVoice(options: VoiceClientOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [outputAnalyserNode, setOutputAnalyserNode] = useState<AnalyserNode | null>(null);

  // Auth: platform JWT or the clr_ embed key (public /embed/voice + widget).
  const pipelineHeaders = useCallback(
    (extra: Record<string, string> = {}): HeadersInit =>
      options.embedApiKey
        ? { ...extra, Authorization: `Bearer ${options.embedApiKey}` }
        : withAuthHeaders(extra),
    [options.embedApiKey],
  );

  const sessionRef = useRef<SessionPayload | null>(null);
  const connectTokenRef = useRef(0);

  // Capture chain (both modes)
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureChunksRef = useRef<Blob[]>([]);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const speechFramesRef = useRef(0);
  const lastVoiceMsRef = useRef(0);
  const speakingUserRef = useRef(false);
  const utteranceActiveRef = useRef(false);

  // Realtime mode state
  const realtimeWsRef = useRef<WebSocket | null>(null);
  const realtimeCaptureRef = useRef<Pcm16Capture | null>(null);
  const realtimePcmBufferRef = useRef<Int16Array[]>([]);
  const realtimeFlushTimerRef = useRef<number | null>(null);
  const realtimeSilenceWarnedRef = useRef(false);
  const partialQuestionRef = useRef("");
  const partialTurnRef = useRef<VoiceTurn | null>(null);
  const bargeInArmedRef = useRef(false);
  const realtimeTtsWsRef = useRef<WebSocket | null>(null);
  const realtimeTtsQueueRef = useRef<string[]>([]);
  const realtimeTtsConnectingRef = useRef(false);
  const realtimeTtsGenerationRef = useRef<string | null>(null);

  // Playback chain (both modes)
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackQueueRef = useRef<{ buffer: AudioBuffer; source: AudioBufferSourceNode }[]>([]);
  const playingRef = useRef(false);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const answerBufferRef = useRef("");

  // ─── Playback queue (sequential AudioBufferSourceNodes) ─────────────────────

  const playNext = useCallback(() => {
    if (playingRef.current) return;
    const next = playbackQueueRef.current.shift();
    const ctx = playbackCtxRef.current;
    if (!next || !ctx) {
      playingRef.current = false;
      setIsSpeaking(false);
      return;
    }
    playingRef.current = true;
    setIsSpeaking(true);
    next.source.onended = () => {
      playingRef.current = false;
      playNext();
    };
    next.source.start();
  }, []);

  const enqueueAudio = useCallback((pcm16: Int16Array, sourceSampleRate = 16_000) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    const floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) floats[i] = pcm16[i] / 32768;
    // PCM16 is already sampled at Sarvam's declared TTS rate. Using
    // ctx.sampleRate here silently changes the playback speed/pitch on
    // browsers that run AudioContext at 48 kHz.
    const rate = Number.isFinite(sourceSampleRate) && sourceSampleRate > 0
      ? sourceSampleRate
      : 16_000;
    const buffer = ctx.createBuffer(1, floats.length, rate);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackAnalyserRef.current ?? ctx.destination);
    playbackQueueRef.current.push({ buffer, source });
    playNext();
  }, [playNext]);

  const decodeBase64Pcm16 = useCallback((encoded: string) => {
    if (!encoded || typeof window === "undefined") return null;
    const binary = window.atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const even = bytes.byteLength - (bytes.byteLength % 2);
    if (!even) return null;
    const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice(0, even);
    return new Int16Array(aligned.buffer, aligned.byteOffset, Math.floor(even / 2));
  }, []);

  const closeRealtimeTts = useCallback(() => {
    const ws = realtimeTtsWsRef.current;
    realtimeTtsWsRef.current = null;
    realtimeTtsQueueRef.current = [];
    realtimeTtsConnectingRef.current = false;
    if (ws) { try { ws.close(1000, "session closed"); } catch {} }
  }, []);

  const connectRealtimeTts = useCallback(() => {
    const realtime = sessionRef.current?.stt.realtime;
    if (!realtime || realtimeTtsWsRef.current || realtimeTtsConnectingRef.current) return;
    realtimeTtsConnectingRef.current = true;
    const ws = new WebSocket(realtimeWsUrl("/api/voice/sarvam/tts-realtime", realtime.token));
    realtimeTtsWsRef.current = ws;
    ws.onopen = () => {
      realtimeTtsConnectingRef.current = false;
      for (const message of realtimeTtsQueueRef.current.splice(0)) {
        try { ws.send(message); } catch {}
      }
    };
    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as {
          type?: string;
          audio?: string;
          sampleRate?: number;
          generationId?: string | null;
          message?: string;
          fatal?: boolean;
        };
        if (event.type === "audio" && event.audio) {
          if (event.generationId && realtimeTtsGenerationRef.current &&
              event.generationId !== realtimeTtsGenerationRef.current) return;
          const pcm = decodeBase64Pcm16(event.audio);
          if (pcm) enqueueAudio(pcm, Number(event.sampleRate) || 24_000);
        } else if (event.type === "error" && event.fatal) {
          console.warn("[sarvam-realtime-tts]", event.message);
        }
      } catch {}
    };
    ws.onerror = () => { realtimeTtsConnectingRef.current = false; };
    ws.onclose = () => {
      if (realtimeTtsWsRef.current === ws) realtimeTtsWsRef.current = null;
      realtimeTtsConnectingRef.current = false;
    };
  }, [decodeBase64Pcm16, enqueueAudio]);

  const sendRealtimeTts = useCallback((text: string) => {
    const realtime = sessionRef.current?.stt.realtime;
    if (!realtime || !text.trim()) return false;
    const message = JSON.stringify({
      type: "text",
      generationId: realtimeTtsGenerationRef.current,
      text,
    });
    const ws = realtimeTtsWsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(message); return true; } catch {}
    }
    realtimeTtsQueueRef.current.push(message);
    connectRealtimeTts();
    return true;
  }, [connectRealtimeTts]);

  // ─── TTS: speak one sentence (Bulbul via the platform route) ────────────────

  const speakSentence = useCallback(async (rawText: string) => {
    const realtime = sessionRef.current?.stt.realtime;
    if (realtime) {
      sendRealtimeTts(sanitizeTtsText(rawText));
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    const text = sanitizeTtsText(rawText);
    if (!text) return;
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    try {
      const response = await fetch(apiUrl(session.tts.endpoint), {
        method: "POST",
        headers: pipelineHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          kbId: session.kbId,
          text,
          model: session.tts.model,
          speaker: session.tts.speaker,
          language: session.tts.language,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        // Non-fatal: skip this sentence, keep the conversation flowing.
        return;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      // Merge PCM16 little-endian byte stream → Int16Array. (The server strips
      // the WAV container; a fallback WAV response still decodes via the same
      // PCM path in the overwhelming majority of RIFF files — data chunk
      // first after fmt — but if the vendor ever returns a non-PCM payload
      // the queue simply plays static for that sentence, never crashes.)
      const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const sourceSampleRate = Number(session.tts.outputFormat.replace(/[^0-9]/g, "")) || 16_000;
      const pcmByteLength = totalBytes - (totalBytes % 2);
      if (pcmByteLength === 0) {
        console.warn("[sarvam] TTS returned an empty audio payload");
        return;
      }
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, pcmByteLength / 2);
      enqueueAudio(pcm16, sourceSampleRate);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.warn("[sarvam] tts failed:", (err as Error).message);
      }
    }
  }, [enqueueAudio, pipelineHeaders, sendRealtimeTts]);

  // ─── Chat + sentence-chunked TTS loop ───────────────────────────────────────

  const runAssistantTurn = useCallback(async (question: string) => {
    const generationId = generateTurnId();
    realtimeTtsGenerationRef.current = generationId;
    const session = sessionRef.current;
    if (!session || !session.kbId) return;

    const turn: VoiceTurn = {
      id: generateTurnId(),
      question,
      answer: "",
      sources: [] as Source[],
      status: "pending",
    };
    partialTurnRef.current = null; // live-caption turn is replaced by the real one
    setHistory((prev) => [...prev, turn]);

    const controller = new AbortController();
    chatAbortRef.current = controller;
    answerBufferRef.current = "";

    try {
      await streamChatCompletion(
        session.kbId,
        [{ role: "user", content: question }],
        (event) => {
          if (event.type === "sources") {
            turn.sources = event.payload as Source[];
            setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, sources: turn.sources } : t)));
          } else if (event.type === "token") {
            turn.answer += event.payload;
            setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, answer: t.answer + event.payload } : t)));
            const { sentences, rest } = splitSentences(answerBufferRef.current + event.payload);
            if (sentences.length > 0) {
              answerBufferRef.current = rest;
              for (const sentence of sentences) {
                if (controller.signal.aborted) break;
                void speakSentence(sentence);
              }
            } else {
              answerBufferRef.current += event.payload;
            }
          }
        },
        {
          kbId: session.kbId,
          signal: controller.signal,
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
        },
      );

      const unspoken = answerBufferRef.current.trim();
      if (unspoken && !controller.signal.aborted) {
        answerBufferRef.current = "";
        void speakSentence(unspoken);
      }

      setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, status: "done" } : t)));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, status: "done" } : t)));
        return;
      }
      const message = (err as Error).message;
      setError(message);
      turn.answer = turn.answer || "Sorry — I could not answer that right now.";
      setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, status: "done", answer: turn.answer } : t)));
    }
  }, [options.embedApiKey, options.language?.assistant, options.language?.customer, speakSentence]);

  // ─── Playback interruption (barge-in) ─────────────────────────────────────────

  const interruptPlayback = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    for (const item of playbackQueueRef.current) {
      try { item.source.stop(); } catch {}
    }
    playbackQueueRef.current = [];
    playingRef.current = false;
    setIsSpeaking(false);
    realtimeTtsGenerationRef.current = null;
    closeRealtimeTts();
  }, [closeRealtimeTts]);

  // ─── REALTIME mode: Saaras relay wiring ─────────────────────────────────────

  const handleRealtimeEvent = useCallback((data: unknown) => {
    const event = data as {
      type?: string;
      value?: string;
      text?: string;
      message?: string;
      fatal?: boolean;
    };
    if (!event || typeof event.type !== "string") return;

    switch (event.type) {
      case "status":
        if (event.value === "connected") setStatus("connected");
        break;

      case "transcript_partial": {
        const text = String(event.text ?? "");
        if (!text) return;
        // EARLY barge-in: first recognizable partial during playback stops
        // TTS immediately — faster than any RMS-based heuristic.
        if (playingRef.current) interruptPlayback();
        partialQuestionRef.current = text;
        // Live captions: upsert a caption turn carrying the growing question.
        if (!partialTurnRef.current) {
          const captionTurn: VoiceTurn = {
            id: "caption",
            question: text,
            answer: "",
            sources: [] as Source[],
            status: "pending",
          };
          partialTurnRef.current = captionTurn;
          setHistory((prev) => [...prev, captionTurn]);
        } else {
          const caption = partialTurnRef.current;
          setHistory((prev) =>
            prev.map((t) => (t.id === caption.id ? { ...t, question: text } : t)),
          );
        }
        break;
      }

      case "transcript_final": {
        const text = String(event.text ?? "").trim();
        partialQuestionRef.current = "";
        if (!text || isNonSpeechTranscript(text)) {
          // Drop the live-caption turn — nothing speakable landed.
          const caption = partialTurnRef.current;
          if (caption) {
            partialTurnRef.current = null;
            setHistory((prev) => prev.filter((t) => t.id !== caption.id));
          }
          return;
        }
        // Replace the caption turn with the real assistant turn.
        const caption = partialTurnRef.current;
        if (caption) {
          partialTurnRef.current = null;
          setHistory((prev) => prev.filter((t) => t.id !== caption.id));
        }
        void runAssistantTurn(text);
        break;
      }

      case "error": {
        const message = String(event.message ?? "Realtime error");
        if (event.fatal) {
          setError(message);
          setStatus("error");
        } else {
          console.warn("[sarvam-realtime]", message);
        }
        break;
      }

      default:
        break; // unknown upstream envelopes are ignored client-side
    }
  }, [interruptPlayback, runAssistantTurn]);

  const startRealtimeCapture = useCallback((mic: MediaStream) => {
    const session = sessionRef.current;
    const realtime = session?.stt.realtime;
    if (!session || !realtime || !captureCtxRef.current) return false;

    // 1. Upstream socket (same-origin relay; vendor host never in the browser).
    const ws = new WebSocket(realtimeWsUrl(realtime.endpoint, realtime.token));
    realtimeWsRef.current = ws;
    connectRealtimeTts();
    ws.onmessage = (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data as string));
      } catch {}
    };
    ws.onerror = () => {
      setError("Realtime speech connection failed.");
    };
    ws.onclose = () => {
      if (realtimeWsRef.current === ws) realtimeWsRef.current = null;
    };

    // 2. PCM16 capture: mic → capture ctx (16 kHz) → ScriptProcessor.
    //    connectPcm16Capture wires the zero-gain pull-through to the
    //    destination — WITHOUT it the render thread never pulls the node and
    //    onaudioprocess never fires (mic "on" but zero frames sent).
    const source = captureCtxRef.current.createMediaStreamSource(mic);
    const capture = connectPcm16Capture(captureCtxRef.current, source, (pcm16) => {
      if (realtimeWsRef.current?.readyState !== WebSocket.OPEN) return;
      realtimePcmBufferRef.current.push(pcm16);
    });
    realtimeCaptureRef.current = capture;

    // 3. Flush captured PCM upstream in ~100 ms base64 batches.
    realtimeFlushTimerRef.current = window.setInterval(() => {
      const socket = realtimeWsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        realtimePcmBufferRef.current = [];
        return;
      }
      const frames = realtimePcmBufferRef.current.splice(0);
      if (frames.length === 0) return;
      let totalSamples = 0;
      let maxAbs = 0;
      for (const frame of frames) totalSamples += frame.length;
      const merged = new Int16Array(totalSamples);
      let offset = 0;
      for (const frame of frames) {
        merged.set(frame, offset);
        for (let i = 0; i < frame.length; i++) {
          const abs = frame[i] < 0 ? -frame[i] : frame[i];
          if (abs > maxAbs) maxAbs = abs;
        }
        offset += frame.length;
      }

      // Field diagnostics: an OPEN socket fed nothing but digital silence
      // for 2+ seconds means the capture graph or the mic input is dead —
      // surface it instead of failing as "not listening".
      if (maxAbs === 0 && !realtimeSilenceWarnedRef.current) {
        realtimeSilenceWarnedRef.current = true;
        console.warn(
          "[sarvam-realtime] Microphone is producing digital silence — " +
            "check the browser tab's input device selection and permissions.",
        );
      }

      // Sarvam `stream_type=fast` caps each audio_input frame at 16000 bytes.
      // ScriptProcessor scheduling can occasionally batch multiple capture
      // callbacks, so never let a delayed timer turn several PCM blocks into
      // one oversized vendor frame.
      const maxSamplesPerFrame = REALTIME_MAX_FRAME_BYTES / Int16Array.BYTES_PER_ELEMENT;
      for (let start = 0; start < merged.length; start += maxSamplesPerFrame) {
        const frame = merged.subarray(start, Math.min(start + maxSamplesPerFrame, merged.length));
        const bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        socket.send(JSON.stringify({
          event: "audio_input",
          audio: btoa(binary),
        }));
      }
    }, REALTIME_FLUSH_MS);

    return true;
  }, [connectRealtimeTts, handleRealtimeEvent]);

  const stopRealtimeCapture = useCallback(() => {
    if (realtimeFlushTimerRef.current) {
      clearInterval(realtimeFlushTimerRef.current);
      realtimeFlushTimerRef.current = null;
    }
    realtimeCaptureRef.current?.stop();
    realtimeCaptureRef.current = null;
    realtimePcmBufferRef.current = [];
    try { realtimeWsRef.current?.close(); } catch {}
    realtimeWsRef.current = null;
    partialQuestionRef.current = "";
    partialTurnRef.current = null;
    realtimeSilenceWarnedRef.current = false;
  }, []);

  // ─── UTTERANCE mode: Saaras REST STT (fallback) ─────────────────────────────

  const transcribeUtterance = useCallback(async (blob: Blob): Promise<string | null> => {
    const session = sessionRef.current;
    if (!session || blob.size === 0) return null;
    try {
      const form = new FormData();
      form.append("kbId", session.kbId ?? "");
      form.append("audio", blob, "utterance.webm");
      // Saaras auto-detects the language when omitted — only send a hint when
      // the session resolved a concrete BCP-47 code.
      if (session.stt.language && session.stt.language !== "en-IN") {
        form.append("language", session.stt.language);
      }
      const response = await fetch(apiUrl(session.stt.endpoint), {
        method: "POST",
        headers: pipelineHeaders(),
        body: form,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? `Transcription failed (HTTP ${response.status})`);
      }
      const payload = await response.json() as { text?: string };
      return payload.text?.trim() || null;
    } catch (err) {
      console.warn("[sarvam] stt failed:", (err as Error).message);
      setError(`Speech recognition failed: ${(err as Error).message}`);
      return null;
    }
  }, [pipelineHeaders]);

  // ─── Utterance lifecycle (VAD-driven, utterance mode only) ──────────────────

  const finishUtterance = useCallback(async () => {
    utteranceActiveRef.current = false;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    await new Promise<void>((resolve) => {
      const onStop = () => {
        recorder.removeEventListener("stop", onStop);
        resolve();
      };
      recorder.addEventListener("stop", onStop);
      recorder.stop();
    });
    const blob = new Blob(captureChunksRef.current, { type: "audio/webm" });
    captureChunksRef.current = [];
    const text = await transcribeUtterance(blob);
    if (!text) return;
    if (isNonSpeechTranscript(text)) return;
    await runAssistantTurn(text);
  }, [runAssistantTurn, transcribeUtterance]);

  const startUtterance = useCallback(() => {
    if (utteranceActiveRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "inactive") return;
    utteranceActiveRef.current = true;
    captureChunksRef.current = [];
    interruptPlayback();
    recorder.start(250);
  }, [interruptPlayback]);

  const startVad = useCallback(() => {
    const analyser = vadAnalyserRef.current;
    if (!analyser) return;
    const data = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);

      const now = Date.now();
      if (rms > VAD_THRESHOLD) {
        speechFramesRef.current++;
        lastVoiceMsRef.current = now;
        if (!speakingUserRef.current && speechFramesRef.current >= VAD_START_FRAMES) {
          speakingUserRef.current = true;
          startUtterance();
        }
      } else {
        speechFramesRef.current = Math.max(0, speechFramesRef.current - 1);
        if (speakingUserRef.current && now - lastVoiceMsRef.current > VAD_SILENCE_MS) {
          speakingUserRef.current = false;
          void finishUtterance();
        }
      }
      vadTimerRef.current = window.setTimeout(tick, 80);
    };
    tick();
  }, [finishUtterance, startUtterance]);

  // ─── Public surface ─────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    stopRealtimeCapture();
    closeRealtimeTts();
    interruptPlayback();
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    try { captureCtxRef.current?.close(); } catch {}
    captureCtxRef.current = null;
    try { playbackCtxRef.current?.close(); } catch {}
    playbackCtxRef.current = null;
    playbackAnalyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    vadAnalyserRef.current = null;
    sessionRef.current = null;
    utteranceActiveRef.current = false;
    speakingUserRef.current = false;
    bargeInArmedRef.current = false;
  }, [closeRealtimeTts, interruptPlayback, stopRealtimeCapture]);

  const connect = useCallback(async () => {
    const myToken = ++connectTokenRef.current;
    setError(null);
    setStatus("connecting");
    try {
      // 1. Session bootstrap (guards + config resolution server-side).
      const response = await fetch(apiUrl("/api/voice/sarvam/session"), {
        method: "POST",
        headers: pipelineHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Sarvam session failed (HTTP ${response.status})`);
      if (myToken !== connectTokenRef.current) return;
      sessionRef.current = payload;
      const realtimeMode = Boolean(payload.stt.realtime);

      // 2. Microphone.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (myToken !== connectTokenRef.current) { mic.getTracks().forEach((t) => t.stop()); return; }
      micStreamRef.current = mic;

      // 3. Audio contexts inside the user-gesture scope.
      const AudioCtxClass = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      captureCtxRef.current = new AudioCtxClass({ sampleRate: 16_000 });
      playbackCtxRef.current = new AudioCtxClass({ sampleRate: 16_000 });
      await captureCtxRef.current.resume();
      await playbackCtxRef.current.resume();

      // Playback analyser → destination (visualiser fast-path).
      const playbackAnalyser = playbackCtxRef.current.createAnalyser();
      playbackAnalyser.fftSize = 512;
      playbackAnalyser.smoothingTimeConstant = 0.85;
      playbackAnalyser.connect(playbackCtxRef.current.destination);
      playbackAnalyserRef.current = playbackAnalyser;
      setOutputAnalyserNode(playbackAnalyser);

      if (realtimeMode) {
        // 4a. Realtime relay capture (partial transcripts + early barge-in).
        const started = startRealtimeCapture(mic);
        if (!started) throw new Error("Could not start the realtime speech stream.");
      } else {
        // 4b. Utterance fallback: recorder + mic VAD analyser.
        const recorder = new MediaRecorder(mic, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm",
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) captureChunksRef.current.push(event.data);
        };
        recorderRef.current = recorder;

        const micSource = captureCtxRef.current.createMediaStreamSource(mic);
        const vadAnalyser = captureCtxRef.current.createAnalyser();
        vadAnalyser.fftSize = 1024;
        micSource.connect(vadAnalyser); // analyse-only
        vadAnalyserRef.current = vadAnalyser;
      }

      // 5. Greet.
      if (options.voiceGreeting) {
        const greeting = sanitizeTtsText(options.voiceGreeting);
        if (greeting) {
          setHistory((prev) => [
            ...prev,
            {
              id: generateTurnId(),
              question: "",
              answer: greeting,
              sources: [] as Source[],
              status: "done" as const,
            },
          ]);
          void speakSentence(greeting);
        }
      }

      setStatus("connected");
      if (!realtimeMode) startVad();
    } catch (err) {
      if (myToken !== connectTokenRef.current) return;
      const message = (err as Error).message;
      setError(message);
      setStatus("error");
      cleanup();
    }
  }, [cleanup, options.kbId, options.language?.assistant, options.voiceGreeting, pipelineHeaders, speakSentence, startRealtimeCapture, startVad]);

  const disconnect = useCallback(() => {
    connectTokenRef.current++;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const interrupt = useCallback(() => {
    interruptPlayback();
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
  }, [interruptPlayback]);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    void runAssistantTurn(text.trim());
  }, [runAssistantTurn]);

  useEffect(() => () => {
    connectTokenRef.current++;
    cleanup();
  }, [cleanup]);

  return {
    status,
    error,
    isSpeaking,
    history,
    connect,
    disconnect,
    interrupt,
    sendText,
    remoteAudioStream: null as MediaStream | null,
    outputAnalyserNode,
  } as const;
}
