"use client";

import { logVoiceTurnLatency } from "@/modules/voice-core/realtime/latency-log";
import { useCallback, useEffect, useRef, useState } from "react";
import { greetingInstruction, normalizeLanguagePolicy } from "@/modules/assistant/core/language-policy";
import {
  assistantPrompts,
  buildLanguageGuidance,
  resolveLanguagePreferences,
  type LanguagePreferences,
} from "../config";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { setMicStreamMuted } from "../voice/mic-mute";
import { extractResponseText, isAssistantAudioDelta, isAssistantTranscriptDelta, realtimeCompletionNotice } from "../realtime-events";
import { RealtimePlaybackLifecycle, type PlaybackTransition } from "../realtime-playback-lifecycle";
import { buildTurnGuidance } from "@/modules/rag/turn-guidance";
import { LatencyTracker, mintSessionId } from "@/modules/voice-core/realtime";
import type { LatencyStage, TurnLatencyHandle } from "@/modules/voice-core/realtime/latency-tracker";
import type { Source } from "../models";

// ─── Debug flag ───────────────────────────────────────────────────────────────
// Set to true during development to log every data-channel event to the console.
const DEBUG_EVENTS = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTurnId(): string {
  try {
    const extendedGlobal = globalThis as typeof globalThis & {
      msCrypto?: Crypto;
    };
    const globalCrypto: Crypto | undefined =
      typeof globalThis !== "undefined"
        ? globalThis.crypto ?? extendedGlobal.msCrypto
        : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
      return globalCrypto.randomUUID();
    }
    if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
      const bytes = globalCrypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return [
        hex.slice(0, 4).join(""),
        hex.slice(4, 6).join(""),
        hex.slice(6, 8).join(""),
        hex.slice(8, 10).join(""),
        hex.slice(10, 16).join(""),
      ].join("-");
    }
  } catch {
    // fall through to Math.random
  }
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "connecting" | "connected" | "error";

type Options = {
  documentId?: string | null;
  kbId?: string | null;
  documentOverview?: string;
  voiceGreeting?: string;
  language?: LanguagePreferences;
  /**
   * Public embed API key (real `clr_...` value from embed_api_key / KB
   * settings — never a bypass token). When present, session/RAG requests are
   * routed to the public /api/embed/* endpoints with this key as a Bearer
   * token instead of the protected endpoints + platform JWT. Used only by
   * the public embed voice widget (src/features/embed/screens/voice-screen.tsx).
   */
  embedApiKey?: string;
  /** Draft-preview mode (agent preview): requests carry scope:"draft". */
  draftMode?: boolean;
};

type TurnStatus = "pending" | "speaking" | "done";

type VoiceTurn = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  status: TurnStatus;
};

// PendingFollowUp type removed — FIX V3: the dual-response (quick answer +
// follow-up) mechanism caused the AI to repeat the full answer verbatim.
// performRagAndRespond now waits for RAG context and fires exactly one
// response.create, eliminating the duplicate-speech bug entirely.

// ─── VAD & RAG tuning constants ───────────────────────────────────────────────
// These can be overridden via environment variables (server-side at build time).
// All values are in milliseconds unless noted.

/**
 * How long to wait after transcription ends before firing the RAG search.
 *
 * FIX V1 (was 1500ms): The 1500ms debounce was the primary cause of the
 * 1-2 second silence users heard before any response. VAD now has
 * create_response: false so the only gate on firing is this debounce.
 * 300ms is enough to prevent double-fires on rapid re-transcriptions
 * while keeping the perceived response latency tight.
 */
const RAG_DEBOUNCE_MS = 100;

/**
 * Minimum word count for a query to be considered valid for RAG retrieval.
 *
 * FIX STALL-C (was 5): MIN_WORD_COUNT=5 silently dropped short but valid
 * questions like "What about AWS?" (3 words) or "Explain Jitsi" (2 words).
 * When dropped, no turn was created and no response was sent — the AI
 * appeared to have stopped responding entirely.
 * Lowered to 2: single-word queries like "Hello" are still caught by
 * MIN_QUERY_LENGTH; real questions are always 2+ words.
 */
const MIN_WORD_COUNT = 2;

/**
 * Minimum character length for a query (secondary gate alongside word count).
 *
 * FIX STALL-C (was 25): lowered to match the new word count threshold.
 * A 2-word question like "What is" is 7 chars — set floor at 4 to allow
 * any recognisable word pair through.
 */
const MIN_QUERY_LENGTH = 4;

// ─── OpenAI Realtime API — exact data-channel event type strings ──────────────
//
// The Realtime API sends these event types over the WebRTC data channel.
// Using exact string literals (not partial .includes() matches) prevents
// accidental matches against similar event names and makes the code self-
// documenting.
//
// Reference: https://platform.openai.com/docs/guides/realtime/events

const RT_EVENTS = {
  // VAD / user turn
  SPEECH_STARTED:          "input_audio_buffer.speech_started",
  SPEECH_STOPPED:          "input_audio_buffer.speech_stopped",
  TRANSCRIPTION_DELTA:     "conversation.item.input_audio_transcription.delta",
  TRANSCRIPTION_COMPLETED: "conversation.item.input_audio_transcription.completed",

  // Response lifecycle
  RESPONSE_CREATED: "response.created",
  RESPONSE_DONE:    "response.done",

  // Text / transcript / audio output (model speaking) — GA and beta names
  // are matched by the helpers in ../realtime-events.

  // Function / tool call
  FUNCTION_ARGS_DELTA: "response.function_call_arguments.delta",
  FUNCTION_ARGS_DONE:  "response.function_call_arguments.done",

  // WebRTC: the server started playing model audio on the media track.
  OUTPUT_AUDIO_BUFFER_STARTED: "output_audio_buffer.started",
} as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useOpenAIRealtime
 *
 * Creates a WebRTC session to the OpenAI Realtime API using an ephemeral token,
 * manages mic input and remote audio output, handles the data channel for
 * control messages, and fulfils rag_search tool calls via the server.
 *
 * Design notes:
 * - "Manual RAG path": performRagAndRespond() proactively fetches context after
 *   transcription completes and injects a system message + response.create.
 * - "Tool call path": handleToolCall() handles the model-initiated rag_search
 *   tool call and returns the result via conversation.item.create
 *   (function_call_output).  Both paths co-exist so the model can retrieve
 *   additional context even after the quick manual answer has been delivered.
 */
