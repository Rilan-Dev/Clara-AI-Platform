"use client";

/**
 * src/modules/assistant/core/hooks/useElevenLabsConvAI.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs Conversational AI (Mode B) — realtime websocket voice sessions.
 *
 *   mic ──(PCM16 16 kHz, continuous)──► wss://api.elevenlabs.io
 *        (vendor does its own VAD / turn-taking / barge-in)
 *          ▼
 *   agent turns ──(base64 PCM16 chunks)──► queued AudioBufferSourceNodes
 *
 * The connection URL is a SHORT-LIVED SIGNED URL minted by
 * POST /api/voice/elevenlabs/agent-session (planGuard + rate bucket + org
 * acknowledgement all re-verified server-side). Knowledge grounding happens
 * through the vendor's server tool → the platform's signed RAG webhook
 * (/api/internal/elevenlabs/tools/rag-search) — the browser never handles
 * tool calls, and documents never leave the platform.
 *
 * Data boundary (disclosed to the org at enablement): per-turn answer
 * snippets transit ElevenLabs; raw documents do not. Transcripts land back
 * PII-redacted through the post-call webhook.
 *
 * Structure mirrors useGeminiLive: identical VoiceTurn history, identical
 * connect/disconnect/interrupt/sendText surface, playback analyser exposed
 * for useAudioVisualizer, shared audio-recorder worklet for mic capture.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus, VoiceTurn } from "../voice/types";
import type { VoiceClientOptions } from "../voice/types";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ─── Tuning ──────────────────────────────────────────────────────────────────

const MIC_SAMPLE_RATE = 16_000;
const PLAYBACK_SAMPLE_RATE = 16_000;
/** Flush captured mic audio in ~100 ms batches (protocol-flood guard). */
const AUDIO_FLUSH_MS = 100;
/** Keep-alive cadence — well inside the vendor's ~20 s idle cutoff. */
const KEEP_ALIVE_MS = 10_000;

type AgentSessionPayload = {
  mode: "conversational";
  signedUrl: string;
  agentId: string;
  expiresAt: number;
  kbId: string | null;
  error?: string;
};

type ServerFrame = {
  type?: string;
  // Audio/text payloads (vendor frame names).
  agent_audio_chunk?: string;
  agent_response_chunk?: string;
  agent_response?: string;
  user_transcript?: string;
  agent_response_done?: unknown;
};

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
}

