"use client";

/**
 * src/features/agent-conversation/hooks/use-agent-conversation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The conversation controller shared by the draft preview and the published
 * page. Owns:
 *
 *   • the combined message list (text turns + folded voice turns),
 *   • the text chat streaming call (endpoint/headers injected by the caller),
 *   • the realtime voice session (useVoiceClient — draftMode for the preview,
 *     public session token for the published page),
 *   • the in-window voice lifecycle: start → connect → active → end → fold
 *     the spoken turns back into the chat message list.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";
import { useMicVisualizer } from "./use-mic-visualizer";
import { streamAgentChat } from "../lib/chat-stream";
import { useVoiceChatSpeech } from "./use-voice-chat-speech";
import { isGreetingTurn } from "../lib/voice-turns";
import type { ChatSource, ConversationMessage, VoiceAvailability } from "../types";

export interface UseAgentConversationOptions {
  kbId: string | null;
  /** Draft preview: voice/chat requests carry scope:"draft". */
  draftMode?: boolean;
  /** Public published page: routes voice+chat through the embed stack. */
  embedApiKey?: string;
  assistantName: string;
  voiceGreeting?: string;
  language?: { assistant: string; customer?: string[] };
  /** Text-chat transport. */
  chatEndpoint?: string;
  chatHeaders?: HeadersInit;
  chatExtraBody?: Record<string, unknown>;
}

