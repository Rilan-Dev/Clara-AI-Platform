"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import type { VoiceStatus, VoiceTurn, VoiceClientOptions } from "../voice/types";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

type SessionResponse = {
  mode: "speech-engine";
  provider: "elevenlabs";
  voiceProvider: "elevenlabs";
  brainProvider: string;
  chatModel: string;
  realtimeModel: string;
  kbId: string;
  realtime: { endpoint: string };
  conversationToken: string;
  conversationId: string;
  language: string;
  voiceId: string | null;
};

type ElevenMessage = {
  source?: "user" | "ai";
  message?: string;
};

export function useElevenLabsSpeechEngine(options: VoiceClientOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [micMuted, setMicMutedState] = useState(false);
  const conversationRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const mountedRef = useRef(true);
  const turnCounterRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const conversation = conversationRef.current;
      conversationRef.current = null;
      if (conversation) {
        void conversation.endSession().catch(() => {});
      }
    };
  }, []);

  const pushMessage = useCallback((event: ElevenMessage) => {
    const content = typeof event.message === "string" ? event.message.trim() : "";
    if (!content) return;

    const role = event.source === "user" ? "user" : "assistant";

    setHistory((previous) => {
      if (role === "user") {
        const turnId = `el_${Date.now()}_${turnCounterRef.current++}`;
        return [
          ...previous,
          {
            id: turnId,
            question: content,
            answer: "",
            sources: [],
            status: "pending",
          },
        ];
      }

      const last = previous[previous.length - 1];
      if (last && last.status === "pending") {
        return previous.map((turn, index) =>
          index === previous.length - 1
            ? { ...turn, answer: turn.answer ? `${turn.answer}${content}` : content, status: "done" }
            : turn,
        );
      }

      return [
        ...previous,
        {
          id: `el_${Date.now()}_${turnCounterRef.current++}`,
          question: "",
          answer: content,
          sources: [],
          status: "done",
        },
      ];
    });
  }, []);

  const connect = useCallback(async () => {
    if (conversationRef.current) return;

    setError(null);
    setStatus("connecting");

    try {
      const headers: HeadersInit = options.embedApiKey
        ? { Authorization: `Bearer ${options.embedApiKey}`, "Content-Type": "application/json" }
        : withAuthHeaders({ "Content-Type": "application/json" });

      const response = await fetch(apiUrl("/api/voice/elevenlabs/speech-engine/session"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          kbId: options.kbId,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<SessionResponse> & { error?: string };
      if (!response.ok || !payload.conversationToken) {
        throw new Error(payload.error ?? `ElevenLabs realtime session failed: HTTP ${response.status}`);
      }

      await navigator.mediaDevices.getUserMedia({ audio: true });

      const conversation = await Conversation.startSession({
        conversationToken: payload.conversationToken,
        connectionType: "webrtc",
        onConnect: () => {
          if (!mountedRef.current) return;
          setStatus("connected");
        },
        onDisconnect: () => {
          if (!mountedRef.current) return;
          conversationRef.current = null;
          setIsSpeaking(false);
          setStatus("idle");
        },
        onError: (sessionError: unknown) => {
          if (!mountedRef.current) return;
          const message = sessionError instanceof Error ? sessionError.message : String(sessionError);
          setError(message);
          setStatus("error");
        },
        onMessage: (message: ElevenMessage) => {
          if (!mountedRef.current) return;
          pushMessage(message);
        },
        onModeChange: ({ mode }: { mode: string }) => {
          if (!mountedRef.current) return;
          const speaking = mode === "speaking";
          setIsSpeaking(speaking);
          setStatus("connected");
        },
      });

      conversationRef.current = conversation;
      if (mountedRef.current) {
        setMicMutedState(false);
        setStatus("connected");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (mountedRef.current) {
        setError(message);
        setStatus("error");
      }
      throw cause;
    }
  }, [options.embedApiKey, options.kbId, pushMessage, options.draftMode]);

  const disconnect = useCallback(() => {
    const conversation = conversationRef.current;
    conversationRef.current = null;
    setIsSpeaking(false);
    setStatus("idle");
    if (conversation) void conversation.endSession().catch(() => {});
  }, []);

  const interrupt = useCallback(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    // Speech Engine owns barge-in. This activity signal asks the active
    // conversation to yield immediately; a real user speech turn will also
    // trigger the provider's native interruption path.
    try { conversation.sendUserActivity(); } catch {}
  }, []);

  const sendText = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;

    const conversation = conversationRef.current;
    if (!conversation) return;

    try {
      conversation.sendUserMessage(clean);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    }
  }, []);

  const setMicMuted = useCallback((muted: boolean) => {
    setMicMutedState(muted);
    const conversation = conversationRef.current;
    if (conversation) {
      try { conversation.setMicMuted(muted); } catch {}
    }
  }, []);

  return {
    provider: "elevenlabs" as const,
    status,
    error,
    isSpeaking,
    history,
    remoteAudioStream: null,
    connect,
    disconnect,
    interrupt,
    sendText,
    micMuted,
    setMicMuted,
    outputAnalyserNode: null,
  } as const;
}
