"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  assistantPrompts,
  buildLanguageGuidance,
  resolveLanguagePreferences,
  type LanguagePreferences,
} from "../config";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { setMicStreamMuted } from "../voice/mic-mute";
import { buildSameOriginRelayWsUrl } from "@/modules/voice-core/realtime/relay-url";
import { GeminiTurnTelemetry } from "@/modules/voice-core/realtime/gemini-telemetry";
import type { Source } from "../models";

// ─── Debug flag ───────────────────────────────────────────────────────────────
// Set to true during development to log every WebSocket event to the console.
const DEBUG_EVENTS = false;

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "connecting" | "connected" | "error";
type TurnStatus = "pending" | "speaking" | "done";

type VoiceTurn = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  status: TurnStatus;
};

type Options = {
  documentId?: string | null;
  kbId?: string | null;
  documentOverview?: string;
  voiceGreeting?: string;
  language?: LanguagePreferences;
  /**
   * Public embed API key (real `clr_...` value — never a bypass token). When
   * present, session/RAG requests route to the public /api/embed/* endpoints
   * with this key as a Bearer token instead of the protected endpoints +
   * platform JWT. Used only by the public embed voice widget.
   */
  embedApiKey?: string;
  /** Draft-preview mode (agent preview): requests carry scope:"draft". */
  draftMode?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * AudioWorklet fires every ~8 ms (128-sample frame at 16 kHz). Sending each
 * frame immediately floods the WebSocket with ~125 messages/s. Batching to
 * 100 ms reduces this to ~10 messages/s with no perceptible latency change.
 */
const AUDIO_FLUSH_INTERVAL_MS = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTurnId(): string {
  try {
    const g = globalThis as typeof globalThis & { msCrypto?: Crypto };
    const crypto = globalThis.crypto ?? g.msCrypto;
    if (crypto?.randomUUID) return crypto.randomUUID();
    if (crypto?.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return [
        hex.slice(0, 4).join(""),
        hex.slice(4, 6).join(""),
        hex.slice(6, 8).join(""),
        hex.slice(8, 10).join(""),
        hex.slice(10).join(""),
      ].join("-");
    }
  } catch {}
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  const CHUNK = 8_192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.byteLength)))
    );
  }
  return btoa(binary);
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Extract text from a Gemini transcription object.
 *
 * The Gemini Live v1alpha API sends inputTranscription and outputTranscription
 * in the parts-array format:
 *
 *   { parts: [{ text: "the spoken text" }] }   ← v1alpha standard
 *
 * NOT as a flat { text: "..." } object (older assumption). Accessing .text
 * directly always returns undefined for the parts-based format, which meant
 * user speech transcripts were silently dropped and turn.question was always
 * blank. This helper handles both shapes for API-version resilience.
 */