export function useOpenAIRealtime(opts?: Options) {
  const { documentId, kbId, documentOverview, voiceGreeting } = opts || {};
  const languagePrefs = resolveLanguagePreferences(opts?.language);
  const languageGuidance = buildLanguageGuidance(languagePrefs);

  const [status, setStatus] = useState<Status>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);

  // ── Refs (no re-render on change) ─────────────────────────────────────────
  const historyRef            = useRef<VoiceTurn[]>([]);
  const pcRef                 = useRef<RTCPeerConnection | null>(null);
  const dcRef                 = useRef<RTCDataChannel | null>(null);
  const micStreamRef          = useRef<MediaStream | null>(null);
  // ── Microphone mute ("pause") ────────────────────────────────────────────
  // track.enabled=false keeps the WebRTC session alive while sending digital
  // silence — server VAD stops firing, no real audio leaves the browser.
  const [micMuted, setMicMutedState] = useState(false);
  const micMutedRef = useRef(false);
  const setMicMuted = useCallback((muted: boolean) => {
    micMutedRef.current = muted;
    setMicMutedState(muted);
    setMicStreamMuted(micStreamRef.current, muted);
  }, []);
  const remoteAudioStreamRef  = useRef<MediaStream | null>(null);
  const connectTokenRef       = useRef(0);
  const sendQueueRef          = useRef<string[]>([]);
  const userQueryRef          = useRef<string>("");
  const ragAbortRef           = useRef<AbortController | null>(null);
  const ragTriggerTimeoutRef  = useRef<number | null>(null);
  const activeTurnIdRef       = useRef<string | null>(null);
  const latestTurnIdRef       = useRef<string | null>(null);
  const toolCallBufferRef     = useRef<Record<string, string>>({});
  const isSpeakingRef         = useRef(false);
  const playbackRef           = useRef(new RealtimePlaybackLifecycle());
  const drainWatchdogRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredRagRef        = useRef(false);
  // ── Latency telemetry (plan Phase 10 — timings only, never transcripts) ──
  // Same tracker + window-event discipline as the Sarvam / ElevenLabs hooks
  // so the benchmark harness (scripts/voice-benchmark/run.mjs) can measure the
  // OpenAI baseline TTFA with the SAME stage names and event contract.
  const latencyRef            = useRef<LatencyTracker | null>(null);
  const latencySessionIdRef   = useRef<string>("");
  const latencyModelRef       = useRef<string | null>(null);
  /** Latency handle of the ACTIVE assistant turn — turn-scoped marks
   *  (rag/llm/tts/playback/complete/interrupt) go through it so they stay
   *  bound to the turn's own record even when a barge-in's next utterance
   *  opens a fresh interim record mid-stream (the in-flight chat bleed bug).
   *  Null between turns / during the greeting (system generation falls back
   *  to the tracker's current record). */
  const turnLatencyRef        = useRef<TurnLatencyHandle | null>(null);

  /** Mark a TURN-scoped stage on the active turn's record (handle), falling
   *  back to the tracker's current record for the greeting/system turns. */
  const markTurn = useCallback((stage: LatencyStage) => {
    (turnLatencyRef.current ?? latencyRef.current)?.mark(stage);
  }, []);

  /** Server-Timing stages of the current turn (retrieval / pre-model), for the latency line. */
  const serverTimingRef = useRef<Record<string, number> | null>(null);
  const emitLatencyTelemetry = useCallback(() => {
    const event = turnLatencyRef.current?.telemetry() ?? latencyRef.current?.telemetry();
    if (!event) return;
    console.debug("[openai-realtime] latency", event);
    logVoiceTurnLatency("openai", event, serverTimingRef.current);
    serverTimingRef.current = null;
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("clara:voice:latency", { detail: event }));
    }
  }, []);
  // ragBusyRef removed — replaced by AbortController (ragAbortRef). See
  // performRagAndRespond for the explanation.
  // pendingFollowUpRef removed — FIX V3: see comment on PendingFollowUp type.

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // ── sendJSON ──────────────────────────────────────────────────────────────

  const sendJSON = useCallback((payload: unknown) => {
    const dc = dcRef.current;
    const msg = JSON.stringify(payload);
    if (dc && dc.readyState === "open") {
      try {
        dc.send(msg);
      } catch {
        /* ignore transient send errors */
      }
    } else {
      sendQueueRef.current.push(msg);
    }
  }, []);

  // ── resolveTurnId ─────────────────────────────────────────────────────────

  const resolveTurnId = useCallback((turns: VoiceTurn[]): string | null => {
    const activeId = activeTurnIdRef.current;
    if (activeId && turns.some((t) => t.id === activeId)) return activeId;
    const latestId = latestTurnIdRef.current;
    if (latestId && turns.some((t) => t.id === latestId)) return latestId;
    return turns.length > 0 ? turns[turns.length - 1]!.id : null;
  }, []);

  // ── performRagAndRespond ──────────────────────────────────────────────────
  //
  // Single-path RAG flow (FIX V1 + V2 + V3):
  //
  // OLD broken design (three bugs):
  //   1. Sent a "quick" response.create immediately (before RAG)
  //   2. Fetched RAG in parallel
  //   3. On RESPONSE_DONE, dispatched a second response.create (pendingFollowUp)
  //
  // Why it broke:
  //   V1 – The old 1500ms RAG_DEBOUNCE_MS + cancellation of the VAD auto-
  //        response caused 1-2 s of dead silence before anything was spoken.
  //   V2 – The VAD auto-response (create_response: true) raced with this path.
  //        handleToolCall also sent response.create on rag_search completion.
  //        Three competing response.create events left activeTurnIdRef null
  //        between responses, so transcript deltas were lost → empty answer.
  //   V3 – The second response.create (pendingFollowUp) made the model repeat
  //        the full answer verbatim because it saw the full context again and
  //        regenerated a complete response from scratch.
  //
  // NEW single-path design:
  //   1. Fetch RAG context first (300ms debounce already absorbed; typical
  //      Qdrant round-trip is 300-600ms, so total pre-speech latency ~600ms).
  //   2. Inject context + user question as conversation items.
  //   3. Fire exactly ONE response.create with tool_choice:"none" so the model
  //      cannot re-enter the rag_search tool and cause a second response.
  //   4. No cancellations, no pendingFollowUp, no second response.create.

  const performRagAndRespond = useCallback(async () => {
    const query = userQueryRef.current.trim();
    const docId = (documentId || "").trim();
    const kbIdVal = (kbId || "").trim();
    // Need either a documentId (legacy) or a kbId (KB mode) to do RAG
    if (!query || (!docId && !kbIdVal)) return;

    const normalizedQuery = query.normalize("NFKC").replace(/\s+/g, " ").trim();
    const wordCount = normalizedQuery
      ? normalizedQuery.split(" ").filter(Boolean).length
      : 0;

    if (wordCount === 0) return;

    // Gate: skip very short fragments that are almost always mid-utterance
    if (wordCount < MIN_WORD_COUNT && normalizedQuery.length < MIN_QUERY_LENGTH) return;

    // FIX STALL-A: Replace the ragBusyRef boolean lock with an AbortController.
    //
    // OLD problem: ragBusyRef was a boolean set to `true` at the start of the
    // fetch and `false` in a finally-setTimeout. If the fetch threw, was slow,
    // or the component re-rendered between the flag flip, the flag could be
    // stuck `true` forever — every subsequent question hit `if (ragBusyRef)
    // return` and the AI permanently stopped responding for the session.
    //
    // NEW approach: abort the in-flight fetch and start a fresh one.
    // Each call creates a new AbortController. If another call arrives while
    // the previous fetch is still running, the old controller is aborted
    // (fetch throws AbortError, caught below) and the new query takes over.
    // There is no sticky boolean that can get stuck.
    if (ragAbortRef.current) {
      ragAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    ragAbortRef.current = abortCtrl;

    if (ragTriggerTimeoutRef.current !== null) {
      clearTimeout(ragTriggerTimeoutRef.current);
      ragTriggerTimeoutRef.current = null;
    }

    // Create the turn entry before the async fetch so the UI shows "pending"
    // immediately and resolveTurnId() has a valid target when deltas arrive.
    const newId = generateTurnId();
    activeTurnIdRef.current = newId;
    latestTurnIdRef.current = newId;
    // Per-turn latency record (plan Phase 10): timings only, never transcripts.
    // stt.first_partial/stt.final were marked on the interim record before
    // this replacement — carry them over so TTFA stays measurable on real
    // sessions (the committed-turn carry bug, same fix as the other hooks).
    const carriedStt = latencyRef.current?.sttMarks();
    const turnLatency = latencyRef.current?.beginTurn({
      sessionId: latencySessionIdRef.current,
      turnId: newId,
      provider: "openai",
      model: latencyModelRef.current,
    });
    turnLatencyRef.current = turnLatency ?? null;
    latencyRef.current?.carrySttMarks(carriedStt ?? {});
    turnLatency?.mark("rag.start");
    setHistory((prev) => [
      ...prev,
      { id: newId, question: query, answer: "", sources: [], status: "pending" },
    ]);

    const targetTurnId = newId;

    try {
      // ── Step 1: Fetch RAG context ──────────────────────────────────────
      // FIX V2: Fetch BEFORE response.create so there is only ever one
      // response.create per user turn. The debounce (300ms) plus Qdrant
      // round-trip (~300-600ms) gives a total pre-speech latency of ~600-900ms,
      // which is far better than the previous 1500ms debounce alone.
      const endpoint = opts?.embedApiKey ? "/api/embed/rag" : "/api/rag/search";
      const headers = opts?.embedApiKey
        ? { "Content-Type": "application/json", Authorization: `Bearer ${opts.embedApiKey}` }
        : withAuthHeaders({ "Content-Type": "application/json" });

      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers,
        body: JSON.stringify(
          kbIdVal
            ? { query, kbId: kbIdVal, language: languagePrefs.assistant, channel: "voice", ...(opts?.draftMode ? { scope: "draft" } : {}) } // KB mode
            : { query, documentId: docId, language: languagePrefs.assistant, channel: "voice" } // Legacy mode
        ),
        signal: abortCtrl.signal, // FIX STALL-A: allow aborting stale fetches
      });
      const payload = await res.json();
      markTurn("rag.end");
      serverTimingRef.current = ragTimings(payload?.timings);
      const payloadSources = Array.isArray(payload?.sources) ? payload.sources : [];
      const ragContext =
        typeof payload?.context === "string" ? payload.context.trim() : "";
      const grounded = payload?.grounded === true || payloadSources.length > 0;
      const intent = payload?.intent === "capability" ? "capability" : grounded ? "knowledge" : "out_of_scope";
      const outOfScopeReply =
        typeof payload?.outOfScopeReply === "string" && payload.outOfScopeReply.trim()
          ? payload.outOfScopeReply.trim()
          : "I don't have enough information in the configured knowledge base to answer that accurately.";
      const dynamicScope = payload?.scope && typeof payload.scope === "object" ? payload.scope as {
        assistantName?: string;
        welcomeMessage?: string;
        knowledgeBaseName?: string;
        knowledgeBaseDescription?: string | null;
        documentCount?: number;
        documentTitles?: string[];
      } : null;

      // Update sources on the turn now that RAG has returned.
      setHistory((prev) =>
        prev.map((t) =>
          t.id === targetTurnId ? { ...t, sources: payloadSources } : t
        )
      );

      // ── Step 2: Build the turn context ──────────────────────────────────
      // The server's provider-neutral turn guidance (grounded answer /
      // capability overview / natural no-evidence handling, in the visitor's
      // language) replaces the old "GROUNDING GUARD … say exactly" text that
      // opened conversations with a canned topic-restriction refusal.
      const overviewSummary = documentOverview?.trim() ?? "";
      const detectedResponseLanguage =
        typeof payload?.responseLanguage === "string" &&
        languagePrefs.customer.includes(payload.responseLanguage)
          ? payload.responseLanguage
          : null;
      const guidance =
        typeof payload?.guidance === "string" && payload.guidance.trim()
          ? payload.guidance.trim()
          : buildTurnGuidance({
              grounded,
              intent: intent === "capability" ? "capability" : grounded ? "knowledge" : "out_of_scope",
              responseLanguage: detectedResponseLanguage,
              fallbackReply: outOfScopeReply,
              topics:
                (dynamicScope as { topics?: string } | null)?.topics ??
                (Array.isArray(dynamicScope?.documentTitles) ? dynamicScope.documentTitles.join(", ") : null),
              channel: "voice",
            });

      const contextSegments: string[] = [guidance];
      if (!detectedResponseLanguage) contextSegments.push(languageGuidance.follow);
      if (overviewSummary && grounded) {
        contextSegments.push(
          `${assistantPrompts.voice.quickResponseContextLabel}\n${overviewSummary}`
        );
      }
      if (ragContext) {
        contextSegments.push(
          `${intent === "capability" ? "Assistant scope:" : assistantPrompts.voice.followUpContextLabel}\n${ragContext}`
        );
      }

      // ── Step 3: Inject context + user question as conversation items ────
      if (contextSegments.length > 0) {
        sendJSON({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "system",
            content: [{ type: "input_text", text: contextSegments.join("\n\n") }],
          },
        });
      }

      sendJSON({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `Customer question:\n${query}` }],
        },
      });

      // ── Step 4: Single response.create with tool_choice:"none" ─────────
      // FIX V3: tool_choice:"none" prevents the model from calling rag_search
      // again (it already has the context), which would trigger handleToolCall
      // and a second response.create — the root cause of the duplicate answer.
      // FIX V2: Exactly one response.create per user turn means activeTurnIdRef
      // is never null between competing responses; all deltas reach the turn.
      // For native realtime audio the response IS the audio generation, so
      // llm.start and tts.start are the same instant on this provider.
      markTurn("llm.start");
      markTurn("tts.start");
      // No `instructions` here: response-level instructions REPLACE the
      // session instructions for that response (OpenAI Realtime reference,
      // response.create), which silently dropped the operator's system prompt
      // on every answer. The per-turn guidance rides the system item above.
      sendJSON({
        type: "response.create",
        response: {
          tool_choice: "none",
        },
      });

      userQueryRef.current = "";
    } catch (error) {
      // FIX STALL-A: AbortError means a newer query superseded this one.
      // Silently discard — the newer call will create its own turn and respond.
      if (error instanceof Error && error.name === "AbortError") return;

      const message =
        error instanceof Error
          ? error.message
          : "Unable to retrieve context for this question.";
      setHistory((prev) =>
        prev.map((t) =>
          t.id === targetTurnId
            ? { ...t, status: "done", answer: message, sources: [] }
            : t
        )
      );
      latestTurnIdRef.current = targetTurnId;
      activeTurnIdRef.current = null;
    } finally {
      // Clear the abort ref only if it still points to this controller
      // (a newer call may have already replaced it).
      if (ragAbortRef.current === abortCtrl) {
        ragAbortRef.current = null;
      }
    }
  }, [
    documentId,
    documentOverview,
    kbId,
    markTurn,
    languageGuidance.follow,
    opts?.embedApiKey,
    sendJSON,
    opts?.draftMode,
  ]);

  // ── scheduleRag ───────────────────────────────────────────────────────────

  const scheduleRag = useCallback(() => {
    // Do not start a second model response before the preceding WebRTC
    // response finishes. VAD can transcribe a real interruption while the
    // previous audio is still draining or being cancelled.
    if (playbackRef.current.activeResponseId) {
      deferredRagRef.current = true;
      return;
    }
    if (ragTriggerTimeoutRef.current !== null) {
      clearTimeout(ragTriggerTimeoutRef.current);
    }
    ragTriggerTimeoutRef.current = window.setTimeout(() => {
      ragTriggerTimeoutRef.current = null;
      if (playbackRef.current.activeResponseId) {
        deferredRagRef.current = true;
        return;
      }
      void performRagAndRespond();
    }, RAG_DEBOUNCE_MS);
  }, [performRagAndRespond]);

  // ── cleanup ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    pcRef.current = null;

    if (ragTriggerTimeoutRef.current !== null) {
      clearTimeout(ragTriggerTimeoutRef.current);
      ragTriggerTimeoutRef.current = null;
    }

    // FIX STALL-A: abort any in-flight RAG fetch so it doesn’t try to
    // sendJSON into a closed data channel after cleanup.
    if (ragAbortRef.current) {
      ragAbortRef.current.abort();
      ragAbortRef.current = null;
    }

    // FIX STALL-B: discard messages queued for the dead session so they
    // don’t flood in when the user reconnects.
    sendQueueRef.current = [];
    playbackRef.current.reset();
    deferredRagRef.current = false;
    if (drainWatchdogRef.current !== null) {
      clearTimeout(drainWatchdogRef.current);
      drainWatchdogRef.current = null;
    }

    userQueryRef.current = "";
    activeTurnIdRef.current = null;
    latestTurnIdRef.current = null;

    if (historyRef.current.length > 0) {
      setHistory([]);
      historyRef.current = [];
    }
    if (isSpeakingRef.current) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (remoteAudioStreamRef.current) {
      try { remoteAudioStreamRef.current.getTracks().forEach((t) => t.stop?.()); } catch {}
      remoteAudioStreamRef.current = null;
    }
    setRemoteAudioStream(null);
    isSpeakingRef.current = false;
  }, []);

  // ── interrupt ─────────────────────────────────────────────────────────────

  const interrupt = useCallback(() => {
    try {
      markTurn("interrupt");
      turnLatencyRef.current = null;
      sendJSON({ type: "response.cancel" });
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      // No pendingFollowUpRef to clear — removed in FIX V3.
    } catch {}
  }, [markTurn, sendJSON]);

  // ── handleToolCall ────────────────────────────────────────────────────────
  //
  // FIX: Two bugs corrected here:
  //
  // 1. EVENT DATA ACCESS: The Realtime API sends function_call_arguments.done
  //    with `msg.call_id`, `msg.name`, and `msg.arguments` directly on the
  //    message — not nested under `msg.tool_call`. The old code accessed
  //    `call.id / call.name / call.arguments` where `call = msg.tool_call`
  //    which was always undefined.
  //
  // 2. TOOL OUTPUT FORMAT: The old code used `type: "response.tool_output"`
  //    which is not a valid Realtime API event type. The correct way to
  //    return a function call result is:
  //
  //    { type: "conversation.item.create",
  //      item: { type: "function_call_output", call_id: "...", output: "..." } }
  //
  //    followed by { type: "response.create" } to trigger the next response.

  const handleToolCall = useCallback(
    async (toolCall: { id: string; name?: string; arguments?: string }) => {
      if (!toolCall?.id) return;
      const name = toolCall?.name || "";
      const isIntegrationTool =
        name === "integration_availability" || name === "integration_action";
      if (name !== "rag_search" && !isIntegrationTool) return;

      try {
        const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
        if (isIntegrationTool) {
          // Public embeds never receive integration tool descriptors and cannot
          // invoke this authenticated workspace endpoint with an embed key.
          const kbIdVal = (kbId || "").trim();
          if (opts?.embedApiKey || !kbIdVal) {
            throw new Error("Integration tools require an authenticated workspace voice session.");
          }
          const res = await fetch(apiUrl("/api/realtime/tool"), {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ kbId: kbIdVal, toolName: name, arguments: args }),
          });
          const payload = await res.json().catch(() => ({})) as {
            error?: string;
            outcome?: { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
          };
          if (!res.ok || !payload.outcome || typeof payload.outcome.ok !== "boolean") {
            throw new Error(payload.error || "Realtime integration tool execution failed.");
          }
          const output = payload.outcome.ok
            ? payload.outcome.data
            : {
                error: payload.outcome.error?.message || "The integration tool was denied.",
                code: payload.outcome.error?.code || "EXECUTION_FAILED",
              };
          sendJSON({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify(output ?? null),
            },
          });
          sendJSON({ type: "response.create" });
          return;
        }

        const q = String(args.query || "").trim();
        const docId = String(args.documentId || documentId || "").trim();
        const kbIdVal = (kbId || "").trim();
        if (!q || (!docId && !kbIdVal)) throw new Error("Missing query or documentId/kbId");

        let turnId = activeTurnIdRef.current;
        if (!turnId) {
          const newId = generateTurnId();
          turnId = newId;
          activeTurnIdRef.current = newId;
          latestTurnIdRef.current = newId;
          setHistory((prev) => [
            ...prev,
            { id: newId, question: q, answer: "", sources: [], status: "pending" },
          ]);
        } else {
          const existingId = turnId;
          latestTurnIdRef.current = existingId;
          setHistory((prev) =>
            prev.map((t) =>
              t.id === existingId && q ? { ...t, question: q } : t
            )
          );
        }

        const endpoint = opts?.embedApiKey ? "/api/embed/rag" : "/api/rag/search";
        const headers = opts?.embedApiKey
          ? { "Content-Type": "application/json", Authorization: `Bearer ${opts.embedApiKey}` }
          : withAuthHeaders({ "Content-Type": "application/json" });

        const res = await fetch(apiUrl(endpoint), {
          method: "POST",
          headers,
          body: JSON.stringify(
            kbIdVal
              ? { query: q, kbId: kbIdVal, channel: "voice", ...(opts?.draftMode ? { scope: "draft" } : {}) }       // KB mode
              : { query: q, documentId: docId }    // Legacy mode
          ),
        });
        const payload = await res.json();
        const payloadSources = Array.isArray(payload?.sources)
          ? payload.sources
          : [];

        if (turnId) {
          setHistory((prev) =>
            prev.map((t) =>
              t.id === turnId ? { ...t, sources: payloadSources } : t
            )
          );
        }

        // ── CORRECT tool output format ──────────────────────────────────────
        // conversation.item.create with type "function_call_output" is the
        // only supported way to return a tool result in the Realtime API.
        const grounded = payload?.grounded === true || payloadSources.length > 0;
        const outOfScopeReply =
          typeof payload?.outOfScopeReply === "string" && payload.outOfScopeReply.trim()
            ? payload.outOfScopeReply.trim()
            : "I don't have enough information in the configured knowledge base to answer that accurately.";
        const guidance =
          typeof payload?.guidance === "string" && payload.guidance.trim()
            ? payload.guidance.trim()
            : buildTurnGuidance({
                grounded,
                intent: payload?.intent === "capability" ? "capability" : grounded ? "knowledge" : "out_of_scope",
                responseLanguage: typeof payload?.responseLanguage === "string" ? payload.responseLanguage : null,
                fallbackReply: outOfScopeReply,
                topics: typeof payload?.scope?.topics === "string" ? payload.scope.topics : null,
                channel: "voice",
              });
        const toolContext = [guidance, typeof payload?.context === "string" ? payload.context : ""]
          .filter(Boolean)
          .join("\n\n");

        sendJSON({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify({
              context: toolContext,
              sources: payloadSources,
              grounded,
              outOfScopeReply,
            }),
          },
        });
        sendJSON({ type: "response.create" });
      } catch (err) {
        console.error("[useOpenAIRealtime] tool call failed:", err);
        // Return a minimal failure result so the model can handle gracefully
        try {
          sendJSON({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify({
                error: (err as Error)?.message || "Tool execution failed.",
              }),
            },
          });
          sendJSON({ type: "response.create" });
        } catch {}

        const message = err instanceof Error ? err.message : "rag_search failed";
        const targetId = activeTurnIdRef.current ?? latestTurnIdRef.current;
        if (targetId) {
          setHistory((prev) =>
            prev.map((t) =>
              t.id === targetId ? { ...t, status: "done", answer: message } : t
            )
          );
        }
      }
    },
    [documentId, kbId, opts?.draftMode, opts?.embedApiKey, sendJSON]
  );

  // ── connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    const myToken = ++connectTokenRef.current;
    setStatus("connecting");
    setLastError(null);

    // FIX 8: Connection timeout guard.
    //
    // Without a timeout, a slow or unresponsive OpenAI API / network can leave
    // the hook in "connecting" status indefinitely, freezing the UI.
    //
    // If the connection has not completed within CONNECT_TIMEOUT_MS we abort,
    // clean up, and surface an actionable error to the user.
    // The timeout is cancelled inside the try block the moment we reach the
    // "connected" state (dc.onopen sets status to "connected").
    //
    // 30 seconds is generous for a realistic connection — WebRTC + ICE + SDP
    // exchange normally completes in 2–4 s on a good connection.
    const CONNECT_TIMEOUT_MS = 30_000;
    let connectTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const startConnectTimeout = () => {
      connectTimeoutId = setTimeout(() => {
        // Only abort if this is still the active connect attempt
        if (myToken === connectTokenRef.current) {
          setLastError(
            "Connection timed out after 30 s. " +
            "Check your internet connection and try again."
          );
          setStatus("error");
          cleanup();
        }
      }, CONNECT_TIMEOUT_MS);
    };

    const clearConnectTimeout = () => {
      if (connectTimeoutId !== null) {
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
    };

    startConnectTimeout();

    try {
      // ── 1. Create ephemeral session ──────────────────────────────────────
      const endpoint = opts?.embedApiKey ? "/api/embed/session" : "/api/realtime/session";
      const headers = opts?.embedApiKey
        ? { "Content-Type": "application/json", Authorization: `Bearer ${opts.embedApiKey}` }
        : withAuthHeaders({ "Content-Type": "application/json" });

      const sessRes = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers,
        body: JSON.stringify({
          language: languagePrefs.assistant,
          languages: languagePrefs.customer,
          autoDetectLanguage: true,
          ...(kbId ? { kbId } : {}),
          ...(opts?.draftMode ? { scope: "draft" } : {}),
        }),
      });
      if (!sessRes.ok) throw new Error(await sessRes.text());
      const session = await sessRes.json();
      // Per-session latency tracker (plan Phase 10) — same stage names and
      // window-event contract as the Sarvam / ElevenLabs Clara hooks, so the
      // benchmark harness measures every provider identically.
      latencySessionIdRef.current = mintSessionId();
      latencyModelRef.current =
        typeof session?.model === "string" ? session.model : null;
      latencyRef.current = new LatencyTracker();
      latencyRef.current.beginTurn({
        sessionId: latencySessionIdRef.current,
        provider: "openai",
        model: latencyModelRef.current,
      });
      latencyRef.current.mark("session.start");
      const ephemeralKey =
        session?.client_secret?.value ||
        session?.client_secret ||
        session?.value;
      if (!ephemeralKey)
        throw new Error(
          "Missing ephemeral client_secret in session response. " +
          "Ensure OPENAI_API_KEY has Realtime API access."
        );

      // Read voice from the server session response instead of NEXT_PUBLIC_
      // env vars so internal provider/model configuration stays server-side.
      const realtimeVoice: string =
        typeof session?.voice === "string" && session.voice
          ? session.voice
          : typeof session?.audio?.output?.voice === "string" && session.audio.output.voice
            ? session.audio.output.voice
          : "alloy";
      const sessionConfig =
        session?.session && typeof session.session === "object"
          ? session.session
          : session;
      const sessionAudioInput = sessionConfig?.audio?.input ?? {};
      const sessionTurnDetection =
        sessionConfig?.turn_detection ?? sessionAudioInput?.turn_detection ?? {};
      const sessionTranscription =
        sessionConfig?.input_audio_transcription ??
        sessionAudioInput?.transcription ??
        {};

      // A response.done event closes GENERATION, not WebRTC playback.
      // Only output_audio_buffer.stopped confirms delivery of an audio turn.
      const finalizePlayback = (transition: PlaybackTransition, finalText = "") => {
        if (drainWatchdogRef.current !== null) {
          clearTimeout(drainWatchdogRef.current);
          drainWatchdogRef.current = null;
        }
        const phase = transition.phase;
        const success = phase === "delivered" || phase === "no_audio";
        const notice = phase === "undrained"
          ? "Audio playback could not be confirmed. The spoken answer may have stopped early."
          : phase === "cleared"
            ? "The spoken response was interrupted while playing."
            : success ? "" : realtimeCompletionNotice({ status: transition.status });
        if (success) markTurn("turn.complete");
        else markTurn("interrupt");
        emitLatencyTelemetry();
        turnLatencyRef.current = null;
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (transition.turnId) {
          setHistory((prev) => prev.map((t) => t.id !== transition.turnId ? t : ({
            ...t,
            answer: [t.answer.trim() ? t.answer : finalText || t.answer, notice].filter(Boolean).join("\n\n"),
            status: "done",
          })));
          latestTurnIdRef.current = transition.turnId;
        }
        if (activeTurnIdRef.current === transition.turnId) activeTurnIdRef.current = null;
        if (!success) {
          console.warn("[Realtime] audio turn not confirmed delivered", {
            phase, responseId: transition.responseId, reason: transition.reason,
          });
        }
        if (deferredRagRef.current && !playbackRef.current.activeResponseId) {
          deferredRagRef.current = false;
          scheduleRag();
        }
      };

      // ── 2. Create RTCPeerConnection ──────────────────────────────────────
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const remoteMediaStream = new MediaStream();
      remoteAudioStreamRef.current = remoteMediaStream;
      setRemoteAudioStream(remoteMediaStream);

      pc.ontrack = (event) => {
        const incoming = event.streams[0];
        if (!incoming) return;
        incoming.getTracks().forEach((track) => {
          if (!remoteMediaStream.getTracks().includes(track)) {
            remoteMediaStream.addTrack(track);
          }
        });
        setRemoteAudioStream(new MediaStream(remoteMediaStream.getTracks()));
      };

      // ── 3. Data channel ──────────────────────────────────────────────────
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
          const type = typeof msg?.type === "string" ? msg.type : "";

          if (DEBUG_EVENTS && type) {
            console.debug("[Realtime]", type, msg);
          }

          // ── VAD: user starts speaking ─────────────────────────────────
          // Reset accumulation buffers for a fresh turn.
          if (type === RT_EVENTS.SPEECH_STARTED) {
            userQueryRef.current = "";
            // Retain the assistant's turn identity while it is speaking.
            // A VAD start during playback must not redirect its transcript
            // deltas to the next question or a greeting.
            if (!playbackRef.current.activeResponseId) activeTurnIdRef.current = null;
          }

          // ── Streaming user transcript (delta) ─────────────────────────
          // Accumulate partial transcript as speech-to-text streams in.
          if (type === RT_EVENTS.TRANSCRIPTION_DELTA) {
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            if (delta) {
              userQueryRef.current += delta;
              // Utterance boundary for telemetry: a record belonging to a
              // completed/committed turn cannot take this utterance's
              // first-wins STT marks — open a fresh interim when needed.
              latencyRef.current?.prepareForUtterance();
              latencyRef.current?.mark("stt.first_partial");
            }
          }

          // ── User transcript complete ───────────────────────────────────
          // Prefer the final, accurate full transcript over the accumulated
          // delta string (deltas can have minor ordering artefacts).
          if (type === RT_EVENTS.TRANSCRIPTION_COMPLETED) {
            const finalTranscript =
              typeof msg.transcript === "string"
                ? msg.transcript
                : userQueryRef.current;
            if (finalTranscript.trim()) {
              userQueryRef.current = finalTranscript;
            }
            latencyRef.current?.mark("stt.final");
            scheduleRag();
          }

          // ── Model text / audio-transcript output (delta) ──────────────
          // response.output_audio_transcript.delta (GA) /
          // response.audio_transcript.delta (beta) — transcript of what the
          //   model says; the primary source for turn.answer.
          // response.output_text.delta / response.text.delta — text output.
          if (isAssistantTranscriptDelta(type)) {
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            if (delta) {
              markTurn("llm.first_token");
              setHistory((prev) => {
                const targetId = resolveTurnId(prev);
                if (!targetId) return prev;
                latestTurnIdRef.current = targetId;
                return prev.map((t) =>
                  t.id === targetId
                    ? { ...t, answer: `${t.answer}${delta}`, status: "speaking" }
                    : t
                );
              });
            }
          }

          // ── Streaming model audio (WebRTC mirrors it on the media track) ─
          // The first audio delta is the provider's first synthesized audio;
          // the browser's WebRTC track starts playing the same frame — the
          // closest observable browser.first_audio instant on this transport.
          if (isAssistantAudioDelta(type) || type === RT_EVENTS.OUTPUT_AUDIO_BUFFER_STARTED) {
            markTurn("tts.first_audio");
            // A provider audio delta is generation, not actual playback.
            // WebRTC's buffer.started is the playback-start signal.
            if (type === RT_EVENTS.OUTPUT_AUDIO_BUFFER_STARTED) markTurn("browser.first_audio");
          }

          // ── Correlate generation and playback by server response ID ──
          // No text/audio is stored by the lifecycle tracker. The server's
          // output_audio_buffer.stopped is the only successful WebRTC audio
          // delivery event; response.done only means generation finished.
          const lifecycle = playbackRef.current.consume(
            msg, activeTurnIdRef.current ?? latestTurnIdRef.current,
          );
          if (lifecycle) {
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
              window.dispatchEvent(new CustomEvent("clara:voice:playback", {
                detail: {
                  phase: lifecycle.phase,
                  responseId: lifecycle.responseId,
                  turnId: lifecycle.turnId,
                  status: lifecycle.status,
                  reason: lifecycle.reason,
                },
              }));
            }
            if (lifecycle.phase === "created") {
              isSpeakingRef.current = true;
              setIsSpeaking(true);
              if (lifecycle.turnId) {
                setHistory((prev) => prev.map((t) =>
                  t.id === lifecycle.turnId ? { ...t, status: "speaking" } : t
                ));
              }
            } else if (lifecycle.phase === "generation_done") {
              const finalText = extractResponseText(msg.response);
              if (finalText && lifecycle.turnId) {
                setHistory((prev) => prev.map((t) =>
                  t.id === lifecycle.turnId && !t.answer.trim()
                    ? { ...t, answer: finalText } : t
                ));
              }
              // If the provider never sends buffer.stopped, do not display an
              // infinite speaking state or claim success. Never auto-replay:
              // blind replay risks repeating audio and billing another turn.
              if (drainWatchdogRef.current !== null) clearTimeout(drainWatchdogRef.current);
              drainWatchdogRef.current = setTimeout(() => {
                const timeout = playbackRef.current.timeoutUndrained(lifecycle.responseId);
                if (timeout) finalizePlayback(timeout);
              }, 90_000);
            } else if (["delivered", "no_audio", "incomplete", "failed", "cancelled", "cleared", "undrained"]
              .includes(lifecycle.phase)) {
              finalizePlayback(lifecycle,
                type === RT_EVENTS.RESPONSE_DONE ? extractResponseText(msg.response) : "");
            }
          }

          // ── Tool call argument accumulation (delta) ────────────────────
          // FIX: Old code used `type.endsWith("output_tool_call.delta")` which
          // never matched the actual API event
          // "response.function_call_arguments.delta".
          // Also, arguments are streamed as msg.delta (not msg.tool_call.delta).
          if (type === RT_EVENTS.FUNCTION_ARGS_DELTA) {
            const callId = typeof msg.call_id === "string" ? msg.call_id : null;
            const delta  = typeof msg.delta   === "string" ? msg.delta   : "";
            if (callId && delta) {
              toolCallBufferRef.current[callId] =
                (toolCallBufferRef.current[callId] ?? "") + delta;
            }
          }

          // ── Tool call complete ─────────────────────────────────────────
          // FIX: Old code used `type.endsWith("output_tool_call.done")` which
          // never matched "response.function_call_arguments.done".
          // Also accessed msg.tool_call.id/name — correct is msg.call_id/name.
          if (type === RT_EVENTS.FUNCTION_ARGS_DONE) {
            const callId = typeof msg.call_id === "string" ? msg.call_id : null;
            const name   = typeof msg.name    === "string" ? msg.name    : "";
            if (callId && name) {
              const args = typeof msg.arguments === "string"
                ? msg.arguments
                : (toolCallBufferRef.current[callId] ?? "{}");
              delete toolCallBufferRef.current[callId];
              void handleToolCall({ id: callId, name, arguments: args });
            }
          }
        } catch {
          // Ignore non-JSON frames silently
        }
      };

      dc.onopen = () => {
        // Connection established — cancel the connection timeout.
        clearConnectTimeout();

        // Flush messages queued before the channel was open.
        const q = sendQueueRef.current;
        sendQueueRef.current = [];
        for (const item of q) {
          try { dc.send(item); } catch {}
        }
        setStatus("connected");
      };

      dc.onclose = () => {
        // FIX STALL-B: Data channel closed unexpectedly (network drop, session
        // expiry, server-side timeout). Previously this handler was empty, so:
        //   • status stayed "connected" — UI showed no error
        //   • sendJSON silently queued every message into sendQueueRef forever
        //   • the AI stopped responding with no indication to the user
        //
        // Now we check whether this is still the active connection token
        // (to avoid a stale closure from a previous connect() call firing
        // after the user has already reconnected), then surface an error.
        if (myToken !== connectTokenRef.current) return;
        setLastError(
          "Voice connection lost. " +
          "This can happen after ~15 minutes of inactivity or a network drop. " +
          "Click Connect to start a new session."
        );
        setStatus("error");
        // Abort in-flight RAG fetch and drain the stale queue.
        if (ragAbortRef.current) {
          ragAbortRef.current.abort();
          ragAbortRef.current = null;
        }
        sendQueueRef.current = [];
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      };

      // ── 4. Microphone ────────────────────────────────────────────────────
      const mediaDevices =
        typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
        throw new Error(
          "Live voice requires microphone access, which is unavailable in this " +
          "browser. Ensure the page is served over HTTPS and that you are using " +
          "a modern browser (Chrome 74+, Edge 79+, Firefox 68+, Safari 14+)."
        );
      }

      // FIX: Catch specific DOMException types and surface actionable messages.
      // The old code let getUserMedia throw a generic Error with no guidance.
      // FIX: Request echo cancellation, noise suppression, and AGC — the
      // three standard constraints that make voice interaction usable in noisy
      // environments. `{ audio: true }` disabled all of these.
      let mic: MediaStream;
      try {
        mic = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
      } catch (domErr) {
        const e = domErr as DOMException;
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          throw new Error(
            "Microphone access was denied. Click the microphone icon in your " +
            "browser's address bar to allow access, then try again."
          );
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          throw new Error(
            "No microphone detected. Connect a microphone or headset and try again."
          );
        } else if (e.name === "NotReadableError" || e.name === "TrackStartError") {
          throw new Error(
            "Your microphone is in use by another application (Zoom, Teams, etc.). " +
            "Close it and try again."
          );
        } else if (e.name === "OverconstrainedError") {
          throw new Error(
            "Your microphone doesn't support the required audio constraints. " +
            "Try a different microphone."
          );
        } else {
          throw new Error(
            `Microphone error (${e.name || "unknown"}): ` +
            `${e.message || "Could not access microphone. Ensure HTTPS is in use."}`
          );
        }
      }

      if (myToken !== connectTokenRef.current) {
        try { mic.getTracks().forEach((t) => t.stop()); } catch {}
        return;
      }
      micStreamRef.current = mic;
      // Honour a sticky mute across reconnects (privacy-first: a muted
      // visitor must never become live again without an explicit unmute).
      setMicStreamMuted(mic, micMutedRef.current);
      const audioTrack = mic.getAudioTracks()[0];
      if (!audioTrack) throw new Error("No audio track available from microphone");
      if (pc.signalingState === "closed")
        throw new Error("RTCPeerConnection closed before track could be added");

      // FIX 7: Remove the redundant pc.addTransceiver("audio", ...) call.
      //
      // The original code called BOTH addTrack() AND addTransceiver("audio"),
      // which created TWO audio transceivers in the SDP offer:
      //   m=audio … sendrecv   ← from addTrack
      //   m=audio … sendrecv   ← from addTransceiver (duplicate, no track)
      //
      // The second transceiver had no mic track attached, wasted bandwidth,
      // and could confuse the remote peer into sending two audio streams back.
      //
      // addTrack() already creates the sendrecv transceiver internally on
      // modern browsers (RFC 8829 §5.3). We only need the single addTrack call.
      pc.addTrack(audioTrack, mic);

      // ── 5. SDP offer + ICE gathering ─────────────────────────────────────
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // FIX: ICE gathering race condition.
      //
      // OLD CODE:
      //   if (pc.iceGatheringState !== "complete") {
      //     await new Promise<void>((resolve) => {
      //       const checkState = () => { … };
      //       pc.addEventListener("icegatheringstatechange", checkState); // ← LATE
      //     });
      //   }
      //
      // PROBLEM: If the browser completed ICE gathering between the outer
      // `if (pc.iceGatheringState !== "complete")` check and the
      // `addEventListener` call inside the Promise, the event fired before
      // the listener was attached and the Promise never resolved — hanging
      // the entire WebRTC connection silently.
      //
      // FIX: Register the listener SYNCHRONOUSLY inside the Promise constructor
      // (before any async gap), then immediately re-check state. An 8-second
      // safety timeout prevents an infinite hang when ICE stalls.
      if (pc.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (!resolved) {
              resolved = true;
              pc.removeEventListener("icegatheringstatechange", onStateChange);
              resolve();
            }
          };
          const onStateChange = () => {
            if (pc.iceGatheringState === "complete") done();
          };
          // Register BEFORE any async gap to avoid the race window.
          pc.addEventListener("icegatheringstatechange", onStateChange);
          // Immediately re-check in case state already flipped.
          if (pc.iceGatheringState === "complete") {
            done();
            return;
          }
          // Safety valve: 8 s prevents an infinite hang when ICE stalls.
          setTimeout(done, 8_000);
        });
      }

      if (myToken !== connectTokenRef.current) return;
      const localSDP = pc.localDescription?.sdp || offer.sdp || "";

      // ── 6. Exchange SDP with OpenAI Realtime ─────────────────────────────
      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
          },
          body: localSDP,
        }
      );
      if (!sdpRes.ok) {
        throw new Error(
          `SDP exchange failed (${sdpRes.status}): ${await sdpRes.text()}`
        );
      }
      const answerSdp = await sdpRes.text();
      if (myToken !== connectTokenRef.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // ── 7. Configure the live session ─────────────────────────────────────
      const instructions = [
        assistantPrompts.voice.sessionInstructions,
        languageGuidance.session,
      ].join("\n\n");

      const tools = [
        {
          type: "function",
          name: "rag_search",
          description: "Retrieve relevant snippets from the active document.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              documentId: { type: "string" },
            },
            required: ["query", "documentId"],
          },
        },
      ];

      if (myToken !== connectTokenRef.current) return;

      sendJSON({
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          tools,
          tool_choice: "auto",
          output_modalities: ["audio"],

          // VAD: mirror the server-side session creation values so there is no
          // inconsistency window between session creation and this update.
          // Values are read from the session response when available; otherwise
          // we use the same defaults as the server (threshold 0.5, 300/700ms).
          // FIX V1+V2+V3: create_response: false is echoed here to ensure
          // the update cannot accidentally re-enable auto-response generation.
          audio: {
            output: { voice: realtimeVoice },
            input: {
              turn_detection: {
                type: "server_vad",
                threshold:
                  typeof sessionTurnDetection?.threshold === "number"
                    ? sessionTurnDetection.threshold
                    : 0.5,
                prefix_padding_ms:
                  typeof sessionTurnDetection?.prefix_padding_ms === "number"
                    ? sessionTurnDetection.prefix_padding_ms
                    : 300,
                silence_duration_ms:
                  typeof sessionTurnDetection?.silence_duration_ms === "number"
                    ? sessionTurnDetection.silence_duration_ms
                    : 700,
                create_response: false,
              },
              transcription: {
                model:
                  typeof sessionTranscription?.model === "string"
                    ? sessionTranscription.model
                    : "gpt-4o-mini-transcribe",
                ...(typeof sessionTranscription?.language === "string"
                  ? { language: sessionTranscription.language }
                  : {}),
              },
            },
          },
        },
      });

      // ── 8. Optional greeting ──────────────────────────────────────────────
      const greetingText = voiceGreeting?.trim();
      if (greetingText) {
        const introTurnId = generateTurnId();
        activeTurnIdRef.current = introTurnId;
        latestTurnIdRef.current = introTurnId;
        // The greeting is a system generation: its latency record is replaced
        // by the first committed user turn (telemetry only — the playback flow
        // is untouched).
        latencyRef.current?.beginTurn({
          sessionId: latencySessionIdRef.current,
          turnId: introTurnId,
          provider: "openai",
          model: latencyModelRef.current,
        });
        latencyRef.current?.mark("llm.start");
        latencyRef.current?.mark("tts.start");
        setHistory((prev) => [
          ...prev,
          {
            id: introTurnId,
            question: "Welcome message",
            answer: "",
            sources: [],
            status: "pending",
          },
        ]);
        sendJSON({
          type: "response.create",
          response: {
            // The conversation always starts in the DEFAULT language.
            instructions: greetingInstruction(
              normalizeLanguagePolicy({
                defaultLanguage: languagePrefs.assistant,
                allowedLanguages: languagePrefs.customer,
              }),
              greetingText,
            ),
          },
        });
      }
    } catch (error) {
      clearConnectTimeout();
      setLastError((error as Error)?.message || "Failed to connect");
      setStatus("error");
      cleanup();
    }
  }, [
    cleanup,
    emitLatencyTelemetry,
    handleToolCall,
    kbId,
    markTurn,
    languageGuidance.session,
    languagePrefs.assistant,
    languagePrefs.customer,
    opts?.draftMode,
    opts?.embedApiKey,
    resolveTurnId,
    scheduleRag,
    sendJSON,
    voiceGreeting,
  ]);

  // ── disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    ++connectTokenRef.current;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  // ── sendText ──────────────────────────────────────────────────────────────
  //
  // FIX (Bug 2): Implement sendText so the suggested-prompt buttons in
  // VoiceChatModal can inject a typed user turn directly into the conversation
  // without the user needing to speak.
  //
  // Flow:
  //   1. Create a new VoiceTurn for history
  //   2. Optionally inject the document overview as a system context message
  //   3. Inject the text as a conversation.item.create user message
  //   4. Send response.create so the model responds immediately
  //
  // WHY NOT scheduleRag():
  //   performRagAndRespond() unconditionally sends another conversation.item.create
  //   with role:"user" containing the same question, then calls response.create.
  //   This causes OpenAI to see the question twice — resulting in two concurrent
  //   responses or an accidental response.cancel that kills the first answer.
  //
  //   Instead we call response.create directly here. The model is already
  //   configured with tool_choice:"auto" and a rag_search function declaration,
  //   so it will call rag_search itself when it needs specific document context.
  //   The handleToolCall path (already fully implemented) handles that call and
  //   populates turn.sources exactly as the voice path does.

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const newId = generateTurnId();
      activeTurnIdRef.current = newId;
      latestTurnIdRef.current = newId;
      userQueryRef.current = trimmed;

      setHistory((prev) => [
        ...prev,
        { id: newId, question: trimmed, answer: "", sources: [], status: "pending" },
      ]);

      // Inject the document overview as context if available so the model can
      // answer basic questions without a round-trip tool call.
      const overviewSummary = documentOverview?.trim() ?? "";
      if (overviewSummary) {
        sendJSON({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "system",
            content: [{
              type: "input_text",
              text: `${assistantPrompts.voice.quickResponseContextLabel}\n${overviewSummary}`,
            }],
          },
        });
      }

      sendJSON({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      });

      // Trigger the model to respond. With tool_choice:"auto" and the rag_search
      // function registered, the model will call rag_search if it needs specific
      // document context — handleToolCall will populate sources automatically.
      sendJSON({ type: "response.create" });
    },
    [documentOverview, sendJSON]
  );

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    status,
    error: lastError,
    isSpeaking,
    history,
    micMuted,
    setMicMuted,
    connect,
    disconnect,
    interrupt,
    sendText,
    remoteAudioStream,
    // OpenAI plays audio via a MediaStream (WebRTC), so no separate
    // AnalyserNode is needed — the visualiser reads from remoteAudioStream.
    outputAnalyserNode: null as AnalyserNode | null,
  } as const;
}

/** Grounding stage timings from /api/rag/search ({ retrievalMs: 312 } → { retrieval: 312 }). */
function ragTimings(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const out: Record<string, number> = {};
  for (const [key, ms] of Object.entries(value as Record<string, unknown>)) {
    if (typeof ms === "number") out[key.replace(/Ms$/, "")] = ms;
  }
  return Object.keys(out).length > 0 ? out : null;
}
