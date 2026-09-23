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

  // Latest voice history snapshot — folded into messages when the session ends.
  const voiceHistoryRef = useRef(voiceSession.history);
  useEffect(() => {
    if (voiceActive) voiceHistoryRef.current = voiceSession.history;
  }, [voiceSession.history, voiceActive]);

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
          mode?: string;
          flags?: { voiceEnabled?: boolean; realtimeEnabled?: boolean };
          error?: string;
        };
        if (cancelled) return;
        setVoiceAvailability({
          provider: payload.provider ?? "unknown",
          voiceProvider: payload.voiceProvider,
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
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || thinking || !kbId) return;
      const userMessage: ConversationMessage = {
        id: nextId("m"),
        role: "user",
        content: text,
        origin: "text",
      };
      const assistantId = nextId("m");
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
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m)),
            );
          },
          onError: (message) => {
            setChatError(message);
            setMessages((prev) => prev.filter((m) => !(m.id === assistantId && !m.content)));
          },
          onDone: () => {
            setThinking(false);
          },
        },
      );
      setThinking(false);
    },
    [input, thinking, kbId, messages, chatEndpoint, chatHeaders, chatExtraBody],
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
    const turns = (voiceHistoryRef.current ?? []).filter(
      (turn) => !foldedTurnIdsRef.current.has(turn.id),
    );
    const folded: ConversationMessage[] = [];
    for (const turn of turns) {
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
    if (folded.length > 0) {
      setMessages((prev) => [...prev, ...folded]);
    }
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
