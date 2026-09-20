"use client";

/**
 * src/modules/assistant/core/hooks/useElevenLabsVoice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs hybrid voice pipeline (Mode A).
 *
 *   mic ──(webm/opus utterances)──► /api/voice/elevenlabs/transcribe  (Scribe STT)
 *        text
 *          ▼
 *   /api/chat  (platform RAG + OpenAI/Gemini chatStream — UNCHANGED brain)
 *        answer tokens ──(sentence-chunked)──► /api/voice/elevenlabs/tts
 *        PCM16 audio ──► queued AudioBufferSourceNodes ──► speakers
 *
 * Data boundary: only user audio (STT) and answer text (TTS) cross to
 * ElevenLabs — through platform endpoints only. Documents/KBs never leave.
 *
 * Structure mirrors useGeminiLive: identical VoiceTurn history, identical
 * connect/disconnect/interrupt/sendText surface, playback analyser exposed
 * for useAudioVisualizer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Source } from "../models";
import type { VoiceStatus, VoiceTurn } from "../voice/types";
import type { VoiceClientOptions } from "../voice/types";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { streamChatCompletion } from "../../client/stream";
import { splitSentences } from "../voice/sentence-split";
import { isNonSpeechTranscript, sanitizeTtsText } from "@/modules/voice-core/tts-text";
import { GenerationCoordinator, mintSessionId, mintTurnId } from "@/modules/voice-core/realtime";
import { GenerationPlaybackQueue } from "../voice/generation-playback";

// ─── VAD tuning ───────────────────────────────────────────────────────────────
// Turn-taking budget: silence-to-submit used to be 800 ms of client VAD on
// top of a full batch-STT round trip. 700 ms keeps a safe anti-cut-off
// margin while trimming dead air; the threshold bump (0.015 → 0.02) cuts
// background-noise false triggers (production HAR: [wind blowing] and
// [heartbeat] utterances each burned a full chat + TTS cycle).
const VAD_THRESHOLD = 0.02;         // RMS level that counts as speech
const VAD_START_FRAMES = 6;         // ~100 ms of speech to open an utterance
const VAD_SILENCE_MS = 700;         // silence after speech to close it

type SessionPayload = {
  mode: "pipeline";
  stt: { endpoint: string; model: string; language: string; sampleRate: number; maxAudioSeconds: number };
  tts: { endpoint: string; model: string; voiceId: string; outputFormat: string; voiceSettings: Record<string, number> };
  chat: { endpoint: string; kbId: string | null; ragMode: string };
  kbId: string | null;
};

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useElevenLabsVoice(options: VoiceClientOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [outputAnalyserNode, setOutputAnalyserNode] = useState<AnalyserNode | null>(null);

  // Auth for every pipeline request: the platform JWT (in-app floating
  // assistant / workspace voice modal) or the clr_ embed key (public
  // /embed/voice + /embed/widget surfaces). The server bootstraps embed
  // sessions with a chat descriptor pointing at /api/embed/chat so the
  // whole pipeline runs on the same credential.
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureChunksRef = useRef<Blob[]>([]);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const speechFramesRef = useRef(0);
  const lastVoiceMsRef = useRef(0);
  const speakingUserRef = useRef(false);
  const utteranceActiveRef = useRef(false);

  // Playback chain — generation-aware queue (plan Task 6.5: the P0
  // overlapping-answers fix — at most ONE assistant generation may speak).
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackRef = useRef<GenerationPlaybackQueue | null>(null);
  const coordinatorRef = useRef<GenerationCoordinator | null>(null);
  /** generationId of the turn currently being spoken (TTS tagging). */
  const turnGenerationRef = useRef<string | null>(null);
  /** Duplicate-commit guard for committed transcripts (same text within 2 s). */
  const lastFinalRef = useRef<{ text: string; at: number } | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const answerBufferRef = useRef("");
  const currentTurnRef = useRef<VoiceTurn | null>(null);

  // ─── Playback (generation-aware queue — plan Phase 2 / Task 6.5) ───────────

  const enqueueAudio = useCallback((pcm16: Int16Array, generationId: string | null) => {
    const queue = playbackRef.current;
    // Unattributed audio is stale by definition; the queue itself discards
    // stale ids at enqueue AND play time.
    if (!queue || !generationId) return;
    // Mode A TTS outputFormat is pcm_16000 — honour the declared rate so
    // browsers running AudioContext at 48 kHz do not resample-speed it.
    const rate = Number(String(sessionRef.current?.tts.outputFormat ?? "").replace(/[^0-9]/g, "")) || 16_000;
    queue.enqueue(pcm16, rate, generationId);
  }, []);

  // ─── TTS: speak one sentence ────────────────────────────────────────────────

  const speakSentence = useCallback(async (rawText: string) => {
    const session = sessionRef.current;
    const coordinator = coordinatorRef.current;
    if (!session) return;
    // Strip citation tags + markdown before dispatching — a trailing
    // "[S2]" fragment must never become its own TTS call (HAR 2026-09-18).
    // The server sanitizes again; this client-side pass exists so the call
    // is never even fired for non-speakable fragments.
    const text = sanitizeTtsText(rawText);
    if (!text) return;
    const generationId = turnGenerationRef.current;
    // Stale-generation guard: never dispatch TTS for a replaced/interrupted
    // generation (plan Task 6.5 — the multiple-answers bug).
    if (!generationId || !coordinator?.isCurrentGeneration(generationId)) return;
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
          voiceId: session.tts.voiceId,
          language: session.stt.language,
          voiceSettings: session.tts.voiceSettings,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        // Non-fatal: skip this sentence, keep the conversation flowing.
        return;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      // Merge PCM16 little-endian byte stream → Int16Array.
      const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(totalBytes / 2));
      enqueueAudio(pcm16, generationId);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        // TTS hiccups must not kill the text answer.
        console.warn("[elevenlabs] tts failed:", (err as Error).message);
      }
    }
  }, [enqueueAudio, pipelineHeaders]);

  // ─── Chat + sentence-chunked TTS loop ───────────────────────────────────────

  const runAssistantTurn = useCallback(async (question: string) => {
    const session = sessionRef.current;
    if (!session || !session.kbId) return;
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;

    // Duplicate committed transcripts (double-fired VAD close, replayed
    // utterance) are the SAME turn — plan Task 6.5's P0 guard.
    const now = Date.now();
    const lastFinal = lastFinalRef.current;
    if (lastFinal && lastFinal.text === question && now - lastFinal.at < 2_000) return;
    lastFinalRef.current = { text: question, at: now };

    // One committed user turn → exactly one assistant generation (plan §1.4);
    // beginTurn invalidates + aborts the previous generation inside (§1.3).
    const generation = coordinator.beginTurn(mintTurnId());
    if (!generation) return;
    const generationId = generation.generationId;
    turnGenerationRef.current = generationId;

    const turn: VoiceTurn = {
      id: generateTurnId(),
      question,
      answer: "",
      sources: [] as Source[],
      status: "pending",
    };
    currentTurnRef.current = turn;
    setHistory((prev) => [...prev, turn]);

    const controller = new AbortController();
    chatAbortRef.current = controller;
    // Coordinator-owned cancellation: interrupt / next turn aborts chat here.
    coordinator.registerAbort(() => controller.abort());
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
            // Stale-generation guard (plan §1.3): a late token from a replaced
            // generation must never append text or start TTS.
            if (!coordinator.isCurrentGeneration(generationId)) return;
            turn.answer += event.payload;
            setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, answer: t.answer + event.payload } : t)));
            // Sentence-chunked streaming TTS: speak complete sentences while
            // the rest of the answer is still generating.
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
          // The session payload is authoritative: "/api/chat" for platform
          // sessions, "/api/embed/chat" for embed-key sessions.
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
        },
      );

      // Flush any trailing text that never hit terminal punctuation.
      const unspoken = answerBufferRef.current.trim();
      if (unspoken && !controller.signal.aborted) {
        answerBufferRef.current = "";
        void speakSentence(unspoken);
      }

      // Normal completion: the generation stays current so its queued audio
      // can finish, but no further resource registration is accepted.
      coordinator.completeGeneration();
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
    } finally {
      currentTurnRef.current = null;
    }
  }, [options.embedApiKey, options.language?.assistant, options.language?.customer, speakSentence]);

  // ─── STT: transcribe one utterance blob ─────────────────────────────────────

  const transcribeUtterance = useCallback(async (blob: Blob): Promise<string | null> => {
    const session = sessionRef.current;
    if (!session || blob.size === 0) return null;
    try {
      const form = new FormData();
      form.append("kbId", session.kbId ?? "");
      form.append("audio", blob, "utterance.webm");
      form.append("language", session.stt.language ?? "en");
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
      console.warn("[elevenlabs] stt failed:", (err as Error).message);
      setError(`Speech recognition failed: ${(err as Error).message}`);
      return null;
    }
  }, [pipelineHeaders]);

  // ─── Playback interruption (barge-in) ─────────────────────────────────────────

  const interruptPlayback = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    // Queue-level interrupt (plan Task 6.5): clears queued audio, stops the
    // playing source, invalidates the generation (chat abort fires via the
    // coordinator's registered aborts), resets speaking.
    playbackRef.current?.interrupt();
    turnGenerationRef.current = null;
  }, []);

  // ─── Utterance lifecycle (VAD-driven) ───────────────────────────────────────

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
    // Scribe annotates non-speech audio as bracketed sound events
    // ([heartbeat], [wind blowing]). Dispatching those to the chat pipeline
    // burns a full RAG + chat + TTS cycle on background noise — skip them.
    if (isNonSpeechTranscript(text)) return;
    await runAssistantTurn(text);
  }, [runAssistantTurn, transcribeUtterance]);

  const startUtterance = useCallback(() => {
    if (utteranceActiveRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "inactive") return;
    utteranceActiveRef.current = true;
    captureChunksRef.current = [];
    // Barge-in: user speaking during playback → stop TTS immediately.
    interruptPlayback();
    recorder.start(250);
  }, [interruptPlayback]);

  // ─── VAD loop ───────────────────────────────────────────────────────────────

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
    interruptPlayback();
    // Session teardown: flush playback without coordinator semantics.
    playbackRef.current?.stop();
    playbackRef.current = null;
    coordinatorRef.current = null;
    turnGenerationRef.current = null;
    lastFinalRef.current = null;
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
    setIsSpeaking(false);
  }, [interruptPlayback]);

  const connect = useCallback(async () => {
    const myToken = ++connectTokenRef.current;
    setError(null);
    setStatus("connecting");
    try {
      // 1. Session bootstrap (guards + config resolution server-side).
      const response = await fetch(apiUrl("/api/voice/elevenlabs/session"), {
        method: "POST",
        headers: pipelineHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `ElevenLabs session failed (HTTP ${response.status})`);
      if (myToken !== connectTokenRef.current) return;
      sessionRef.current = payload;

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

      // Realtime session foundation (plan Phase 2): one coordinator + one
      // generation-aware playback queue per connected session — the P0
      // fix for overlapping multiple answers (plan Task 6.5).
      const coordinator = new GenerationCoordinator(mintSessionId());
      coordinatorRef.current = coordinator;
      playbackRef.current = new GenerationPlaybackQueue({
        ctx: playbackCtxRef.current,
        coordinator,
        destination: playbackAnalyser,
        events: { onSpeakingChange: (speaking) => setIsSpeaking(speaking) },
      });

      // 4. Recorder (utterance capture → webm/opus blobs for Scribe).
      const recorder = new MediaRecorder(mic, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) captureChunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;

      // 5. Mic VAD analyser (capture context).
      const micSource = captureCtxRef.current.createMediaStreamSource(mic);
      const vadAnalyser = captureCtxRef.current.createAnalyser();
      vadAnalyser.fftSize = 1024;
      micSource.connect(vadAnalyser); // analyse-only; not connected to destination
      vadAnalyserRef.current = vadAnalyser;

      // 6. Greet.
      if (options.voiceGreeting) {
        const greeting = sanitizeTtsText(options.voiceGreeting);
        if (greeting) {
          // The greeting is a system generation: it owns playback until the
          // first committed user turn replaces it (barge-in safe).
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
          void speakSentence(greeting);
        }
      }

      setStatus("connected");
      startVad();
    } catch (err) {
      if (myToken !== connectTokenRef.current) return;
      const message = (err as Error).message;
      setError(message);
      setStatus("error");
      cleanup();
    }
  }, [cleanup, options.kbId, options.language?.assistant, options.voiceGreeting, pipelineHeaders, speakSentence, startVad]);

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
