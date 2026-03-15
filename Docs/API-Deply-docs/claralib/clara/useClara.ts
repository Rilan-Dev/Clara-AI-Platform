/**
 * src/lib/clara/useClara.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dead-simple React hook for Clara AI chat.
 *
 * You get the data. You build the UI however you want.
 *
 *   const { messages, send, isThinking, reset } = useClara();
 *
 * That's it. No configuration, no design objects, no Clara concepts to learn.
 * Style your own components. Use your own CSS / Tailwind / styled-components.
 *
 * messages shape:
 *   { id, role: "user"|"assistant", content, sources? }
 *   — assistant content streams in token-by-token while it is being generated
 *   — sources is an array of { title, snippet } citation objects (optional)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { CLARA_CONFIG } from "./config";

export type Message = {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  sources?: Array<{ index: number; title: string; snippet: string }>;
};

// Minimal config shape — only what the UI actually needs
export type ClaraConfig = {
  assistantName:  string;
  welcomeMessage: string;
  primaryColour:  string;
  accentColour:   string;
  avatarUrl:      string | null;
};

const BASE = CLARA_CONFIG.baseUrl;
const KEY  = CLARA_CONFIG.apiKey;
const AUTH = { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" };
const SID  = "chat_" + Math.random().toString(36).slice(2, 10);

// ── Hook ───────────────────────────────────────────────────────────────────

export function useClara() {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [config,     setConfig]     = useState<ClaraConfig | null>(null);
  const history = useRef<Array<{ role: string; content: string }>>([]);

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

  /** Send a message. Tokens stream in as they arrive. */
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    // Add user bubble immediately
    const userId = `u_${Date.now()}`;
    setMessages(prev => [...prev, { id: userId, role: "user", content: trimmed }]);
    history.current.push({ role: "user", content: trimmed });
    setIsThinking(true);

    // Add empty assistant bubble that we'll fill in as tokens arrive
    const asstId = `a_${Date.now()}`;
    setMessages(prev => [...prev, { id: asstId, role: "assistant", content: "" }]);
    let accumulated = "";

    try {
      const res = await fetch(`${BASE}/api/embed/chat`, {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          messages:  history.current,
          sessionId: SID,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      // Read streaming NDJSON
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
            if (event.type === "token" && typeof event.payload === "string") {
              accumulated += event.payload;
              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, content: accumulated } : m
              ));
            } else if (event.type === "sources") {
              setMessages(prev => prev.map(m =>
                m.id === asstId
                  ? { ...m, sources: event.payload as Message["sources"] }
                  : m
              ));
            }
          } catch { /* ignore malformed lines */ }
        }
      }

      history.current.push({ role: "assistant", content: accumulated });
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, content: `⚠ ${(err as Error).message}` }
          : m
      ));
    } finally {
      setIsThinking(false);
    }
  }, [isThinking]);

  /** Clear conversation and start fresh */
  const reset = useCallback(() => {
    history.current = [];
    setMessages([]);
  }, []);

  return {
    messages,    // Message[]  — render these however you want
    send,        // (text: string) => void
    isThinking,  // boolean  — true while AI is streaming
    reset,       // () => void  — clear conversation
    config,      // ClaraConfig | null  — brand colours + assistant name
  };
}
