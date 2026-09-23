"use client";

/**
 * src/modules/assistant/core/hooks/useElevenLabsConvAI.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs Agents (Mode B) — realtime websocket voice sessions.
 *
 *   mic ──(PCM16 16 kHz, ~100 ms batches)──► wss://api.elevenlabs.io
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
 * Frame protocol (2026-09 vendor spec — verified against the official
 * "Client events" / "Client to server events" documentation):
 *   server → client : conversation_initiation_metadata · ping · audio ·
 *                     user_transcript · agent_response ·
 *                     agent_chat_response_part (streaming text) ·
 *                     interruption · agent_response_correction ·
 *                     agent_response_complete
 *   client → server : {user_audio_chunk} (base64, no envelope fields) ·
 *                     {type:"user_message", text} ·
 *                     {type:"pong", event_id} (replies vendor pings — the
 *                     legacy keep_alive frame no longer exists)
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
import { setMicStreamMuted } from "../voice/mic-mute";

// ─── Tuning ──────────────────────────────────────────────────────────────────

const MIC_SAMPLE_RATE = 16_000;
const PLAYBACK_SAMPLE_RATE = 16_000;
/** Flush captured mic audio in ~100 ms batches (protocol-flood guard). */
const AUDIO_FLUSH_MS = 100;

// ─── G.711 μ-law codec (client-side safety net) ─────────────────────────────
// Agents default to PCM 16 kHz, but a telephony-configured agent (created
// with telephony: true) speaks/hears μ-law 8 kHz. The initiation metadata
// tells us which formats THIS session uses, so the browser adapts instead
// of producing garbage audio when a phone-oriented agent serves web chats.

const MULAW_BIAS = 0x84;
const MULAW_MAX = 32767;

function mulawDecodeSample(byte: number): number {
  byte = ~byte & 0xff;
  const sign = byte & 0x80;
  const exp = (byte >> 4) & 0x07;
  const mantissa = byte & 0x0f;
  let sample = ((mantissa << 1) + 33) << (exp + 2);
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function mulawEncodeSample(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  sample = Math.min(Math.abs(sample) + MULAW_BIAS, MULAW_MAX + MULAW_BIAS);
  let exp = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}
  const mantissa = (sample >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mantissa) & 0xff;
}

/** μ-law bytes (8 kHz) → PCM16 samples, linearly upsampled ×2 to 16 kHz. */
function mulawBytesToPcm16_16k(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i++) {
    const s = mulawDecodeSample(bytes[i]!);
    out[i * 2] = s;
    out[i * 2 + 1] = s;
  }
  return out;
}

