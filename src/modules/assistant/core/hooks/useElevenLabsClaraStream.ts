"use client";

/**
 * src/modules/assistant/core/hooks/useElevenLabsClaraStream.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs Mode C — the Clara-controlled realtime path (plan Phase 6).
 *
 *   mic ──(AudioWorklet PCM16, base64)──► /api/voice/elevenlabs/realtime
 *          relay ⇄ Scribe realtime WS (scribe_v2_realtime)
 *          transcript_partial ──► live captions + early barge-in
 *          transcript_final  ──► Clara generation (the ONLY turn trigger)
 *     answer tokens ──(streamed, sanitized)──► /api/voice/elevenlabs/tts-realtime
 *          relay ⇄ TTS stream-input WS (eleven_flash_v2_5, pcm_16000)
 *          audio chunks ──► generation-aware playback queue
 *
 * Clara owns the turn: every committed transcript runs the SAME tenant-bound
 * KB/RAG/LLM pipeline as Mode A (streamChatCompletion → /api/chat|/embed/chat).
 * The vendor only transports audio — its key never reaches the browser (the
 * relay holds it server-side). No sentence-by-sentence REST TTS: text deltas
 * stream into ONE warm TTS WebSocket per session, flushed per turn
 * (plan Task 6.3/6.4).
 *
 * Generation discipline (plan Phase 2): one GenerationCoordinator per session;
 * exactly one active generation; partial transcripts only update the UI;
 * stale audio is discarded at enqueue AND play time.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Source } from "../models";
import type { VoiceStatus, VoiceTurn } from "../voice/types";
import type { VoiceClientOptions } from "../voice/types";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { streamChatCompletion } from "../../client/stream";
import { sanitizeTtsText, isNonSpeechTranscript } from "@/modules/voice-core/tts-text";
import { connectPcm16Capture, connectWorkletPcm16Capture } from "../voice/pcm-capture";
import { setMicStreamMuted } from "../voice/mic-mute";
import {
  GenerationCoordinator,
  LatencyTracker,
  type LatencyStage,
  type TurnLatencyHandle,
  mintSessionId,
  mintTurnId,
} from "@/modules/voice-core/realtime";
import { GenerationPlaybackQueue } from "../voice/generation-playback";

/** Flush mic frames upstream in ~100 ms batches (matches the other relays). */
const REALTIME_FLUSH_MS = 100;

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
      ttsEndpoint: string;
      sampleRate: number;
      encoding: string;
      model: string;
    };
  };
  tts: {
    endpoint: string;
    model: string;
    voiceId: string;
    outputFormat: string;
    voiceSettings: Record<string, unknown>;
  };
  chat: { endpoint: string; kbId: string | null; ragMode: string };
  kbId: string | null;
};

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a ws:// / wss:// URL on the CURRENT origin (CSP: connect-src 'self'). */
function realtimeWsUrl(endpoint: string, token: string): string {
  const apiBase = apiUrl(endpoint);
  const url = new URL(
    apiBase,
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

export function useElevenLabsClaraStream(options: VoiceClientOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [outputAnalyserNode, setOutputAnalyserNode] = useState<AnalyserNode | null>(null);

  const pipelineHeaders = useCallback(
    (extra: Record<string, string> = {}): HeadersInit =>
      options.embedApiKey
        ? { ...extra, Authorization: `Bearer ${options.embedApiKey}` }
        : withAuthHeaders(extra),
    [options.embedApiKey],
  );

  const sessionRef = useRef<SessionPayload | null>(null);
  const connectTokenRef = useRef(0);

  // Capture chain
  const micStreamRef = useRef<MediaStream | null>(null);
  // ── Microphone mute ("pause") ────────────────────────────────────────────
  // track.enabled=false makes the Scribe STT capture chain emit digital
  // silence — no committed transcript, no turn — while both sockets stay up.
  const [micMuted, setMicMutedState] = useState(false);
  const micMutedRef = useRef(false);
  const setMicMuted = useCallback((muted: boolean) => {
    micMutedRef.current = muted;
    setMicMutedState(muted);
    setMicStreamMuted(micStreamRef.current, muted);
  }, []);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const captureRef = useRef<{ stop: () => void } | null>(null);
  const pcmBufferRef = useRef<Int16Array[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  // Realtime sockets
  const sttWsRef = useRef<WebSocket | null>(null);
  const ttsWsRef = useRef<WebSocket | null>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsConnectingRef = useRef(false);
  const turnGenerationRef = useRef<string | null>(null);
  const lastFinalRef = useRef<{ text: string; at: number } | null>(null);
  const partialTurnRef = useRef<VoiceTurn | null>(null);

  // Playback + generation coordination (plan Phase 2)
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackRef = useRef<GenerationPlaybackQueue | null>(null);
  const coordinatorRef = useRef<GenerationCoordinator | null>(null);
  /** Latency telemetry (plan Phase 10 — timings only, never transcripts). */
  const latencyRef = useRef<LatencyTracker | null>(null);
  /** Latency handle of the ACTIVE assistant turn — turn-scoped marks go
   *  through it so they stay bound to the turn's own record even when a
   *  barge-in opens a new interim record mid-stream (the in-flight chat
   *  bleed bug). Null between turns / during the greeting. */
  const turnLatencyRef = useRef<TurnLatencyHandle | null>(null);
  /** A completed turn whose playback is still speaking — its telemetry
   *  emits when the queue goes quiet, so tts.first_audio /
   *  browser.first_audio (which can trail the chat stream on short
   *  answers) land on the record before the event snapshot is taken. */
  const pendingTurnLatencyRef = useRef<TurnLatencyHandle | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  // Bounded conversation memory for Clara realtime turns. Keep it client-side
  // as transport context only; the server still resolves tenant/KB and performs
  // the authoritative Qdrant grounding for every turn.
  const conversationRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const answerBufferRef = useRef("");

  /** Mark a TURN-scoped stage on the active turn's record (handle), falling
   *  back to the tracker's current record for the greeting/system turns. */
  const markTurn = useCallback((stage: LatencyStage) => {
    (turnLatencyRef.current ?? latencyRef.current)?.mark(stage);
  }, []);

  // ─── PCM16 → audio queue ────────────────────────────────────────────────────

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

  const enqueueAudio = useCallback(
    (pcm16: Int16Array, sourceSampleRate: number, generationId: string | null) => {
      const queue = playbackRef.current;
      if (!queue || !generationId) return; // unattributed audio is stale by definition
      const queued = queue.enqueue(pcm16, sourceSampleRate, generationId);
      if (queued) markTurn("tts.first_audio");
    },
    [markTurn],
  );

  /** Emit the per-turn latency record (safe: timings only — plan §11).
   *  Prefers the ACTIVE TURN's handle — the record of the turn that just
   *  completed — falling back to the tracker's current record. */
  const emitLatencyTelemetry = useCallback(() => {
    const event = turnLatencyRef.current?.telemetry() ?? latencyRef.current?.telemetry();
    if (!event) return;
    console.debug("[elevenlabs-clara] latency", event);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("clara:voice:latency", { detail: event }));
    }
  }, []);

  // ─── Streaming TTS leg (one warm WS per session — plan Task 6.3) ───────────

  const closeRealtimeTts = useCallback(() => {
    const ws = ttsWsRef.current;
    ttsWsRef.current = null;
    ttsQueueRef.current = [];
    ttsConnectingRef.current = false;
    if (ws) {
      try { ws.close(1000, "session closed"); } catch {}
    }
  }, []);

  const connectRealtimeTts = useCallback(() => {
    const realtime = sessionRef.current?.stt.realtime;
    if (!realtime || ttsWsRef.current || ttsConnectingRef.current) return;
    ttsConnectingRef.current = true;
    const ws = new WebSocket(realtimeWsUrl(realtime.ttsEndpoint, realtime.token));
    ttsWsRef.current = ws;
    ws.onopen = () => {
      ttsConnectingRef.current = false;
      for (const message of ttsQueueRef.current.splice(0)) {
        try { ws.send(message); } catch {}
      }
    };
    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as {
          type?: string;
          value?: string;
          audio?: string;
          generationId?: string | null;
          sampleRate?: number;
          isFinal?: boolean;
          message?: string;
          fatal?: boolean;
        };
        if (event.type === "audio" && event.audio) {
          // Generation gating lives in the playback queue (enqueue + play checks).
          const pcm = decodeBase64Pcm16(event.audio);
          if (pcm) enqueueAudio(pcm, Number(event.sampleRate) || 16_000, event.generationId ?? null);
        } else if (event.type === "error" && event.fatal) {
          console.warn("[elevenlabs-clara-stream tts]", event.message);
        }
      } catch {}
    };
    ws.onerror = () => { ttsConnectingRef.current = false; };
    ws.onclose = () => {
      if (ttsWsRef.current === ws) ttsWsRef.current = null;
      ttsConnectingRef.current = false;
    };
  }, [decodeBase64Pcm16, enqueueAudio]);

  /**
   * Stream one text delta into the TTS WebSocket. Deltas go through
   * UNBUFFERED — the vendor's chunk_length_schedule decides when to start
   * speaking (no client-side sentence chunking — plan Task 6.3).
   */
  const sendRealtimeTts = useCallback(
    (text: string, generationId: string | null) => {
      const realtime = sessionRef.current?.stt.realtime;
      const cleanText = sanitizeTtsText(text);
      if (!realtime || !cleanText || !generationId) return false;
      markTurn("tts.start");

      const payload = JSON.stringify({ type: "text", generationId, text: cleanText });
      const ws = ttsWsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          return true;
        } catch {}
      }
      ttsQueueRef.current.push(payload);
      connectRealtimeTts();
      return true;
    },
    [connectRealtimeTts, markTurn],
  );

  const flushRealtimeTts = useCallback((generationId: string | null) => {
    if (!generationId) return;
    const payload = JSON.stringify({ type: "flush", generationId });
    const ws = ttsWsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch {}
    } else {
      ttsQueueRef.current.push(payload);
      connectRealtimeTts();
    }
  }, [connectRealtimeTts]);

  // ─── Clara turn: committed transcript → RAG+LLM → streamed TTS ─────────────

  const runAssistantTurn = useCallback(async (question: string) => {
    console.info("[elevenlabs-clara] assistant turn start", { question: question.slice(0, 160) });
    const session = sessionRef.current;
    if (!session || !session.kbId) return;
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;

    // A previous turn may still be pending its playback-drain emit — its
    // marks are complete by now; emit it before this turn replaces it.
    if (pendingTurnLatencyRef.current) {
      emitLatencyTelemetry();
      pendingTurnLatencyRef.current = null;
    }

    // One committed user turn → exactly one assistant generation (plan §1.4).
    const generation = coordinator.beginTurn(mintTurnId());
    if (!generation) return; // duplicate committed transcript
    const generationId = generation.generationId;
    turnGenerationRef.current = generationId;
    // Phase 10 telemetry: per-turn tracker record (timings only).
    // Carry the STT timestamps from the interim record — see the tracker's
    // carrySttMarks docs (the committed-turn carry bug).
    const carriedStt = latencyRef.current?.sttMarks();
    const turnLatency = latencyRef.current?.beginGenerationTurn(generation, "elevenlabs", session.stt.realtime?.model ?? null);
    turnLatencyRef.current = turnLatency ?? null;
    latencyRef.current?.carrySttMarks(carriedStt ?? {});
    // The chat call starts retrieval AND generation together on this
    // pipeline (RAG runs inside /api/chat) — both stages anchor here.
    turnLatency?.mark("rag.start");
    turnLatency?.mark("llm.start");

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
    coordinator.registerAbort(() => controller.abort());
    answerBufferRef.current = "";

    try {
      const priorMessages = conversationRef.current.slice(-6);
      const turnMessages: Array<{ role: "user" | "assistant"; content: string }> = [
        ...priorMessages,
        { role: "user", content: question },
      ];

      await streamChatCompletion(
        session.kbId,
        turnMessages,
        (event) => {
          if (event.type === "error") {
            const message = String(event.payload ?? "The realtime assistant could not generate a response.");
            console.error("[elevenlabs-clara] chat stream error", message);
            throw new Error(message);
          } else if (event.type === "sources") {
            turnLatency?.mark("rag.end"); // sources arrive post-retrieval
            turn.sources = event.payload as Source[];
            setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, sources: turn.sources } : t)));
          } else if (event.type === "token") {
            // Stale-generation guard (plan §1.3): late tokens never append or speak.
            if (!coordinator.isCurrentGeneration(generationId)) return;
            turnLatency?.mark("llm.first_token");
            turn.answer += event.payload;
            setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, answer: t.answer + event.payload } : t)));
            // Stream the delta straight into the TTS WebSocket — the vendor's
            // chunk_length_schedule handles buffering (no sentence chunking).
            sendRealtimeTts(event.payload, generationId);
            answerBufferRef.current += event.payload;
          }
        },
        {
          kbId: session.kbId,
          signal: controller.signal,
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          draftScope: options.draftMode === true,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
          // This is the realtime turn path: let the shared chat service apply
          // realtime retrieval/model budgets instead of the full chat profile.
          realtimeVoice: true,
        },
      );

      // Persist only completed turns. Interrupted/stale generations must never
      // contaminate the next realtime prompt with partial assistant audio/text.
      const completedAnswer = answerBufferRef.current.trim();
      if (completedAnswer) {
        conversationRef.current = [
          ...priorMessages,
          { role: "user", content: question },
          { role: "assistant", content: completedAnswer },
        ].slice(-8);
      }

      // Flush whatever the vendor still buffers so short answers speak.
      flushRealtimeTts(generationId);
      coordinator.completeGeneration();
      turnLatency?.mark("turn.complete");
      // Short answers can finish the chat BEFORE their first audio chunk
      // arrives. Defer the emit while the queue is speaking OR synthesis
      // audio is still in flight (tts.start marked, first audio not yet
      // arrived) so tts.first_audio / browser.first_audio land on the record.
      const marks = turnLatency?.record?.marks;
      const audioInFlight =
        marks?.["tts.start"] !== undefined &&
        marks?.["tts.first_audio"] === undefined &&
        !controller.signal.aborted;
      if (playbackRef.current?.speaking || audioInFlight) {
        pendingTurnLatencyRef.current = turnLatency ?? null;
      } else {
        emitLatencyTelemetry();
        turnLatencyRef.current = null;
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
  }, [emitLatencyTelemetry, flushRealtimeTts, options.embedApiKey, options.language?.assistant, options.language?.customer, sendRealtimeTts, options.draftMode]);

  // ─── Barge-in / interrupt ───────────────────────────────────────────────────

  const interruptPlayback = useCallback(() => {
    // Queue-level interrupt: clears queued audio, stops the playing source,
    // invalidates the generation (chat abort fires via the coordinator),
    // resets speaking — then drops the vendor's buffered audio.
    playbackRef.current?.interrupt();
    turnGenerationRef.current = null;
    const payload = JSON.stringify({ type: "interrupt" });
    const ws = ttsWsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch {}
    }
  }, []);

  // ─── STT event handling (plan Task 6.2) ────────────────────────────────────

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
        // Utterance boundary for telemetry: a record belonging to a
        // completed/committed turn cannot take this utterance's first-wins
        // STT marks — open a fresh interim record when needed.
        latencyRef.current?.prepareForUtterance();
        latencyRef.current?.mark("stt.first_partial");
        // EARLY barge-in: first recognizable partial during playback stops
        // TTS immediately (Scribe has no vad.speech_start event — partials
        // are the earliest user-speech signal on this protocol).
        if (playbackRef.current?.speaking) interruptPlayback();
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
          setHistory((prev) => prev.map((t) => (t.id === caption.id ? { ...t, question: text } : t)));
        }
        break;
      }

      case "transcript_final": {
        const text = String(event.text ?? "").trim();
        latencyRef.current?.mark("stt.final");
        console.info("[elevenlabs-clara] STT committed", { text });
        // Duplicate-commit protection: the vendor repeats the committed text
        // in its _with_timestamps/_entities variants — same text within 2 s
        // is the SAME committed turn (plan §1.4).
        const now = Date.now();
        const lastFinal = lastFinalRef.current;
        if (lastFinal && lastFinal.text === text && now - lastFinal.at < 2_000) return;
        lastFinalRef.current = { text, at: now };

        // Drop the live-caption turn when nothing speakable landed.
        const caption = partialTurnRef.current;
        partialTurnRef.current = null;
        if (caption) setHistory((prev) => prev.filter((t) => t.id !== caption.id));
        if (!text || isNonSpeechTranscript(text)) return;

        void runAssistantTurn(text);
        break;
      }

      case "error": {
        const message = String(event.message ?? "Realtime error");
        if (event.fatal) {
          // Deterministic recovery (plan Phase 9): invalidate the active
          // generation, close the provider sockets, clear playback, surface
          // the recoverable error. Reconnect starts clean generation state.
          coordinatorRef.current?.cancelCurrent("error");
          try { sttWsRef.current?.close(); } catch {}
          sttWsRef.current = null;
          closeRealtimeTts();
          playbackRef.current?.stop();
          setError(message);
          setStatus("error");
        } else {
          console.warn("[elevenlabs-clara]", message);
        }
        break;
      }

      default:
        break; // unknown upstream envelopes are ignored client-side
    }
  }, [closeRealtimeTts, interruptPlayback, runAssistantTurn]);

  // ─── Session lifecycle ─────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
    captureRef.current?.stop();
    captureRef.current = null;
    pcmBufferRef.current = [];
    try { sttWsRef.current?.close(); } catch {}
    sttWsRef.current = null;
    closeRealtimeTts();
    interruptPlayback();
    playbackRef.current?.stop();
    playbackRef.current = null;
    coordinatorRef.current = null;
    turnLatencyRef.current = null;
    pendingTurnLatencyRef.current = null;
    turnGenerationRef.current = null;
    lastFinalRef.current = null;
    partialTurnRef.current = null;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    try { captureCtxRef.current?.close(); } catch {}
    captureCtxRef.current = null;
    try { playbackCtxRef.current?.close(); } catch {}
    playbackCtxRef.current = null;
    playbackAnalyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    sessionRef.current = null;
    conversationRef.current = [];
    setIsSpeaking(false);
  }, [closeRealtimeTts, interruptPlayback]);

  const connect = useCallback(async () => {
    const myToken = ++connectTokenRef.current;
    setError(null);
    setStatus("connecting");
    try {
      // 1. Session bootstrap — the stt.realtime descriptor decides the path.
      const response = await fetch(apiUrl("/api/voice/elevenlabs/session"), {
        method: "POST",
        headers: pipelineHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `ElevenLabs session failed (HTTP ${response.status})`);
      const realtime = payload.stt.realtime;
      if (!realtime) {
        // The selector sent us here but the capability is off (flag raced) —
        // the caller falls back to the Mode A pipeline.
        throw new Error("ElevenLabs realtime is not enabled for this session.");
      }
      if (myToken !== connectTokenRef.current) return;
      sessionRef.current = payload;

      // 2. Microphone + audio contexts inside the user-gesture scope.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (myToken !== connectTokenRef.current) { mic.getTracks().forEach((t) => t.stop()); return; }
      micStreamRef.current = mic;
      // Sticky mute across reconnects — a muted visitor stays muted.
      setMicStreamMuted(mic, micMutedRef.current);

      const AudioCtxClass = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      captureCtxRef.current = new AudioCtxClass({ sampleRate: 16_000 });
      playbackCtxRef.current = new AudioCtxClass({ sampleRate: 16_000 });
      await captureCtxRef.current.resume();
      await playbackCtxRef.current.resume();

      const playbackAnalyser = playbackCtxRef.current.createAnalyser();
      playbackAnalyser.fftSize = 512;
      playbackAnalyser.smoothingTimeConstant = 0.85;
      playbackAnalyser.connect(playbackCtxRef.current.destination);
      playbackAnalyserRef.current = playbackAnalyser;
      setOutputAnalyserNode(playbackAnalyser);

      // 3. Realtime session foundation (plan Phase 2).
      const coordinator = new GenerationCoordinator(mintSessionId());
      coordinatorRef.current = coordinator;
      latencyRef.current = new LatencyTracker();
      // Boot record: marks are no-ops without a record — session.start (and
      // every interim STT mark before the first committed turn) must land on
      // a real record or TTFA loses its stt.final base.
      latencyRef.current.beginTurn({
        sessionId: coordinator.sessionId,
        provider: "elevenlabs",
        model: sessionRef.current?.stt.realtime?.model ?? null,
      });
      latencyRef.current.mark("session.start");
      playbackRef.current = new GenerationPlaybackQueue({
        ctx: playbackCtxRef.current,
        coordinator,
        destination: playbackAnalyser,
        events: {
          onSpeakingChange: (speaking) => {
            setIsSpeaking(speaking);
            if (speaking) markTurn("browser.first_audio");
            if (!speaking && pendingTurnLatencyRef.current) {
              // The completed turn's playback just drained — its record now
              // carries every stage (including trailing first-audio marks).
              emitLatencyTelemetry();
              pendingTurnLatencyRef.current = null;
              turnLatencyRef.current = null;
            }
          },
        },
      });

      // 4. STT relay socket.
      const sttWs = new WebSocket(realtimeWsUrl(realtime.endpoint, realtime.token));
      sttWsRef.current = sttWs;
      connectRealtimeTts();
      sttWs.onmessage = (message) => {
        try {
          handleRealtimeEvent(JSON.parse(message.data as string));
        } catch {}
      };
      sttWs.onerror = () => {
        setError("Realtime speech connection failed.");
      };
      sttWs.onclose = () => {
        if (sttWsRef.current === sttWs) sttWsRef.current = null;
      };

      // 5. PCM16 capture: the shared AudioWorklet (plan Task 6.2) with the
      //    ScriptProcessor fallback for engines without AudioWorklet support.
      const source = captureCtxRef.current.createMediaStreamSource(mic);
      const onPcmFrame = (pcm16: Int16Array) => {
        if (sttWsRef.current?.readyState !== WebSocket.OPEN) return;
        pcmBufferRef.current.push(pcm16);
      };
      let capture: { stop: () => void };
      try {
        capture = await connectWorkletPcm16Capture(captureCtxRef.current, source, onPcmFrame);
      } catch {
        capture = connectPcm16Capture(captureCtxRef.current, source, onPcmFrame);
      }
      captureRef.current = capture;

      // 6. Flush captured PCM upstream in ~100 ms base64 batches.
      flushTimerRef.current = window.setInterval(() => {
        const socket = sttWsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          pcmBufferRef.current = [];
          return;
        }
        const frames = pcmBufferRef.current.splice(0);
        if (frames.length === 0) return;
        let totalSamples = 0;
        for (const frame of frames) totalSamples += frame.length;
        const merged = new Int16Array(totalSamples);
        let offset = 0;
        for (const frame of frames) {
          merged.set(frame, offset);
          offset += frame.length;
        }
        const bytes = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        try {
          socket.send(JSON.stringify({ user_audio_chunk: window.btoa(binary) }));
        } catch {}
      }, REALTIME_FLUSH_MS);

      // 7. Greet — a system generation that owns playback until the first
      //    committed user turn replaces it (barge-in safe).
      if (options.voiceGreeting) {
        const greeting = sanitizeTtsText(options.voiceGreeting);
        if (greeting) {
          const greetingGeneration = coordinator.beginSystemGeneration();
          turnGenerationRef.current = greetingGeneration.generationId;
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
          sendRealtimeTts(greeting, greetingGeneration.generationId);
          flushRealtimeTts(greetingGeneration.generationId);
        }
      }

      setStatus("connected");
    } catch (err) {
      if (myToken !== connectTokenRef.current) return;
      const message = (err as Error).message;
      setError(message);
      setStatus("error");
      cleanup();
    }
  }, [cleanup, connectRealtimeTts, emitLatencyTelemetry, flushRealtimeTts, handleRealtimeEvent, markTurn, options.kbId, options.language?.assistant, options.voiceGreeting, pipelineHeaders, sendRealtimeTts, options.draftMode]);

  const disconnect = useCallback(() => {
    connectTokenRef.current++;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const interrupt = useCallback(() => {
    // Telemetry: the interrupted generation's record gets the interrupt mark
    // (via its handle); a fresh utterance afterwards opens a new record.
    markTurn("interrupt");
    interruptPlayback();
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    // Emit the interrupted turn's record now (its marks are complete — the
    // queue was just cleared, trailing audio will never arrive).
    if (turnLatencyRef.current || pendingTurnLatencyRef.current) {
      emitLatencyTelemetry();
    }
    pendingTurnLatencyRef.current = null;
    turnLatencyRef.current = null;
  }, [emitLatencyTelemetry, interruptPlayback, markTurn]);

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
    micMuted,
    setMicMuted,
    connect,
    disconnect,
    interrupt,
    sendText,
    remoteAudioStream: null as MediaStream | null,
    outputAnalyserNode,
  } as const;
}
