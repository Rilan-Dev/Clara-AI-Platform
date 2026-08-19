"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Loader2, Sparkles, Bot, ChevronDown } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { MarkdownMessage } from "@/modules/assistant/ui/chat/MarkdownMessage";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { index: number; title: string; snippet: string; score: number }[];
};

type StreamEvent =
  | { type: "sources"; payload: ChatMessage["sources"] }
  | { type: "token"; payload: string }
  | { type: "done" }
  | { type: "error"; payload: string };

type DemoConfig = {
  enabled: boolean;
  chatEnabled: boolean;
  kbName: string;
  voiceGreeting: string;
  suggestedPrompts: string[];
};

const DEMO_API_KEY = "DEMO_MODE";

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const FALLBACK_CONFIG: DemoConfig = {
  enabled: true,
  chatEnabled: true,
  kbName: "Omen United Insurance",
  voiceGreeting: "Hello! I'm Clara AI, your Omen United Insurance assistant. How can I help you today?",
  suggestedPrompts: [
    "What does my insurance cover?",
    "How do I file a claim?",
    "What is Omen United Insurance?",
    "Tell me about your policies",
  ],
};

export default function DemoAssistantFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [demoConfig, setDemoConfig] = useState<DemoConfig>(FALLBACK_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [sessionId] = useState(genId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/platform/demo-config"))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("config request failed")))
      .then((config: DemoConfig) => setDemoConfig({ ...FALLBACK_CONFIG, ...config }))
      .catch(() => undefined)
      .finally(() => setConfigLoaded(true));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => inputRef.current?.focus(), 250);
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { id: genId(), role: "user", content: trimmed };
    const assistantMessage: ChatMessage = { id: genId(), role: "assistant", content: "" };
    const requestMessages = [...messages, userMessage].map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(apiUrl("/api/embed/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEMO_API_KEY}`,
        },
        body: JSON.stringify({ messages: requestMessages, sessionId }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error ?? `Chat request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sources: ChatMessage["sources"];

      const applyEvent = (event: StreamEvent) => {
        if (event.type === "sources") {
          sources = event.payload ?? undefined;
          setMessages((current) => {
            const copy = [...current];
            const last = copy.at(-1);
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, sources };
            return copy;
          });
        } else if (event.type === "token") {
          setMessages((current) => {
            const copy = [...current];
            const last = copy.at(-1);
            if (last?.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content + event.payload, sources: sources ?? last.sources };
            }
            return copy;
          });
        } else if (event.type === "error") {
          throw new Error(event.payload);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          applyEvent(JSON.parse(line) as StreamEvent);
        }
      }
      if (buffer.trim()) applyEvent(JSON.parse(buffer) as StreamEvent);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((current) => {
          const copy = [...current];
          const last = copy.at(-1);
          if (last?.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              content: "Sorry, I encountered an error. Please try again.",
            };
          }
          return copy;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, isStreaming, sessionId]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  if (configLoaded && (!demoConfig.enabled || !demoConfig.chatEnabled)) return null;

  const suggestions = demoConfig.suggestedPrompts?.length ? demoConfig.suggestedPrompts : FALLBACK_CONFIG.suggestedPrompts;

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            className="fixed bottom-6 right-6 z-[9999]"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse-ring" />
            <button
              id="demo-assistant-fab"
              onClick={() => setIsOpen(true)}
              className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 shadow-2xl shadow-indigo-500/30 flex items-center justify-center group transition-all duration-300 hover:scale-110 hover:shadow-indigo-500/50 animate-breathe cursor-pointer"
              aria-label="Open Clara AI Demo"
            >
              <Sparkles className="w-7 h-7 text-white relative z-10 group-hover:scale-110 transition-transform" />
            </button>
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap">
              <div className="glass-premium rounded-xl px-4 py-2 text-sm font-medium text-white/90 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-400" /> Try Clara AI
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-6 right-6 z-[9999] w-[420px] max-w-[calc(100vw-2rem)] h-[680px] max-h-[calc(100vh-3rem)] flex flex-col rounded-3xl overflow-hidden"
            style={{
              background: "rgba(8, 8, 20, 0.95)",
              backdropFilter: "blur(40px) saturate(1.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 25px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(99, 102, 241, 0.15)",
            }}
            initial={{ opacity: 0, scale: 0.5, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-gradient-to-br from-indigo-500/[0.12] to-violet-500/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Clara AI</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Demo Mode — {demoConfig.kbName || "Omen United Insurance"}
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06]" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-smooth" style={{ scrollbarWidth: "thin" }}>
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center mb-5">
                    <Sparkles className="w-8 h-8 text-indigo-400" />
                  </div>
                  <p className="text-base font-semibold text-white/90 mb-2">{demoConfig.voiceGreeting || FALLBACK_CONFIG.voiceGreeting}</p>
                  <p className="text-sm text-white/40 mb-6 max-w-[300px]">Ask about Omen United Insurance policies, coverage, benefits, claims, and other information in the knowledge base.</p>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                    {suggestions.map((suggestion) => (
                      <motion.button key={suggestion} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => void sendMessage(suggestion)} className="glass-card rounded-xl px-3 py-2.5 text-xs text-white/60 hover:text-white/90 text-left transition-colors cursor-pointer">
                        {suggestion}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <motion.div key={message.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[88%]">
                    <div className={`flex items-center gap-2 mb-1 ${message.role === "user" ? "justify-end" : ""}`}>
                      {message.role === "assistant" && <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center"><Bot className="w-3 h-3 text-white" /></div>}
                      <span className="text-[10px] text-white/30 uppercase tracking-wider">{message.role === "user" ? "You" : "Clara"}</span>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-md" : "bg-white/[0.05] text-white/85 border border-white/[0.06] rounded-bl-md"}`}>
                      {message.content ? (
                        message.role === "assistant" ? <div className="dark [&_.prose]:text-white/85 [&_.prose_p]:my-0"><MarkdownMessage content={message.content} variant="assistant" /></div> : message.content
                      ) : (
                        <div className="flex items-center gap-2"><div className="flex gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" /><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" /><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" /></div><span className="text-xs text-white/30">Thinking...</span></div>
                      )}
                    </div>
                    {message.sources?.length ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">Sources</p>
                        {message.sources.slice(0, 3).map((source) => <div key={source.index} className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-3 py-1.5 text-[11px] text-indigo-300/80"><span className="font-medium text-indigo-400">[S{source.index}]</span> {source.title}</div>)}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
              <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Ask Clara anything..." disabled={isStreaming} className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 resize-none outline-none min-h-[24px] max-h-[100px]" />
                <button type="submit" disabled={isStreaming || !input.trim()} className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white disabled:opacity-30 shrink-0">
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 px-1"><span className="text-[10px] text-white/20">Enter to send · Shift+Enter for newline</span><span className="text-[10px] text-white/20 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> Powered by Clara RAG</span></div>
            </form>

            {messages.length > 4 && <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })} className="absolute bottom-24 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-white/50 hover:text-white/80"><ChevronDown className="w-4 h-4" /></button>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