/** PCM16 16 kHz mic frames → μ-law bytes (8 kHz) for telephony agents. */
function pcm16ToMulawBytes_8k(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = mulawEncodeSample(Math.round((pcm[i * 2]! + pcm[i * 2 + 1]!) / 2));
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type AgentSessionPayload = {
  mode: "conversational";
  signedUrl: string;
  agentId: string;
  expiresAt: number;
  kbId: string | null;
  error?: string;
};

// ─── Vendor frame shapes (subset the UI consumes; one loose type — the
// vendor may add fields and unknown event types must not break parsing) ──────

type ServerFrame = {
  type?: string;
  ping_event?: { event_id?: number };
  audio_event?: { audio_base_64?: string };
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  text_response_part?: { type?: string; text?: string };
  agent_response_correction_event?: { corrected_agent_response?: string };
  conversation_initiation_metadata_event?: {
    conversation_id?: string;
    agent_output_audio_format?: string;
    user_input_audio_format?: string;
  };
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
  // ── Microphone mute ("pause") ────────────────────────────────────────────
  // track.enabled=false feeds the ElevenLabs Conversational-AI capture chain
  // digital silence while the session stays connected.
  const [micMuted, setMicMutedState] = useState(false);
  const micMutedRef = useRef(false);
  const setMicMuted = useCallback((muted: boolean) => {
    micMutedRef.current = muted;
    setMicMutedState(muted);
    setMicStreamMuted(micStreamRef.current, muted);
  }, []);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const pendingAudioRef = useRef<Int16Array[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  // Playback chain (identical queue discipline to Mode A).
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackQueueRef = useRef<{ buffer: AudioBuffer; source: AudioBufferSourceNode }[]>([]);
  const playingRef = useRef(false);

  // In-flight turn bookkeeping.
  const currentTurnRef = useRef<VoiceTurn | null>(null);
  const agentAnswerRef = useRef("");

  // Negotiated audio formats for THIS session (from initiation metadata).
  // Defaults match how Clara creates agents (PCM 16 kHz both directions).
  const agentOutputFormatRef = useRef<"pcm_16000" | "ulaw_8000">("pcm_16000");
  const userInputFormatRef = useRef<"pcm_16000" | "ulaw_8000">("pcm_16000");

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

  /** Opens a turn when none exists (agent-initiated turns, e.g. first message). */
  const ensureTurn = useCallback(() => {
    if (currentTurnRef.current) return;
    beginTurn("");
  }, [beginTurn]);

  const appendAgentChunk = useCallback((chunk: string) => {
    const turn = currentTurnRef.current;
    if (!turn) return;
    agentAnswerRef.current += chunk;
    setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, answer: agentAnswerRef.current } : t)));
  }, []);

  const replaceAgentAnswer = useCallback((text: string) => {
    const turn = currentTurnRef.current;
    if (!turn) return;
    agentAnswerRef.current = text;
    setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, answer: text } : t)));
  }, []);

  const finishTurn = useCallback(() => {
    const turn = currentTurnRef.current;
    if (!turn) return;
    setHistory((prev) => prev.map((t) => (t.id === turn.id ? { ...t, status: "done" } : t)));
    currentTurnRef.current = null;
  }, []);

  // ─── Server frame handling (current vendor protocol) ────────────────────────

  const handleServerFrame = useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case "conversation_initiation_metadata": {
        // The vendor session is live; the formats tell us how to decode
        // agent audio and encode mic audio for THIS session (an agent
        // created with telephony: true speaks μ-law 8 kHz).
        const meta = frame.conversation_initiation_metadata_event;
        if (meta?.agent_output_audio_format === "ulaw_8000") agentOutputFormatRef.current = "ulaw_8000";
        if (meta?.user_input_audio_format === "ulaw_8000") userInputFormatRef.current = "ulaw_8000";
        setStatus((prev) => (prev === "connected" ? prev : "connected"));
        break;
      }
      case "ping": {
        // Health check — must answer with a pong carrying the ping's event id.
        const ws = wsRef.current;
        const eventId = frame.ping_event?.event_id;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "pong", ...(eventId != null ? { event_id: eventId } : {}) }));
        }
        break;
      }
      case "audio": {
        // Agent voice: base64 chunk — PCM16 (default agents) or μ-law 8 kHz
        // (telephony-configured agents), decoded per initiation metadata.
        const b64 = frame.audio_event?.audio_base_64;
        if (b64) {
          enqueueAudio(
            agentOutputFormatRef.current === "ulaw_8000"
              ? mulawBytesToPcm16_16k(base64ToBytes(b64))
              : base64ToInt16(b64),
          );
        }
        break;
      }
      case "user_transcript": {
        // Vendor VAD committed a user utterance — open the matching turn.
        const text = frame.user_transcription_event?.user_transcript?.trim();
        if (text) beginTurn(text);
        break;
      }
      case "agent_chat_response_part": {
        // Streaming text deltas (enabled via the agent's client_events).
        const part = frame.text_response_part;
        if (part?.type === "start") {
          ensureTurn();
        } else if (part?.type === "delta" && part.text) {
          ensureTurn();
          appendAgentChunk(part.text);
        }
        // "stop" — the final agent_response event commits + closes the turn.
        break;
      }
      case "agent_response": {
        // Complete agent message (usually after its audio started playing).
        const text = frame.agent_response_event?.agent_response;
        if (text != null && text !== "") {
          ensureTurn();
          replaceAgentAnswer(text);
        }
        finishTurn();
        break;
      }
      case "interruption": {
        // User barge-in: the vendor already stopped generating; drop any
        // queued playback tail so the agent's next turn starts clean.
        interruptPlayback();
        break;
      }
      case "agent_response_correction": {
        // Truncated response after an interruption — replace the open turn.
        const corrected = frame.agent_response_correction_event?.corrected_agent_response;
        if (corrected != null) {
          ensureTurn();
          replaceAgentAnswer(corrected);
        }
        finishTurn();
        break;
      }
      case "agent_response_complete": {
        finishTurn();
        break;
      }
      default:
        break;
    }
  }, [appendAgentChunk, beginTurn, enqueueAudio, ensureTurn, finishTurn, interruptPlayback, replaceAgentAnswer]);

  // ─── Mic audio flush loop ──────────────────────────────────────────────────

  const startAudioFlush = useCallback(() => {
    flushTimerRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || pendingAudioRef.current.length === 0) return;
      // Merge pending Int16 frames → ONE {user_audio_chunk} frame per tick.
      // The current protocol takes the bare {user_audio_chunk} object — no
      // envelope `type`, no sampling_rate. Mic capture is PCM16 16 kHz; a
      // telephony-configured agent expects μ-law 8 kHz instead.
      const totalSamples = pendingAudioRef.current.reduce((sum, arr) => sum + arr.length, 0);
      const merged = new Int16Array(totalSamples);
      let offset = 0;
      for (const arr of pendingAudioRef.current) { merged.set(arr, offset); offset += arr.length; }
      pendingAudioRef.current = [];
      const payload = userInputFormatRef.current === "ulaw_8000"
        ? bytesToBase64(pcm16ToMulawBytes_8k(merged))
        : bytesToBase64(new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength));
      ws.send(JSON.stringify({ user_audio_chunk: payload }));
    }, AUDIO_FLUSH_MS);
  }, []);

  // ─── Public surface ─────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
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
    agentOutputFormatRef.current = "pcm_16000";
    userInputFormatRef.current = "pcm_16000";
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
          ...(options.draftMode ? { scope: "draft" } : {}),
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
      // Sticky mute across reconnects — a muted visitor stays muted.
      setMicStreamMuted(mic, micMutedRef.current);

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
      //    the platform already carries agent_id + conversation_signature —
      //    nothing is appended client-side. The agent's configured first
      //    message (if any) is spoken BY THE VENDOR, so no local greeting
      //    echo is rendered here — it would duplicate the agent_response.
      const ws = new WebSocket(payload.signedUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (myToken !== connectTokenRef.current) { ws.close(); return; }
        setStatus("connected");
        startAudioFlush();
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
  }, [cleanup, handleServerFrame, options.kbId, options.language?.assistant, startAudioFlush, options.draftMode]);

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
    // Current protocol: user_message (was user_message_chunk).
    ws.send(JSON.stringify({
      type: "user_message",
      text: text.trim(),
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