let messageSeq = 0;
function nextId(prefix: string): string {
  messageSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${messageSeq}`;
}

export function useAgentConversation(options: UseAgentConversationOptions) {
  const {
    kbId,
    draftMode,
    embedApiKey,
    assistantName,
    voiceGreeting,
    language,
    chatEndpoint = "/api/chat",
    chatHeaders,
    chatExtraBody,
  } = options;

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceStartError, setVoiceStartError] = useState<string | null>(null);
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailability | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── The provider-agnostic voice session ────────────────────────────────
  const voiceSession = useVoiceClient({
    kbId,
    draftMode,
    embedApiKey,
    voiceGreeting,
    language: language
      ? { assistant: language.assistant, customer: language.customer ?? [language.assistant] }
      : undefined,
  });

  // Viz-only mic capture for the user-speaking orb state.
  const { levels: micLevels } = useMicVisualizer(voiceActive);

  // Keep the latest provider history available for session teardown and
  // mirror it into the shared chat list while the realtime session is active.
  // Provider hooks expose the same VoiceTurn shape, so this stays transport-
  // agnostic: OpenAI, Gemini, ElevenLabs and Sarvam all stream through the
  // same UI message surface.
  const voiceHistoryRef = useRef(voiceSession.history);
  const liveVoiceTurnIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    voiceHistoryRef.current = voiceSession.history;
  }, [voiceSession.history]);

  // Realtime providers update history incrementally (partial STT, committed
  // user text, then assistant answer tokens). Previously we waited until
  // disconnect() to fold these turns, which made the Conversation rail look
  // empty for the entire call. Upsert each turn by its stable id so the rail
  // renders partial/final user text and assistant answer deltas immediately.
  useEffect(() => {
    if (!voiceActive) return;

    const turns = voiceSession.history ?? [];
    if (turns.length === 0) return;

    const liveMessages: ConversationMessage[] = [];
    const activeTurnIds = new Set(turns.map((turn) => turn.id));
    const staleTurnIds = [...liveVoiceTurnIdsRef.current].filter((id) => !activeTurnIds.has(id));
    for (const turn of turns) {
      // The session greeting is a SYSTEM announcement (the user never spoke).
      // Folding it would re-inject the welcome text into the chat rail on top
      // of the static welcome message — the duplication the owner reported.
      // It still plays audibly; only the transcript folding skips it.
      if (isGreetingTurn(turn)) continue;
      const question = (turn.question ?? "").trim();
      const answer = turn.answer ?? "";
      if (question) {
        liveMessages.push({
          id: `v-${turn.id}-q`,
          role: "user",
          content: question,
          origin: "voice",
        });
      }
      if (answer) {
        liveMessages.push({
          id: `v-${turn.id}-a`,
          role: "assistant",
          content: answer,
          origin: "voice",
          sources: (turn.sources ?? []).map((s, i) => ({
            title: s.title,
            snippet: s.snippet,
            index: i + 1,
          })),
        });
      }
      liveVoiceTurnIdsRef.current.add(turn.id);
    }

    setMessages((prev) => {
      const liveIds = new Set(liveMessages.map((message) => message.id));
      const updates = new Map(liveMessages.map((message) => [message.id, message]));
      const staleIds = new Set(
        staleTurnIds.flatMap((id) => [`v-${id}-q`, `v-${id}-a`]),
      );
      const next = prev
        .filter((message) => !staleIds.has(message.id))
        .map((message) => updates.get(message.id) ?? message);
      for (const message of liveMessages) {
        if (!prev.some((existing) => existing.id === message.id)) next.push(message);
      }
      // Keep the existing conversation order and append only newly-created
      // live turns; subsequent STT/LLM deltas update those same message ids.
      return next.filter((message) => !liveIds.has(message.id) || updates.has(message.id));
    });
  }, [voiceActive, voiceSession.history]);

  // Turns already folded into the chat message list. Several provider hooks
  // keep their transcript state across sessions within one hook instance, so
  // a second voice session must not re-fold the first session's turns.
  const foldedTurnIdsRef = useRef<Set<string>>(new Set());

  // ── Voice availability lookup (routes on the same axis the session will) ─
  useEffect(() => {
    if (!kbId) return;
    let cancelled = false;
    // The embed multiplexer mints real sessions — for the public page the
    // availability comes from the public config endpoint instead, so this
    // lookup only runs for the authenticated (non-embed) surfaces.
    if (embedApiKey || !kbId) return;

    (async () => {
      try {
        const { withAuthHeaders } = await import("@/lib/client-auth");
        const { apiUrl } = await import("@/lib/runtime");
        const res = await fetch(apiUrl("/api/voice/provider"), {
          method: "POST",
          headers: withAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ kbId, ...(draftMode ? { scope: "draft" } : {}) }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          provider?: string;
          voiceProvider?: string;
          voiceChatProvider?: string;
          mode?: string;
          flags?: { voiceEnabled?: boolean; realtimeEnabled?: boolean };
          error?: string;
        };
        if (cancelled) return;
        setVoiceAvailability({
          provider: payload.provider ?? "unknown",
          voiceProvider: payload.voiceProvider,
          voiceChatProvider: payload.voiceChatProvider,
          mode: payload.mode,
          voiceEnabled: payload.flags?.voiceEnabled !== false,
          realtimeEnabled: payload.flags?.realtimeEnabled !== false,
          error: payload.error,
        });
      } catch {
        if (!cancelled) setVoiceAvailability(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kbId, draftMode, embedApiKey]);

  /** Public surfaces inject availability resolved server-side (no session mint). */
  const setExternalVoiceAvailability = useCallback((value: VoiceAvailability | null) => {
    setVoiceAvailability(value);
  }, []);

  // ── Text chat ────────────────────────────────────────────────────────────
  const sendText = useCallback(
    async (textOverride?: string): Promise<{ id: string; content: string } | null> => {
      const text = (textOverride ?? input).trim();
      if (!text || thinking || !kbId) return null;
      const userMessage: ConversationMessage = {
        id: nextId("m"),
        role: "user",
        content: text,
        origin: "text",
      };
      const assistantId = nextId("m");
      let replyText = "";
      setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "", origin: "text" }]);
      setInput("");
      setChatError(null);
      setThinking(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.role === "assistant" ? m.content : m.content,
      }));

      await streamAgentChat(
        {
          kbId,
          messages: history,
          endpoint: chatEndpoint,
          headers: chatHeaders ?? {},
          extraBody: chatExtraBody,
          signal: controller.signal,
        },
        {
          onSources: (sources) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, sources: sources as ChatSource[] }
                  : m,
              ),
            );
          },
          onToken: (token) => {
            replyText += token;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m)),
            );
          },
          onError: (message) => {
            setChatError(message);
            setMessages((prev) => prev.filter((m) => !(m.id === assistantId && !m.content)));
          },
          onTiming: (timing) => {
            if (timing.phase === "first_token" || timing.phase === "complete") {
              // No question text, credentials or response content in diagnostics.
              console.info("[clara/chat-timing]", {
                endpoint: chatEndpoint,
                milestone: timing.phase,
                elapsedMs: timing.elapsedMs,
                serverTiming: timing.serverTiming,
              });
            }
          },
          onDone: () => {
            setThinking(false);
          },
        },
      );
      setThinking(false);
      return { id: assistantId, content: replyText };
    },
    [input, thinking, kbId, messages, chatEndpoint, chatHeaders, chatExtraBody],
  );

  // ── Voice Chat (chat window): dictate → send → speak the reply ─────────
  // Turn-based STT → chat → TTS on the agent's Voice Chat provider. The
  // realtime voice agent (streaming WebSockets) is the separate voice stage.
  const finishDictationRef = useRef<() => void>(() => {});
  const voiceChat = useVoiceChatSpeech({
    kbId,
    provider: voiceAvailability?.voiceChatProvider,
    enabled: voiceAvailability?.voiceEnabled !== false && !voiceActive,
    embedApiKey,
    draftMode,
    onDictationLimit: () => finishDictationRef.current(),
  });
  const { stopDictation, startDictation, speak } = voiceChat;

  const finishDictation = useCallback(async () => {
    const text = await stopDictation();
    if (!text) return;
    const reply = await sendText(text);
    // Voice in → voice out: speak the reply this dictated turn produced.
    if (reply?.content.trim()) void speak(reply.id, reply.content);
  }, [sendText, speak, stopDictation]);
  useEffect(() => { finishDictationRef.current = () => { void finishDictation(); }; }, [finishDictation]);

  const toggleDictation = useCallback(() => {
    if (voiceChat.dictation === "recording") void finishDictation();
    else if (voiceChat.dictation === "idle") void startDictation();
  }, [finishDictation, startDictation, voiceChat.dictation]);

  // ── Message translation (visitor picks a language on a message) ──────────
  // Signed-in surfaces use /api/translate with the platform session; the
  // public page uses /api/embed/translate with its public session token.
  // The server only accepts the assistant's allowed languages.
  const translateMessage = useCallback(
    async (text: string, targetLanguage: string): Promise<string> => {
      if (!kbId) throw new Error("No knowledge base is attached to this agent.");
      const { apiUrl } = await import("@/lib/runtime");
      const headers = new Headers({ "Content-Type": "application/json" });
      if (chatHeaders) new Headers(chatHeaders).forEach((value, key) => headers.set(key, value));
      const response = await fetch(apiUrl(embedApiKey ? "/api/embed/translate" : "/api/translate"), {
        method: "POST",
        headers,
        body: JSON.stringify({ kbId, text, targetLanguage, ...(draftMode ? { scope: "draft" } : {}) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { translatedText?: string; error?: string };
      if (!response.ok || !payload.translatedText) {
        throw new Error(payload.error ?? "The translation could not be completed.");
      }
      return payload.translatedText;
    },
    [kbId, chatHeaders, embedApiKey, draftMode],
  );

  // ── Voice session lifecycle (inside the chat window) ────────────────────
  const startVoice = useCallback(async () => {
    if (!kbId || voiceActive) return;
    setVoiceStartError(null);
    setChatError(null);
    setVoiceActive(true);
    try {
      await voiceSession.connect();
    } catch (err) {
      // The stage surfaces session.error; keep the message for the chat view.
      setVoiceStartError((err as Error)?.message ?? "The voice session could not start.");
    }
  }, [kbId, voiceActive, voiceSession]);

  const endVoice = useCallback(() => {
    try {
      voiceSession.disconnect();
    } catch {
      /* teardown is best-effort */
    }
    // Fold the spoken turns into the chat message list — only turns that
    // have not been folded before (provider hooks may retain transcript
    // state across sessions within one hook instance).
    const turns = voiceHistoryRef.current ?? [];
    const folded: ConversationMessage[] = [];
    for (const turn of turns) {
      // Same rule as the live fold: the greeting turn is not a conversational
      // turn, so it must not persist in the chat transcript after the call.
      if (isGreetingTurn(turn)) continue;
      foldedTurnIdsRef.current.add(turn.id);
      const question = (turn.question ?? "").trim();
      const answer = (turn.answer ?? "").trim();
      if (question) {
        folded.push({ id: `v-${turn.id}-q`, role: "user", content: question, origin: "voice" });
      }
      if (answer) {
        folded.push({
          id: `v-${turn.id}-a`,
          role: "assistant",
          content: answer,
          origin: "voice",
          sources: (turn.sources ?? []).map((s, i) => ({
            title: s.title,
            snippet: s.snippet,
            index: i + 1,
          })),
        });
      }
    }
    // The live effect normally already rendered these messages. Merge by id
    // rather than appending so ending a call can never duplicate a live turn.
    if (folded.length > 0) {
      setMessages((prev) => {
        const byId = new Map(prev.map((message) => [message.id, message]));
        for (const message of folded) byId.set(message.id, message);
        return Array.from(byId.values());
      });
    }
    liveVoiceTurnIdsRef.current.clear();
    setVoiceActive(false);
  }, [voiceSession]);

  // Safety: if the provider session died on its own (error status), surface it.
  useEffect(() => {
    if (voiceActive && voiceSession.status === "error") {
      setVoiceStartError(voiceSession.error ?? "The voice session ended unexpectedly.");
    }
  }, [voiceActive, voiceSession.status, voiceSession.error]);

  return {
    // chat
    messages,
    input,
    setInput,
    thinking,
    chatError,
    sendText,
    // translation
    translateMessage,
    translationLanguages: language
      ? [...new Set([language.assistant, ...(language.customer ?? [])].filter(Boolean))]
      : [],
    // voice chat (chat window, turn-based)
    voiceChat: { ...voiceChat, toggleDictation },
    // voice
    voiceSession,
    voiceActive,
    startVoice,
    endVoice,
    voiceStartError,
    micLevels,
    voiceAvailability,
    setExternalVoiceAvailability,
    assistantName,
  };
}
