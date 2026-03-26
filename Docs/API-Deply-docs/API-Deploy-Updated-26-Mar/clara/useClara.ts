/**
 * useClara.ts — embed chat hook
 *
 * Fixes:
 *   1. Tool-call artifact stripping  — filter out any "[Calling rag_search...]"
 *      or function-call JSON that the model might emit before the real answer
 *   2. Proper loading phases         — "searching" → "thinking" → streaming tokens
 *   3. Guaranteed completion         — retry once on empty response, hard timeout
 *   4. Dedup messages                — prevent the double-send bug in body
 *   5. History capped at 10 turns    — prevent context overflow
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE_URL, CLARA_API_KEY } from "@/lib/env";

export type Message = {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  sources?: Array<{ index: number; title: string; snippet: string }>;
};

export type ThinkingPhase = "idle" | "searching" | "thinking" | "streaming";

export type ClaraConfig = {
  assistantName:  string;
  welcomeMessage: string;
  primaryColour:  string;
  accentColour:   string;
  avatarUrl:      string | null;
};

const BASE = API_BASE_URL;
const KEY  = CLARA_API_KEY;
const AUTH = { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" };
const SID  = "chat_" + Math.random().toString(36).slice(2, 10);
const MAX_HISTORY = 20; // 10 user+assistant turns

// ── Patterns that indicate a model tool-call artifact, not real answer text ──
const TOOL_CALL_PATTERNS = [
  /^\s*\[Calling rag_search[^\]]*\]/i,
  /^\s*\[Searching[^\]]*\]/i,
  /^\s*\[Looking up[^\]]*\]/i,
  /^\s*\{"name"\s*:\s*"rag_search"/,
  /^\s*rag_search\(/,
  /^\s*<tool_call>/i,
  /^\s*```json\s*\{[^}]*"rag_search"/i,
];

function stripToolCallArtifacts(text: string): string {
  // Remove any line that looks like a tool-call artifact
  const lines = text.split("\n");
  const cleaned = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep blank lines
    return !TOOL_CALL_PATTERNS.some(re => re.test(trimmed));
  });
  return cleaned.join("\n").replace(/^\n+/, ""); // trim leading newlines
}

export function useClara() {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [phase,      setPhase]      = useState<ThinkingPhase>("idle");
  const [config,     setConfig]     = useState<ClaraConfig | null>(null);
  const history = useRef<Array<{ role: string; content: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Back-compat: isThinking = any non-idle phase
  const isThinking = phase !== "idle";

  useEffect(() => {
    fetch(`${BASE}/api/embed/config`, { headers: { Authorization: `Bearer ${KEY}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((cfg: ClaraConfig & { welcomeMessage?: string }) => {
        setConfig({
          assistantName:  cfg.assistantName ?? "Clara",
          welcomeMessage: cfg.welcomeMessage ?? "",
          primaryColour:  cfg.primaryColour ?? "#6366f1",
          accentColour:   cfg.accentColour  ?? "#818cf8",
          avatarUrl:      cfg.avatarUrl     ?? null,
        });
        if (cfg.welcomeMessage) {
          setMessages([{ id: "welcome", role: "assistant", content: cfg.welcomeMessage }]);
        }
      })
      .catch(() => {});
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const userId = `u_${Date.now()}`;
    setMessages(prev => [...prev, { id: userId, role: "user", content: trimmed }]);

    // Cap history to MAX_HISTORY entries, then append this user turn
    const cappedHistory = history.current.slice(-MAX_HISTORY);
    const requestMessages = [...cappedHistory, { role: "user", content: trimmed }];
    history.current = requestMessages;

    const asstId = `a_${Date.now()}`;
    setMessages(prev => [...prev, { id: asstId, role: "assistant", content: "" }]);

    // Phase 1: "searching" — shown immediately, before the fetch even returns
    setPhase("searching");

    let accumulated = "";
    let retried = false;

    const doStream = async (): Promise<boolean> => {
      try {
        const res = await fetch(`${BASE}/api/embed/chat`, {
          method: "POST",
          headers: AUTH,
          signal: ctrl.signal,
          body: JSON.stringify({ messages: requestMessages, sessionId: SID }),
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        // Phase 2: "thinking" — server responded, reading stream
        setPhase("thinking");

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let   buffer  = "";
        let   hasTokens = false;

        // Hard timeout: if no tokens in 15 s, abort
        const tokenTimeout = setTimeout(() => {
          if (!hasTokens) ctrl.abort();
        }, 15000);

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line) as { type: string; payload: unknown };

                if (event.type === "sources") {
                  setMessages(prev => prev.map(m =>
                    m.id === asstId
                      ? { ...m, sources: event.payload as Message["sources"] }
                      : m
                  ));

                } else if (event.type === "token" && typeof event.payload === "string") {
                  const raw = accumulated + event.payload;
                  const cleaned = stripToolCallArtifacts(raw);

                  // Only switch to streaming phase on first real token
                  if (cleaned.trim().length > 0 && !hasTokens) {
                    hasTokens = true;
                    setPhase("streaming");
                  }

                  accumulated = raw; // keep raw for history
                  setMessages(prev => prev.map(m =>
                    m.id === asstId ? { ...m, content: cleaned } : m
                  ));

                } else if (event.type === "error") {
                  const errMsg = typeof event.payload === "string" ? event.payload : "Unknown error";
                  setMessages(prev => prev.map(m =>
                    m.id === asstId
                      ? { ...m, content: `⚠ Sorry, I encountered an error. Please try again.\n\n_${errMsg}_` }
                      : m
                  ));
                  return false;
                }
              } catch { /* ignore malformed lines */ }
            }
          }
        } finally {
          clearTimeout(tokenTimeout);
        }

        return hasTokens;
      } catch (err) {
        if ((err as Error).name === "AbortError") return false;
        throw err;
      }
    };

    try {
      const success = await doStream();

      // Retry once if we got absolutely nothing (Qdrant may have been slow)
      if (!success && !retried && !ctrl.signal.aborted) {
        retried = true;
        setPhase("searching");
        accumulated = "";
        const retrySuccess = await doStream();
        if (!retrySuccess) {
          setMessages(prev => prev.map(m =>
            m.id === asstId
              ? { ...m, content: "I'm having trouble searching the knowledge base right now. Please try again in a moment." }
              : m
          ));
          return;
        }
      }

      const finalContent = stripToolCallArtifacts(accumulated).trim();
      if (!finalContent) {
        setMessages(prev => prev.map(m =>
          m.id === asstId
            ? { ...m, content: "I couldn't find a relevant answer in the knowledge base. Could you rephrase your question?" }
            : m
        ));
        return;
      }

      // Push clean content into history (not raw, so future context is clean)
      history.current[history.current.length - 1] = { role: "user", content: trimmed };
      history.current.push({ role: "assistant", content: finalContent });

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages(prev => prev.map(m =>
          m.id === asstId
            ? { ...m, content: `⚠ ${(err as Error).message}` }
            : m
        ));
      }
    } finally {
      setPhase("idle");
    }
  }, [isThinking]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    history.current = [];
    setMessages([]);
    setPhase("idle");
  }, []);

  return {
    messages,
    send,
    isThinking,
    phase,        // granular phase for richer loading UX
    reset,
    config,
  };
}
