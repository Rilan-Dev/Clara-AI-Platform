"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, Send, Mic, Loader2, Sparkles,
  Volume2, VolumeX, Bot, ChevronDown,
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";

// ─── Types ───────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { index: number; title: string; snippet: string; score: number }[];
  timestamp: Date;
};

type StreamEvent =
  | { type: "sources"; payload: { index: number; title: string; snippet: string; score: number }[] }
  | { type: "token"; payload: string }
  | { type: "done" }
  | { type: "error"; payload: string };

type DemoConfig = {
  enabled: boolean;
  chatEnabled: boolean;
  kbName: string;
  suggestedPrompts: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEMO_API_KEY = "DEMO_MODE";

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DemoAssistantFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId] = useState(() => genId());
  const [showVoiceHint, setShowVoiceHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch demo config from admin panel ────────────────────────────────────
  const [demoConfig, setDemoConfig] = useState<DemoConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/platform/demo-config"))
      .then(r => r.json())
      .then((cfg: DemoConfig) => { setDemoConfig(cfg); setConfigLoaded(true); })
      .catch(() => setConfigLoaded(true));
  }, []);

  const hasApiKey = true; // Always true for the DEMO_MODE bypass

  // If config loaded and demo/chat is disabled, we'll return null at the end

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming || !hasApiKey) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    const assistantMsg: ChatMessage = {
      id: genId(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(apiUrl("/api/embed/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEMO_API_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, sessionId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let collectedSources: ChatMessage["sources"] = undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as StreamEvent;

            if (event.type === "sources") {
              collectedSources = event.payload;
            } else if (event.type === "token") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + event.payload,
                    sources: collectedSources ?? last.sources,
                  };
                }
                return copy;
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as StreamEvent;
          if (event.type === "token") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + event.payload,
                };
              }
              return copy;
            });
          }
        } catch {
          // ignore
        }
      }

      // Attach sources to the final message
      if (collectedSources) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = { ...last, sources: collectedSources };
          }
          return copy;
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
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
  }, [messages, isStreaming, hasApiKey, sessionId]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Suggested prompts ─────────────────────────────────────────────────────

  const suggestions = demoConfig?.suggestedPrompts ?? [
    "What can Clara AI do?",
    "How does RAG work?",
    "Tell me about voice AI",
    "How do I embed the widget?",
  ];

  // If config loaded and demo/chat is disabled, render nothing
  if (configLoaded && (!demoConfig?.enabled || !demoConfig?.chatEnabled)) {
    return null;
  }

  return (
    <>
      {/* ── Floating Action Button ──────────────────────────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            className="fixed bottom-6 right-6 z-[9999]"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse-ring" />
            <div className="absolute inset-0 rounded-full bg-violet-500/15 animate-pulse-ring" style={{ animationDelay: "0.7s" }} />

            {/* Orbiting particles */}
            <div className="absolute inset-[-12px] animate-orbit">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
            </div>
            <div className="absolute inset-[-16px] animate-orbit" style={{ animationDuration: "15s", animationDirection: "reverse" }}>
              <div className="absolute bottom-0 right-0 w-1 h-1 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.6)]" />
            </div>
            <div className="absolute inset-[-8px] animate-orbit" style={{ animationDuration: "25s" }}>
              <div className="absolute top-1/2 right-0 w-1 h-1 rounded-full bg-indigo-300 shadow-[0_0_6px_rgba(165,180,252,0.5)]" />
            </div>

            <button
              id="demo-assistant-fab"
              onClick={() => setIsOpen(true)}
              className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 shadow-2xl shadow-indigo-500/30 flex items-center justify-center group transition-all duration-300 hover:scale-110 hover:shadow-indigo-500/50 animate-breathe cursor-pointer"
              aria-label="Open Clara AI Demo"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Sparkles className="w-7 h-7 text-white relative z-10 group-hover:scale-110 transition-transform" />
            </button>

            {/* Label */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.5 }}
              className="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap"
            >
              <div className="glass-premium rounded-xl px-4 py-2 text-sm font-medium text-white/90 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-400" />
                Try Clara AI
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat"
            className="fixed bottom-6 right-6 z-[9999] w-[420px] max-w-[calc(100vw-2rem)] h-[680px] max-h-[calc(100vh-3rem)] flex flex-col rounded-3xl overflow-hidden"
            style={{
              background: "rgba(8, 8, 20, 0.95)",
              backdropFilter: "blur(40px) saturate(1.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 25px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
            }}
            initial={{ opacity: 0, scale: 0.5, y: 40, borderRadius: "50%" }}
            animate={{ opacity: 1, scale: 1, y: 0, borderRadius: "1.5rem" }}
            exit={{ opacity: 0, scale: 0.5, y: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]"
              style={{
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Clara AI</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                    Demo Mode — RAG + Voice
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── No API Key Warning ─────────────────────────────────── */}
            {!hasApiKey && (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-8 h-8 text-indigo-400/60" />
                  </div>
                  <p className="text-sm font-medium text-white/80 mb-2">Demo Coming Soon</p>
                  <p className="text-xs text-white/40 max-w-[250px]">
                    Configure a demo API key to enable live AI conversations on this landing page.
                  </p>
                </div>
              </div>
            )}

            {/* ── Messages ───────────────────────────────────────────── */}
            {hasApiKey && (
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-smooth"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(255,255,255,0.08) transparent",
                }}
              >
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2 }}
                      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center mb-5"
                    >
                      <Sparkles className="w-8 h-8 text-indigo-400" />
                    </motion.div>
                    <p className="text-base font-semibold text-white/90 mb-2">Welcome to Clara AI</p>
                    <p className="text-sm text-white/40 mb-6 max-w-[280px]">
                      Ask me anything about our platform. I&apos;m powered by RAG with real document citations.
                    </p>
                    <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                      {suggestions.map((s) => (
                        <motion.button
                          key={s}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => sendMessage(s)}
                          className="glass-card rounded-xl px-3 py-2.5 text-xs text-white/60 hover:text-white/90 text-left transition-colors cursor-pointer"
                        >
                          {s}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i === messages.length - 1 ? 0 : 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] ${msg.role === "user" ? "" : ""}`}>
                      {/* Avatar + name */}
                      <div className={`flex items-center gap-2 mb-1 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                            <Bot className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <span className="text-[10px] text-white/30 uppercase tracking-wider">
                          {msg.role === "user" ? "You" : "Clara"}
                        </span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-md"
                            : "bg-white/[0.05] text-white/85 border border-white/[0.06] rounded-bl-md"
                        }`}
                      >
                        {msg.content || (
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                            <span className="text-xs text-white/30">Thinking...</span>
                          </div>
                        )}
                      </div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Sources</p>
                          {msg.sources.slice(0, 3).map((src) => (
                            <div
                              key={src.index}
                              className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-3 py-1.5 text-[11px] text-indigo-300/80"
                            >
                              <span className="font-medium text-indigo-400">[S{src.index}]</span>{" "}
                              {src.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Scroll anchor */}
                <div className="h-1" />
              </div>
            )}

            {/* ── Input Area ──────────────────────────────────────────── */}
            {hasApiKey && (
              <form
                onSubmit={handleSubmit}
                className="px-4 pb-4 pt-2 border-t border-white/[0.06]"
              >
                <div
                  className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
                  style={{
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Ask Clara anything..."
                    disabled={isStreaming}
                    className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 resize-none outline-none min-h-[24px] max-h-[100px]"
                    style={{ scrollbarWidth: "none" }}
                  />
                  <button
                    type="submit"
                    disabled={isStreaming || !input.trim()}
                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[10px] text-white/20">
                    Enter to send · Shift+Enter for newline
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-white/20">
                    <Sparkles className="w-2.5 h-2.5" />
                    Powered by Clara RAG
                  </div>
                </div>
              </form>
            )}

            {/* ── Scroll to bottom button ─────────────────────────────── */}
            {messages.length > 4 && (
              <button
                onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white/[0.08] backdrop-blur-lg flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.12] transition-all cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
            </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