export function useElevenLabsConvAI(options: VoiceClientOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [outputAnalyserNode, setOutputAnalyserNode] = useState<AnalyserNode | null>(null);

  const connectTokenRef = useRef(0);
  const sessionRef = useRef<AgentSessionPayload | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Capture chain (shared worklet — same as the Gemini Live path).
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const pendingAudioRef = useRef<Int16Array[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  // Playback chain (identical queue discipline to Mode A).
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackQueueRef = useRef<{ buffer: AudioBuffer; source: AudioBufferSourceNode }[]>([]);
  const playingRef = useRef(false);

  // Keep-alive + in-flight turn bookkeeping.
  const keepAliveTimerRef = useRef<number | null>(null);
  const currentTurnRef = useRef<VoiceTurn | null>(null);
  const agentAnswerRef = useRef("");

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

  const enqueueAudio = useCallback((pcm16: Int16Array) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    const floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) floats[i] = pcm16[i] / 32768;
    const buffer = ctx.createBuffer(1, floats.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackAnalyserRef.current ?? ctx.destination);
    playbackQueueRef.current.push({ buffer, source });
    playNext();
  }, [playNext]);

  const interruptPlayback = useCallback(() => {
    for (const item of playbackQueueRef.current) {
      try { item.source.stop(); } catch {}
    }
    playbackQueueRef.current = [];
    playingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // ─── Turn bookkeeping ───────────────────────────────────────────────────────

  const beginTurn = useCallback((question: string) => {
    const turn: VoiceTurn = {
      id: generateTurnId(),
      question,
      answer: "",
      sources: [],
      status: "pending",
    };
    currentTurnRef.current = turn;
    agentAnswerRef.current = "";
    setHistory((prev) => [...prev, turn]);
  }, []);

  const appendAgentChunk = useCallback((chunk: string) => {
    const turn = currentTurnRef.current;
    if (!turn) return;
    agentAnswerRef.current += chunk;
    setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, answer: agentAnswerRef.current } : t)));
  }, []);

  const finishTurn = useCallback(() => {
    const turn = currentTurnRef.current;
    if (!turn) return;
    setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, status: "done" } : t)));
    currentTurnRef.current = null;
  }, []);

  // ─── Server frame handling ─────────────────────────────────────────────────

  const handleServerFrame = useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case "user_transcript": {
        // The vendor recognized a completed user utterance.
        if (frame.user_transcript?.trim()) beginTurn(frame.user_transcript.trim());
        break;
      }
      case "agent_response_chunk": {
        if (frame.agent_response_chunk) appendAgentChunk(frame.agent_response_chunk);
        break;
      }
      case "agent_response": {
        if (frame.agent_response) appendAgentChunk(frame.agent_response);
        finishTurn();
        break;
      }
      case "agent_audio_chunk": {
        if (frame.agent_audio_chunk) enqueueAudio(base64ToInt16(frame.agent_audio_chunk));
        break;
      }
      case "interruption": {
        // User barge-in: the vendor already stopped generating; drop any
        // queued playback tail so the agent's next turn starts clean.
        interruptPlayback();
        finishTurn();
        break;
      }
      case "conversation_end": {
        finishTurn();
        break;
      }
      case "ping": {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "pong" }));
        }
        break;
      }
      default:
        break;
    }
  }, [appendAgentChunk, beginTurn, enqueueAudio, finishTurn, interruptPlayback]);

  // ─── Mic audio flush loop ──────────────────────────────────────────────────

  const startAudioFlush = useCallback(() => {
    flushTimerRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || pendingAudioRef.current.length === 0) return;
      // Merge pending Int16 frames → one base64 chunk per flush tick.
      const totalSamples = pendingAudioRef.current.reduce((sum, arr) => sum + arr.length, 0);
      const merged = new Int16Array(totalSamples);
      let offset = 0;
      for (const arr of pendingAudioRef.current) { merged.set(arr, offset); offset += arr.length; }
      pendingAudioRef.current = [];
      const bytes = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      ws.send(JSON.stringify({
        type: "user_audio_chunk",
        user_audio_chunk: btoa(binary),
        sampling_rate: MIC_SAMPLE_RATE,
      }));
    }, AUDIO_FLUSH_MS);
  }, []);

  const startKeepAlive = useCallback(() => {
    keepAliveTimerRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "keep_alive" }));
      }
    }, KEEP_ALIVE_MS);
  }, []);

  // ─── Public surface ─────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
    if (keepAliveTimerRef.current) { clearInterval(keepAliveTimerRef.current); keepAliveTimerRef.current = null; }
    interruptPlayback();
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    try { workletRef.current?.disconnect(); } catch {}
    workletRef.current = null;
    try { captureCtxRef.current?.close(); } catch {}
    captureCtxRef.current = null;
    try { playbackCtxRef.current?.close(); } catch {}
    playbackCtxRef.current = null;
    playbackAnalyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    sessionRef.current = null;
    pendingAudioRef.current = [];
    currentTurnRef.current = null;
    setOutputAnalyserNode(null);
  }, [interruptPlayback]);

  const connect = useCallback(async () => {
    const myToken = ++connectTokenRef.current;
    setError(null);
    setStatus("connecting");
    try {
      // 1. Signed-URL bootstrap — every guard runs server-side.
      const response = await fetch(apiUrl("/api/voice/elevenlabs/agent-session"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as AgentSessionPayload;
      if (!response.ok) throw new Error(payload.error ?? `Mode-B session failed (HTTP ${response.status})`);
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
      captureCtxRef.current = new AudioCtxClass({ sampleRate: MIC_SAMPLE_RATE });
      playbackCtxRef.current = new AudioCtxClass({ sampleRate: PLAYBACK_SAMPLE_RATE });
      await captureCtxRef.current.resume();
      await playbackCtxRef.current.resume();

      const playbackAnalyser = playbackCtxRef.current.createAnalyser();
      playbackAnalyser.fftSize = 512;
      playbackAnalyser.smoothingTimeConstant = 0.85;
      playbackAnalyser.connect(playbackCtxRef.current.destination);
      playbackAnalyserRef.current = playbackAnalyser;
      setOutputAnalyserNode(playbackAnalyser);

      // 4. Shared AudioWorklet mic capture (Float32 → Int16 → port posts).
      await captureCtxRef.current.audioWorklet.addModule("/worklets/audio-recorder-worklet.js");
      const micSource = captureCtxRef.current.createMediaStreamSource(mic);
      workletRef.current = new AudioWorkletNode(captureCtxRef.current, "audio-recorder-worklet");
      workletRef.current.port.onmessage = (ev: MessageEvent<Int16Array>) => {
        pendingAudioRef.current.push(ev.data);
      };
      micSource.connect(workletRef.current);

      // 5. Open the vendor websocket with the signed URL. The signedUrl from
      //    the platform already carries agent_id + signature + audio format
      //    query params — nothing is appended client-side.
      const ws = new WebSocket(payload.signedUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (myToken !== connectTokenRef.current) { ws.close(); return; }
        setStatus("connected");
        startAudioFlush();
        startKeepAlive();
        if (options.voiceGreeting) {
          setHistory((prev) => [
            ...prev,
            {
              id: generateTurnId(),
              question: "",
              answer: options.voiceGreeting as string,
              sources: [],
              status: "done" as const,
            },
          ]);
        }
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (myToken !== connectTokenRef.current) return;
        try {
          handleServerFrame(JSON.parse(event.data) as ServerFrame);
        } catch {
          // Malformed frames are dropped — the session continues.
        }
      };

      ws.onerror = () => {
        if (myToken !== connectTokenRef.current) return;
        setError("Mode-B voice connection failed. Check that Conversational AI is enabled and the CSP allows wss://api.elevenlabs.io.");
        setStatus("error");
      };

      ws.onclose = () => {
        if (myToken !== connectTokenRef.current) return;
        setStatus("idle");
      };
    } catch (err) {
      if (myToken !== connectTokenRef.current) return;
      const message = (err as Error).message;
      setError(message);
      setStatus("error");
      cleanup();
    }
  }, [cleanup, handleServerFrame, options.kbId, options.language?.assistant, options.voiceGreeting, startAudioFlush, startKeepAlive]);

  const disconnect = useCallback(() => {
    connectTokenRef.current++;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const interrupt = useCallback(() => {
    interruptPlayback();
  }, [interruptPlayback]);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    beginTurn(text.trim());
    ws.send(JSON.stringify({
      type: "user_message_chunk",
      user_message_chunk: text.trim(),
    }));
  }, [beginTurn]);

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
