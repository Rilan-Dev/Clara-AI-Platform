import { useState, useEffect, useRef, useCallback } from "react";
import { CLARA_CONFIG } from "./config";

export type Message = {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  sources?: Array<{ index: number; title: string; snippet: string }>;
};

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

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userId = `u_${Date.now()}`;
    setMessages(prev => [...prev, { id: userId, role: "user", content: trimmed }]);
    history.current.push({ role: "user", content: trimmed });
    setIsThinking(true);

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

  const reset = useCallback(() => {
    history.current = [];
    setMessages([]);
  }, []);

  return {
    messages,    
    send,        
    isThinking,  
    reset,       
    config,      
  };
}