function extractTranscriptionText(obj: Record<string, unknown>): string {
  // Primary path: parts array (v1alpha standard)
  if (Array.isArray(obj.parts)) {
    return (obj.parts as Array<Record<string, unknown>>)
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("");
  }
  // Fallback: flat text field (older revisions)
  return typeof obj.text === "string" ? obj.text : "";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useGeminiLive
 *
 * Full-featured Gemini Multimodal Live API voice hook. Provides an identical
 * public API surface to useOpenAIRealtime so both providers are fully
 * interchangeable from the VoiceChatModal's perspective.
 *
 * ── Architecture (message flow) ──────────────────────────────────────────────
 *
 *   Browser (this hook)                      Gemini Live v1alpha (via relay)
 *   ──────────────────                       ──────────────────
 *   POST /api/gemini/session  ─────────────► returns { realtime: { endpoint,
 *                                              token }, model, voice } — the
 *                                              long-lived GEMINI_API_KEY
 *                                              never leaves the server.
 *   WebSocket(wss://<self>/api/voice/gemini/realtime?token=<hmac>)
 *                             ── relay ──►  BidiGenerateContent stream
 *   { setup: { … } }          ─────────────► Gemini initialises session
 *                             ◄─────────────  setupComplete
 *   realtimeInput (PCM-16)    ─────────────► user speech, batched @ 100 ms
 *                             ◄─────────────  inputTranscription (parts[].text)
 *                             ◄─────────────  toolCall: rag_search
 *   toolResponse              ─────────────► RAG results
 *                             ◄─────────────  modelTurn (inlineData audio)
 *                             ◄─────────────  outputAudioTranscription (text)
 *                             ◄─────────────  turnComplete / interrupted
 *
 * ── RAG integration ───────────────────────────────────────────────────────────
 *
 *   Setup sends toolConfig { mode: "AUTO" } with a rag_search declaration.
 *   Gemini autonomously calls rag_search when the question needs policy context.
 *   The handleMessage toolCall handler fetches /api/rag/search, patches sources
 *   on the active turn, and returns results via toolResponse. Gemini resumes
 *   generation automatically after receiving the tool response (no additional
 *   response.create call is needed — this differs from the OpenAI Realtime API).
 *
 * ── Complete list of bugs fixed in this file ─────────────────────────────────
 *
 *   G1  inputTranscription text extraction: was checking .text at top level
 *       (always undefined in v1alpha). Fixed via extractTranscriptionText()
 *       which reads parts[0].text. User speech transcripts were silently lost;
 *       turn.question was always blank, RAG queries were always empty strings.
 *
 *   G2  outputTranscription same extraction bug as G1. Text fallback for
 *       turn.answer was silently broken.
 *
 *   G3  Double response: old code called scheduleRag(q) in the turnComplete
 *       handler and in sendText(). Each call fired performRagAndInject() after
 *       1500 ms, which sent a brand-new clientContent user turn + context,
 *       causing Gemini to generate a complete second response. Every voice
 *       utterance and every suggested-prompt click was answered twice.
 *       Removed both scheduleRag calls; the rag_search tool call path is the
 *       single, correct answer path.
 *
 *   G4  toolConfig { mode: "AUTO" } added to setup. Without it Gemini may not
 *       call rag_search even when the question clearly needs document context.
 *
 *   G5  documentId injected into systemInstruction so Gemini always passes
 *       the correct value to rag_search. Without it the model had to guess.
 *
 *   G6  interrupt() now sends { activityStart: {} }. This is the correct Gemini
 *       Live signal to indicate user is speaking, causing the server to stop
 *       its own generation and emit { serverContent: { interrupted: true } }.
 *       Old approach ({ clientContent: { turns:[], turnComplete:true } }) had
 *       no effect on server-side generation; audio kept streaming in.
 *
 *   G7  Removed proactive RAG refs (ragBusyRef, ragTimerRef, performRagAndInject,
 *       scheduleRag) that were the source of the double-response bug (G3).
 *
 *   G8  (NEW) ws.onclose on unexpected server-side close now calls cleanup()
 *       and surfaces an error. Previously only setStatus("idle") was called,
 *       leaving the mic stream, both AudioContexts, AudioWorklet, and flush
 *       timer all running indefinitely — a battery-draining resource leak.
 *
 *   G9  (NEW) responseModalities changed from ["AUDIO","TEXT"] to ["AUDIO"].
 *       "AUDIO"+"TEXT" is the TTS path: model generates text → TTS voices it.
 *       For native audio models (gemini-2.5-flash-native-audio-preview) the
 *       model generates audio directly. "TEXT" is silently ignored but adds
 *       confusion. Text transcript is correctly obtained via outputAudioTranscription.
 *
 *  G10  (NEW) toolResponse.functionResponses[] now includes name alongside id.
 *       The Gemini v1alpha FunctionResponse proto requires both fields.
 *       Without name, the model cannot reliably match responses to function
 *       declarations and may stall waiting for a matching response.
 *
 *  G11  (NEW) sendText no longer prepends the full document overview into the
 *       user-turn text body. The overview is already in the systemInstruction
 *       injected at connect time. Re-sending it doubled context size, created
 *       user-turn text that mixed system context with the actual question,
 *       and made turn.question in the history display show the full overview.
 */
export function useGeminiLive(opts?: Options) {
  const { documentId, kbId, documentOverview, voiceGreeting } = opts || {};
  const languagePrefs   = resolveLanguagePreferences(opts?.language);
  const languageGuidance = buildLanguageGuidance(languagePrefs);

  const [status,             setStatus]             = useState<Status>("idle");
  const [lastError,          setLastError]           = useState<string | null>(null);
  const [isSpeaking,         setIsSpeaking]         = useState(false);
  const [history,            setHistory]            = useState<VoiceTurn[]>([]);
  const [outputAnalyserNode, setOutputAnalyserNode] = useState<AnalyserNode | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const wsRef               = useRef<WebSocket | null>(null);
  const micStreamRef        = useRef<MediaStream | null>(null);
  // ── Microphone mute ("pause") ────────────────────────────────────────────
  // track.enabled=false silences the capture graph feeding the Gemini Live
  // socket while keeping the session alive (no renegotiation needed).
  const [micMuted, setMicMutedState] = useState(false);
  const micMutedRef = useRef(false);
  const setMicMuted = useCallback((muted: boolean) => {
    micMutedRef.current = muted;
    setMicMutedState(muted);
    setMicStreamMuted(micStreamRef.current, muted);
  }, []);
  const captureCtxRef       = useRef<AudioContext | null>(null);
  const playbackCtxRef      = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const workletRef          = useRef<AudioWorkletNode | null>(null);
  const playQueueRef        = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef     = useRef(0);
  const isSpeakingRef       = useRef(false);
  const connectTokenRef     = useRef(0);
  const isCleaningUpRef     = useRef(false);
  const setupCompleteRef    = useRef(false);
  const pendingAudioRef     = useRef<Int16Array[]>([]);
  const audioFlushTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTurnIdRef     = useRef<string | null>(null);
  const historyRef          = useRef<VoiceTurn[]>([]);
  // Accumulates the latest user speech transcript across inputTranscription
  // events so that modelTurn (which has no question reference) can look it up.
  const userQueryRef        = useRef("");
  // ── Latency telemetry (gap-closure Phase J — timings only, never transcripts) ──
  // Gemini is a vendor-native VAD lifecycle (no coordinator), so the measurement
  // rules live in the pure GeminiTurnTelemetry module (utterance boundary +
  // retroactive stt.final). Same stage names + `clara:voice:latency` window-event
  // contract as every other provider, so the benchmark harness measures Gemini
  // identically. Additive-only: the realtime flow below is untouched.
  const latencyTelRef        = useRef<GeminiTurnTelemetry | null>(null);

  const emitLatencyTelemetry = useCallback(() => {
    const event = latencyTelRef.current?.telemetry();
    if (!event) return;
    console.debug("[gemini-live] latency", event);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("clara:voice:latency", { detail: event }));
    }
  }, []);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // ── sendWS ────────────────────────────────────────────────────────────────

  const sendWS = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(payload)); } catch {}
    }
  }, []);

  // ── History helpers ───────────────────────────────────────────────────────

  const addTurn = useCallback((turn: VoiceTurn) => {
    setHistory((prev) => {
      const next = [...prev, turn];
      historyRef.current = next;
      return next;
    });
  }, []);

  const patchTurn = useCallback((id: string, patch: Partial<VoiceTurn>) => {
    setHistory((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      historyRef.current = next;
      return next;
    });
  }, []);

  // ── Audio playback ────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    for (const src of playQueueRef.current) {
      try { src.stop(); } catch {}
      try { src.disconnect(); } catch {}
    }
    playQueueRef.current = [];
    const ctx = playbackCtxRef.current;
    if (ctx) nextPlayTimeRef.current = ctx.currentTime;
    if (isSpeakingRef.current) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Decode a PCM-16 Int16Array and schedule it for gapless sequential playback
   * at 24 kHz (Gemini's output sample rate).
   *
   * Audio graph: bufferSource → playbackAnalyser → destination
   *
   * The analyser sits in-line so useAudioVisualizer reads real frequency data
   * without creating a second AudioContext (cross-context connections throw
   * NotSupportedError in all browsers).
   */
  const playPCM16 = useCallback((int16: Int16Array) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32_768.0;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24_000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const analyser = playbackAnalyserRef.current;
    if (analyser) {
      source.connect(analyser);
      // analyser is already connected to ctx.destination (wired in connect())
    } else {
      source.connect(ctx.destination);
    }

    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
    playQueueRef.current.push(source);

    if (!isSpeakingRef.current) {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
    }

    source.onended = () => {
      const idx = playQueueRef.current.indexOf(source);
      if (idx > -1) playQueueRef.current.splice(idx, 1);
      if (playQueueRef.current.length === 0) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      }
    };
  }, []);

  // ── Audio capture flushing ────────────────────────────────────────────────

  /**
   * Drain the pending-audio accumulator and send one batched realtimeInput
   * message. Called by setInterval every AUDIO_FLUSH_INTERVAL_MS ms once
   * setupComplete has fired.
   *
   * Guards:
   *  • setupCompleteRef — prevents sending before Gemini is ready
   *  • ws.readyState   — prevents sending on a closing/closed socket
   */
  const flushAudio = useCallback(() => {
    const ws = wsRef.current;
    if (!setupCompleteRef.current) return;
    if (ws?.readyState !== WebSocket.OPEN) return;

    const chunks = pendingAudioRef.current.splice(0);
    if (chunks.length === 0) return;

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const combined = new Int16Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [
          { mimeType: "audio/pcm;rate=16000", data: int16ToBase64(combined) },
        ],
      },
    }));
  }, []);

  // ── cleanup ───────────────────────────────────────────────────────────────

  /**
   * Tear down every resource acquired during connect():
   * flush timer, playback queue, analyser, worklet, mic stream, AudioContexts,
   * and the WebSocket itself.
   *
   * The isCleaningUpRef guard prevents ws.onclose → cleanup → ws.close → onclose
   * infinite recursion.
   */
  const cleanup = useCallback(() => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    setupCompleteRef.current = false;

    if (audioFlushTimerRef.current !== null) {
      clearInterval(audioFlushTimerRef.current);
      audioFlushTimerRef.current = null;
    }

    stopPlayback();

    try { playbackAnalyserRef.current?.disconnect(); } catch {}
    playbackAnalyserRef.current = null;
    setOutputAnalyserNode(null);

    try { workletRef.current?.disconnect(); } catch {}
    workletRef.current = null;

    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    micStreamRef.current = null;

    try { captureCtxRef.current?.close(); } catch {}
    captureCtxRef.current = null;

    try { playbackCtxRef.current?.close(); } catch {}
    playbackCtxRef.current = null;

    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close();
    }

    pendingAudioRef.current = [];
    userQueryRef.current    = "";
    activeTurnIdRef.current = null;
    // Telemetry lives for the session lifetime; the next connect() re-creates it.
    latencyTelRef.current   = null;

    setHistory([]);
    historyRef.current = [];

    // Reset the guard after the current call stack clears so that any
    // re-entrant onclose/onerror handlers see the correct state.
    setTimeout(() => { isCleaningUpRef.current = false; }, 0);
  }, [stopPlayback]);

  // ── handleMessage ─────────────────────────────────────────────────────────

  const handleMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      if (DEBUG_EVENTS) console.debug("[Gemini ←]", msg);

      // ── setupComplete ────────────────────────────────────────────────────
      if ("setupComplete" in msg) {
        setupCompleteRef.current = true;
        setStatus("connected");

        // Clear audio accumulated during the connection handshake (we don't
        // want to flood Gemini with speech from before it was ready).
        pendingAudioRef.current = [];

        // Start the flush timer. Audio captured from this point onward will
        // be batched and sent every AUDIO_FLUSH_INTERVAL_MS ms.
        if (audioFlushTimerRef.current === null) {
          audioFlushTimerRef.current = setInterval(flushAudio, AUDIO_FLUSH_INTERVAL_MS);
        }

        // Optional greeting turn.
        const greeting = voiceGreeting?.trim();
        if (greeting) {
          const id = generateTurnId();
          activeTurnIdRef.current = id;
          addTurn({ id, question: "Welcome message", answer: "", sources: [], status: "pending" });
          // Greeting is a system generation (mirrors the OpenAI baseline):
          // its latency record is replaced by the first committed user turn.
          latencyTelRef.current?.greetingTurn();
          sendWS({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: greeting }] }],
              turnComplete: true,
            },
          });
        }
        return;
      }

      // ── Tool call: rag_search ────────────────────────────────────────────
      //
      // Gemini sends toolCall when it needs document context.
      // We fetch /api/rag/search, patch sources on the active turn, then return
      // results via toolResponse. Gemini resumes generation automatically after
      // receiving the response (no explicit continue/response.create needed).
      if (
        msg.toolCall &&
        typeof msg.toolCall === "object" &&
        Array.isArray((msg.toolCall as Record<string, unknown>).functionCalls)
      ) {
        type FC = { id: string; name: string; args: Record<string, unknown> };
        const calls = (msg.toolCall as { functionCalls: FC[] }).functionCalls;

        for (const fc of calls) {
          if (fc.name !== "rag_search") continue;

          // The toolCall itself is the model's first output evidence — the
          // telemetry module commits the retroactive stt.final here too.
          latencyTelRef.current?.ragStart();

          const q     = String(fc.args?.query      || "").trim();
          const kbIdValue = String(kbId || "").trim();
          // FIX G5: fall back to the hook's documentId if Gemini passed the
          // wrong value or omitted it. The system instruction now includes the
          // real ID so this fallback should rarely be needed.
          const docId = String(fc.args?.documentId || documentId || "").trim();

          if (!q || (!kbIdValue && !docId)) {
            // Always respond or Gemini will stall waiting for toolResponse.
            sendWS({
              toolResponse: {
                functionResponses: [{
                  id:   fc.id,
                  name: fc.name,               // FIX G10: name is required
                  response: { error: "rag_search: missing query or kbId/documentId." },
                }],
              },
            });
            continue;
          }

          void (async () => {
            try {
              const endpoint = opts?.embedApiKey ? "/api/embed/rag" : "/api/rag/search";
              const headers = opts?.embedApiKey
                ? { "Content-Type": "application/json", Authorization: `Bearer ${opts.embedApiKey}` }
                : withAuthHeaders({ "Content-Type": "application/json" });

              const res = await fetch(apiUrl(endpoint), {
                method: "POST",
                headers,
                body: JSON.stringify(
                  kbIdValue
                    ? { query: q, kbId: kbIdValue, ...(opts?.draftMode ? { scope: "draft" } : {}) }
                    : { query: q, documentId: docId }
                ),
              });
              if (!res.ok) throw new Error(`RAG search HTTP ${res.status}`);
              const payload = await res.json();
              latencyTelRef.current?.ragEnd();
              const sources: Source[] = Array.isArray(payload?.sources)
                ? payload.sources : [];
              const grounded = payload?.grounded === true || sources.length > 0;
              const outOfScopeReply =
                typeof payload?.outOfScopeReply === "string" && payload.outOfScopeReply.trim()
                  ? payload.outOfScopeReply.trim()
                  : "I can only answer questions about the topics I have been set up for.";

              // Attach sources to the active history turn.
              if (!activeTurnIdRef.current) {
                const id = generateTurnId();
                activeTurnIdRef.current = id;
                addTurn({ id, question: q, answer: "", sources, status: "pending" });
              } else {
                patchTurn(activeTurnIdRef.current, { sources });
              }

              sendWS({
                toolResponse: {
                  functionResponses: [{
                    id:   fc.id,
                    name: fc.name,             // FIX G10: required by FunctionResponse proto
                    response: {
                      output: JSON.stringify({
                        context: grounded
                          ? payload.context
                          : `GROUNDING GUARD: No sufficiently relevant information was found in the knowledge base. Do not answer from general knowledge. Say exactly: "${outOfScopeReply}"`,
                        sources: payload.sources,
                        grounded,
                        outOfScopeReply,
                      }),
                    },
                  }],
                },
              });
            } catch (err) {
              // Always respond even on error so Gemini isn't blocked.
              sendWS({
                toolResponse: {
                  functionResponses: [{
                    id:   fc.id,
                    name: fc.name,             // FIX G10
                    response: { error: (err as Error)?.message ?? "rag_search failed" },
                  }],
                },
              });
            }
          })();
        }
        return;
      }

      // ── serverContent ────────────────────────────────────────────────────
      if (msg.serverContent && typeof msg.serverContent === "object") {
        const sc = msg.serverContent as Record<string, unknown>;

        // ── inputTranscription — user's speech text ──────────────────────
        //
        // FIX G1: Gemini Live v1alpha sends this as
        //   { inputTranscription: { parts: [{ text: "..." }] } }
        // NOT as { inputTranscription: { text: "..." } }.
        // Accessing .text directly was always undefined, silently discarding
        // every user transcript. extractTranscriptionText() reads parts[].text.
        //
        // Gemini sends the full accumulated transcript (not deltas), so we
        // replace userQueryRef and the turn question on each event.
        if (sc.inputTranscription && typeof sc.inputTranscription === "object") {
          const transcript = extractTranscriptionText(
            sc.inputTranscription as Record<string, unknown>
          ).trim();

          if (transcript) {
            userQueryRef.current = transcript;
            // Every inputTranscription carrying text feeds the utterance
            // tracker (first event of a new utterance begins a fresh record).
            latencyTelRef.current?.userTranscript();

            let turnId = activeTurnIdRef.current;
            if (!turnId) {
              turnId = generateTurnId();
              activeTurnIdRef.current = turnId;
              addTurn({ id: turnId, question: transcript, answer: "", sources: [], status: "pending" });
            } else {
              patchTurn(turnId, { question: transcript });
            }
          }
        }

        // ── modelTurn — audio PCM chunks + inline text ───────────────────
        //
        // inlineData: base64 PCM-16 at 24 kHz → queue for gapless playback.
        // part.text: inline text from the model (present when TEXT modality is
        //   active; for native audio models this is typically absent — rely on
        //   outputAudioTranscription instead, handled below).
        if (
          sc.modelTurn &&
          typeof sc.modelTurn === "object" &&
          Array.isArray((sc.modelTurn as Record<string, unknown>).parts)
        ) {
          const parts = (
            sc.modelTurn as { parts: Array<Record<string, unknown>> }
          ).parts;

          for (const part of parts) {
            // Audio chunk
            if (
              part.inlineData &&
              typeof (part.inlineData as Record<string, unknown>).mimeType === "string" &&
              ((part.inlineData as Record<string, unknown>).mimeType as string)
                .startsWith("audio/pcm") &&
              typeof (part.inlineData as Record<string, unknown>).data === "string"
            ) {
              const int16 = base64ToInt16(
                (part.inlineData as Record<string, unknown>).data as string
              );
              // First audio chunk = provider's first synthesized audio, queued
              // for immediate gapless playback (browser.first_audio instant).
              latencyTelRef.current?.modelAudio();
              playPCM16(int16);
            }

            // Inline text (present only when TEXT modality is enabled)
            if (typeof part.text === "string" && part.text) {
              latencyTelRef.current?.modelText();
              if (!activeTurnIdRef.current) {
                const id = generateTurnId();
                activeTurnIdRef.current = id;
                addTurn({
                  id,
                  question: userQueryRef.current || "Voice question",
                  answer: "",
                  sources: [],
                  status: "speaking",
                });
              }
              const tId = activeTurnIdRef.current!;
              const existing = historyRef.current.find((t) => t.id === tId);
              patchTurn(tId, {
                answer: (existing?.answer ?? "") + part.text,
                status: "speaking",
              });
            }
          }
        }

        // ── outputAudioTranscription — model's spoken text ───────────────
        //
        // FIX G2: Same extraction bug as G1 — was checking .text directly.
        // This is the PRIMARY text source for native audio models (which don't
        // produce modelTurn.parts[].text). Transcription events arrive
        // interleaved with audio; we use it only when no text answer exists yet
        // to avoid overwriting inline text from non-native models.
        //
        // FIX G9 side-effect: with responseModalities: ["AUDIO"], modelTurn
        // will never carry .text, so outputAudioTranscription is now the sole
        // text source. It may arrive in segments; we append, not replace.
        if (
          sc.outputTranscription &&
          typeof sc.outputTranscription === "object"
        ) {
          const oText = extractTranscriptionText(
            sc.outputTranscription as Record<string, unknown>
          ).trim();

          if (oText) {
            // Model's spoken-text stream — the LLM first-token instant.
            latencyTelRef.current?.modelText();
            // Create a turn if none is active (e.g. greeting response before
            // any inputTranscription has arrived).
            if (!activeTurnIdRef.current) {
              const id = generateTurnId();
              activeTurnIdRef.current = id;
              addTurn({
                id,
                question: userQueryRef.current || "Voice question",
                answer: "",
                sources: [],
                status: "speaking",
              });
            }
            const tId = activeTurnIdRef.current;
            const existing = historyRef.current.find((t) => t.id === tId);
            if (existing) {
              // Append so that multiple transcription events build up the full
              // answer incrementally (matching the streaming feel of the text path).
              patchTurn(tId, {
                answer: existing.answer + (existing.answer && !existing.answer.endsWith(" ") ? " " : "") + oText,
                status: "speaking",
              });
            }
          }
        }

        // ── turnComplete ─────────────────────────────────────────────────
        //
        // FIX G3: The old code called scheduleRag(userQueryRef.current) here.
        // 1500 ms later performRagAndInject() sent a SECOND clientContent user
        // turn with the same question, causing Gemini to generate a complete
        // second response. Every utterance was answered twice.
        //
        // The rag_search tool call path (toolConfig AUTO) is the single correct
        // approach. Gemini calls rag_search itself when it needs context, we
        // return results, and it responds once. No second turn needed.
        if (sc.turnComplete) {
          if (activeTurnIdRef.current) {
            patchTurn(activeTurnIdRef.current, { status: "done" });
          }
          // Turn closed — emit the per-turn latency record (timings only).
          latencyTelRef.current?.turnComplete();
          emitLatencyTelemetry();
          activeTurnIdRef.current = null;
          userQueryRef.current    = "";
          // No scheduleRag() — see FIX G3 above.
        }

        // ── interrupted — Gemini's VAD stopped model generation ──────────
        if (sc.interrupted) {
          // Vendor barge-in: close the utterance so the next user transcript
          // opens a fresh latency record (interrupt mark lands on the dying one).
          latencyTelRef.current?.interrupted();
          stopPlayback();
          if (activeTurnIdRef.current) {
            patchTurn(activeTurnIdRef.current, { status: "done" });
          }
          activeTurnIdRef.current = null;
        }
      }
    } catch (e) {
      console.error("[useGeminiLive] message parse error:", e);
    }
  }, [
    addTurn,
    documentId,
    kbId,
    flushAudio,
    opts?.embedApiKey,
    patchTurn,
    playPCM16,
    sendWS,
    stopPlayback,
    voiceGreeting,
    emitLatencyTelemetry,
    // scheduleRag / performRagAndInject intentionally absent (FIX G3/G7)
    opts?.draftMode,
  ]);

  // Keep the ref current so ws.onmessage always calls the latest closure
  // without ws needing to be re-assigned on every render.
  const handleMessageRef = useRef(handleMessage);
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage, opts?.draftMode]);

  // ── connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    const myToken = ++connectTokenRef.current;
    setStatus("connecting");
    setLastError(null);
    isCleaningUpRef.current = false;

    // ── Connection timeout guard ─────────────────────────────────────────
    // 30 s is generous for WebSocket + Gemini initialisation (~1–3 s typical).
    const CONNECT_TIMEOUT_MS = 30_000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const clearTimeoutGuard = () => {
      if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
    };

    timeoutId = setTimeout(() => {
      if (myToken === connectTokenRef.current) {
        setLastError("Connection timed out after 30 s. Check your internet connection.");
        setStatus("error");
        cleanup();
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      // ── 1. Fetch session config from server (API key never in browser) ──
      const endpoint = opts?.embedApiKey ? "/api/embed/session" : "/api/gemini/session";
      const headers = opts?.embedApiKey
        ? { "Content-Type": "application/json", Authorization: `Bearer ${opts.embedApiKey}` }
        : withAuthHeaders({ "Content-Type": "application/json" });

      const sessRes = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers,
        body: JSON.stringify({
          language:  languagePrefs.assistant,
          languages: languagePrefs.customer,
          ...(kbId ? { kbId } : {}),
          ...(opts?.draftMode ? { scope: "draft" } : {}),
        }),
      });
      if (!sessRes.ok) throw new Error(await sessRes.text());
      const session = await sessRes.json();
      // Per-session latency telemetry (gap-closure Phase J) — created after the
      // session descriptor arrives; the greeting/first committed user turn
      // replaces the boot record inside the module. Additive-only wiring.
      const { realtime, model, voice, instructions } = session as {
        realtime: { endpoint: string; token: string };
        model: string;
        voice: string;
        instructions?: string | null;
      };
      latencyTelRef.current = new GeminiTurnTelemetry();
      latencyTelRef.current.sessionReady(typeof model === "string" ? model : null);
      // Gap-closure Phase D: the WS URL is built CLIENT-SIDE from the relay
      // descriptor — same origin, HMAC capability token as the only query
      // parameter. The long-lived GEMINI_API_KEY never appears in any URL the
      // browser constructs or receives (scripts/gemini-relay.mjs holds it
      // server-side and pipes the BidiGenerateContent protocol verbatim).
      if (!realtime?.endpoint || !realtime?.token) {
        throw new Error("Missing relay descriptor in Gemini session response.");
      }
      const wsUrl = buildSameOriginRelayWsUrl({
        endpoint: apiUrl(realtime.endpoint),
        token: realtime.token,
      });
      if (myToken !== connectTokenRef.current) { clearTimeoutGuard(); return; }

      // ── 2. Acquire microphone ────────────────────────────────────────────
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation:  true,
            noiseSuppression:  true,
            autoGainControl:   true,
            channelCount:      1,
          },
        });
      } catch (domErr) {
        const e = domErr as DOMException;
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          throw new Error(
            "Microphone access was denied. Click the microphone icon in your " +
            "browser's address bar to allow access, then try again."
          );
        }
        if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          throw new Error(
            "No microphone detected. Connect a microphone or headset and try again."
          );
        }
        if (e.name === "NotReadableError" || e.name === "TrackStartError") {
          throw new Error(
            "Your microphone is in use by another application (Zoom, Teams, etc.). " +
            "Close it and try again."
          );
        }
        throw new Error(
          `Microphone error (${(e as DOMException).name ?? "unknown"}): ` +
          `${(e as DOMException).message ?? "Could not access microphone."}`
        );
      }

      if (myToken !== connectTokenRef.current) {
        mic.getTracks().forEach((t) => t.stop());
        clearTimeoutGuard();
        return;
      }
      micStreamRef.current = mic;
      // Sticky mute across reconnects — a muted visitor stays muted.
      setMicStreamMuted(mic, micMutedRef.current);

      // ── 3. Create AudioContexts inside user-gesture scope ────────────────
      //
      // MUST be after the getUserMedia call (which is user-gesture-gated) so
      // both contexts start in the "running" state on Chrome and Safari.
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof window.AudioContext })
          .webkitAudioContext;

      captureCtxRef.current  = new AudioCtxClass({ sampleRate: 16_000 });
      playbackCtxRef.current = new AudioCtxClass({ sampleRate: 24_000 });

      await captureCtxRef.current.resume();
      await playbackCtxRef.current.resume();

      // Wire playback analyser: all bufferSources → analyser → destination.
      // Exposed as outputAnalyserNode so useAudioVisualizer can read real
      // frequency data without needing a second AudioContext (which would
      // throw NotSupportedError when connecting cross-context).
      const playbackAnalyser = playbackCtxRef.current.createAnalyser();
      playbackAnalyser.fftSize              = 512;
      playbackAnalyser.smoothingTimeConstant = 0.85;
      playbackAnalyser.connect(playbackCtxRef.current.destination);
      playbackAnalyserRef.current = playbackAnalyser;
      setOutputAnalyserNode(playbackAnalyser);

      // ── 4. Load AudioWorklet for mic capture ─────────────────────────────
      //
      // The worklet converts Float32 mic frames → Int16 and posts them via
      // port.postMessage. We accumulate them in pendingAudioRef and flush
      // in batches after setupComplete fires to avoid flooding the WebSocket.
      await captureCtxRef.current.audioWorklet.addModule(
        "/worklets/audio-recorder-worklet.js"
      );
      const micSource = captureCtxRef.current.createMediaStreamSource(mic);
      workletRef.current = new AudioWorkletNode(
        captureCtxRef.current,
        "audio-recorder-worklet"
      );
      workletRef.current.port.onmessage = (ev: MessageEvent<Int16Array>) => {
        pendingAudioRef.current.push(ev.data);
      };
      micSource.connect(workletRef.current);
      // Worklet output is intentionally not connected anywhere; the node's
      // sole purpose is to post Int16Array messages via port.postMessage.

      if (myToken !== connectTokenRef.current) { clearTimeoutGuard(); cleanup(); return; }

      // ── 5. Open WebSocket ────────────────────────────────────────────────
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (myToken !== connectTokenRef.current) { ws.close(); return; }

        // ── Build system instruction ────────────────────────────────────
        const baseInstructions =
          typeof instructions === "string" && instructions.trim().length > 0
            ? instructions.trim()
            : [assistantPrompts.voice.sessionInstructions, languageGuidance.session].join("\n\n");

        const systemParts: string[] = [baseInstructions];

        // FIX G5: Inject the document overview so Gemini can answer general
        // questions without a rag_search tool call. Specific questions still
        // trigger rag_search autonomously via toolConfig AUTO.
        if (!kbId && documentOverview?.trim()) {
          systemParts.push(`Policy document overview:\n${documentOverview.trim()}`);
        }

        // FIX G5: Inject the exact documentId so the model always passes the
        // correct value to rag_search's required documentId parameter. Without
        // this Gemini had to guess the ID or leave it blank.
        if (!kbId && documentId) {
          systemParts.push(
            `Active document ID: ${documentId}\n` +
            `Always pass this exact string as the "documentId" argument when calling rag_search.`
          );
        }

        if (kbId) {
          systemParts.push(
            `Active knowledge base ID: ${kbId}\n` +
            "When calling rag_search, use the active knowledge base and ask only for relevant document context."
          );
        }

        const toolParameters = kbId
          ? {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "The user's question in natural language.",
                },
              },
              required: ["query"],
            }
          : {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "The user's question in natural language.",
                },
                documentId: {
                  type: "STRING",
                  description:
                    "The ID of the active document. Use the exact value " +
                    "from the system instruction — do not guess or omit it.",
                },
              },
              required: ["query", "documentId"],
            };

        const toolDescription = kbId
          ? "Retrieve relevant snippets from the active knowledge base. Call this whenever the user asks a question that requires specific document context."
          :
            "Retrieve relevant snippets from the active insurance policy " +
            "document. Call this whenever the user asks about coverage " +
            "details, exclusions, claims, premiums, renewals, or any " +
            "other policy-specific information. Always pass the documentId " +
            "value specified in the system instruction.";

        ws.send(JSON.stringify({
          setup: {
            model,

            generationConfig: {
              // FIX G9: Use ["AUDIO"] for native audio models.
              //
              // ["AUDIO","TEXT"] is the TTS path: model generates text → TTS
              // voices it. For gemini-*-native-audio-* models the model generates
              // audio directly; "TEXT" is not a valid output modality for audio
              // generation and is silently ignored at best. Text transcript is
              // obtained correctly via outputAudioTranscription below.
              responseModalities: ["AUDIO"],

              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },

              // inputAudioTranscription: enables serverContent.inputTranscription
              // events carrying the user's speech as text (fixed by G1).
              inputAudioTranscription: {},

              // outputAudioTranscription: enables serverContent.outputTranscription
              // events carrying the model's spoken response as text (fixed by G2).
              // This is the PRIMARY text source for native audio models since
              // modelTurn.parts[].text is absent when TEXT modality is not active.
              outputAudioTranscription: {},
            },

            systemInstruction: {
              parts: [{ text: systemParts.join("\n\n") }],
            },

            tools: [
              {
                functionDeclarations: [
                  {
                    name: "rag_search",
                    description: toolDescription,
                    parameters: toolParameters,
                  },
                ],
              },
            ],

            // FIX G4: toolConfig mode AUTO ensures Gemini autonomously calls
            // rag_search when a question needs document context. Without this
            // the model may never invoke the tool even when the question clearly
            // requires specific policy information.
            toolConfig: {
              functionCallingConfig: { mode: "AUTO" },
            },

            realtimeInputConfig: {
              automaticActivityDetection: {
                // Auto VAD: Gemini detects speech start/end and interrupts its
                // own generation when the user speaks. The interrupt() method
                // sends activityStart to explicitly signal user speech (G6).
                disabled:                 false,
                startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
                endOfSpeechSensitivity:   "END_SENSITIVITY_LOW",
                prefixPaddingMs:          300,
                silenceDurationMs:        700,
              },
            },
          },
        }));

        // Status transitions to "connected" only when setupComplete arrives,
        // not here. Audio sent before setupComplete is discarded by Gemini.
      };

      ws.onmessage = (ev) => {
        handleMessageRef.current(ev.data as string);
      };

      ws.onerror = () => {
        if (isCleaningUpRef.current) return;
        if (myToken !== connectTokenRef.current) return;
        clearTimeoutGuard();
        setLastError("Gemini WebSocket error. Check your network connection.");
        setStatus("error");
        cleanup();
      };

      // FIX G8: Clean up all resources on unexpected server-side close.
      //
      // Previously ws.onclose only called setStatus("idle"), leaving the mic
      // stream active, both AudioContexts running, the AudioWorklet consuming
      // CPU, and the flush timer trying to send to a closed socket — a
      // permanent resource leak that kept the microphone LED lit.
      //
      // The isCleaningUpRef guard ensures that our own cleanup() → ws.close()
      // call does not re-enter this handler.
      ws.onclose = (ev) => {
        if (isCleaningUpRef.current) return;
        if (myToken !== connectTokenRef.current) return;

        clearTimeoutGuard();

        // Classify the close: codes 1000/1001 are normal (clean disconnect by
        // either side). Any other code is an unexpected server-side close.
        const isNormalClose = ev.code === 1000 || ev.code === 1001;

        if (isNormalClose) {
          // Clean shutdown — just mark idle; resources were already freed by
          // our own disconnect() → cleanup() call if the user disconnected.
          setStatus("idle");
        } else {
          // Unexpected close (network drop, Gemini server timeout, etc.).
          // Surface a user-visible error and release all held resources.
          setLastError(
            ev.reason
              ? `Gemini disconnected: ${ev.reason}`
              : "Gemini connection closed unexpectedly. Please reconnect."
          );
          setStatus("error");
          cleanup();
        }
      };

      clearTimeoutGuard();
    } catch (error) {
      clearTimeoutGuard();
      if (myToken === connectTokenRef.current) {
        setLastError((error as Error)?.message || "Failed to connect to Gemini.");
        setStatus("error");
        cleanup();
      }
    }
  }, [
    cleanup,
    documentId,
    kbId,
    documentOverview,
    languageGuidance.session,
    languagePrefs.assistant,
    languagePrefs.customer,
    opts?.embedApiKey,
    // flushAudio intentionally omitted: it is only used inside handleMessage
    // (via handleMessageRef) when setupComplete fires, not inside connect().
    // voiceGreeting intentionally omitted: accessed via handleMessageRef.current.
    opts?.draftMode,
  ]);

  // ── disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    ++connectTokenRef.current;
    cleanup();
    setStatus("idle");
    setLastError(null);
  }, [cleanup]);

  // ── interrupt ─────────────────────────────────────────────────────────────

  const interrupt = useCallback(() => {
    // Stop local audio playback immediately (zero latency from the user's POV).
    stopPlayback();

    // FIX G6: Send activityStart to signal the user is speaking.
    //
    // With automaticActivityDetection enabled, activityStart tells the Gemini
    // server that the user has started speaking, causing it to interrupt its
    // own generation and emit { serverContent: { interrupted: true } }.
    // handleMessage receives that event, calls stopPlayback() (no-op here since
    // we already stopped), and resets activeTurnIdRef.
    //
    // Old approach: { clientContent: { turns: [], turnComplete: true } }
    // This had no effect on server-side generation. Audio kept streaming in
    // and accumulated in playQueueRef, becoming audible as soon as anything
    // called stopPlayback(). The activityStart signal actually stops the
    // server-side generation pipeline.
    sendWS({ activityStart: {} });
  }, [sendWS, stopPlayback]);

  // ── sendText ──────────────────────────────────────────────────────────────

  /**
   * Inject a typed user turn — used by the suggested-prompt buttons.
   *
   * FIX G3 (sendText aspect): The old implementation called scheduleRag(text),
   * which 1500 ms later sent a SECOND clientContent turn with the same question
   * + RAG context, causing Gemini to generate a complete second response.
   *
   * FIX G11: The old implementation prepended the full documentOverview to the
   * user-turn text body. The overview is already in systemInstruction (injected
   * at connect time). Re-sending it here:
   *   • Doubled context size per turn
   *   • Made turn.question in the history show the full overview + question
   *   • Mixed system-context and user-question in a single "user" turn
   *
   * Fix: send only the user's actual question text. The system instruction
   * provides the overview; Gemini calls rag_search autonomously (AUTO mode)
   * when specific policy snippets are needed.
   */
  const sendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!setupCompleteRef.current) {
      console.warn("[useGeminiLive] sendText called before setupComplete — ignoring.");
      return;
    }

    const turnId = generateTurnId();
    activeTurnIdRef.current = turnId;
    userQueryRef.current    = trimmed;
    addTurn({ id: turnId, question: trimmed, answer: "", sources: [], status: "pending" });

    // Send only the user's question. The system instruction already has the
    // document overview. Gemini will call rag_search if it needs specific
    // policy snippets (toolConfig AUTO). No second turn, no scheduleRag().
    sendWS({
      clientContent: {
        turns: [{ role: "user", parts: [{ text: trimmed }] }],
        turnComplete: true,
      },
    });
  }, [addTurn, sendWS]);

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    status,
    error:    lastError,
    isSpeaking,
    history,
    micMuted,
    setMicMuted,
    connect,
    disconnect,
    interrupt,
    sendText,
    // Gemini plays audio via Web Audio API (not a WebRTC MediaStream).
    // remoteAudioStream is null; the VoiceChatModal uses outputAnalyserNode
    // for the visualiser and the hidden <audio> element stays empty.
    remoteAudioStream: null as MediaStream | null,
    // Real playback-chain AnalyserNode — non-null while connected.
    // useAudioVisualizer uses the AnalyserNode fast-path to read frequency
    // data without creating a second AudioContext.
    outputAnalyserNode,
  } as const;
}
