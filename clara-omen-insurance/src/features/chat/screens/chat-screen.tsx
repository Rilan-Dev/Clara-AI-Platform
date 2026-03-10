"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Send, X, RotateCcw, AlertCircle } from "lucide-react";
import { getKbsForOrg, streamChat, type KnowledgeBase } from "@/lib/api";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "10000000-0000-0000-0000-000000000001";

type Message = { role: "user" | "assistant"; content: string; id: string };

function ChatContent() {
  const searchParams   = useSearchParams();
  const [kbs, setKbs]  = useState<KnowledgeBase[]>([]);
  const [activeKb, setActiveKb] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    getKbsForOrg(ORG_ID).then(data => {
      setKbs(data);
      const preselect = searchParams.get("kb");
      if (preselect && data.find(k => k.id === preselect)) setActiveKb(preselect);
      else if (data.length > 0) setActiveKb(data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeKb || loading) return;
    const text = input.trim();
    setInput(""); setError("");
    const userMsg: Message = { role: "user", content: text, id: Date.now().toString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { role: "assistant", content: "", id: assistantId }]);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      for await (const chunk of streamChat(activeKb, text, history)) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get response";
      setError(msg);
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setLoading(false);
    }
  }, [input, activeKb, loading, messages]);

  const activeKbData = kbs.find(k => k.id === activeKb);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* KB Selector sidebar */}
      <aside className="w-64 bg-[#0c1d3a] border-r border-white/[0.06] flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Knowledge Bases</div>
          <div className="space-y-1">
            {kbs.length === 0 && <p className="text-xs text-white/30">Loading…</p>}
            {kbs.map(kb => (
              <button key={kb.id} onClick={() => { setActiveKb(kb.id); setMessages([]); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2.5 ${activeKb === kb.id ? "bg-[#c8821a]/15 text-white border border-[#c8821a]/25" : "text-white/50 hover:text-white hover:bg-white/[0.04]"}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${kb.status === "active" ? "bg-emerald-400" : "bg-slate-500"}`} />
                <span className="truncate font-medium">{kb.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 px-4 py-3">
          {activeKbData && (
            <div className="text-xs text-white/30 space-y-1">
            <div>{activeKbData.docCount} documents</div>
            <div>{activeKbData.readyCount} indexed</div>
            </div>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-white/[0.06] bg-[#0c1d3a]/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#c8821a]/20 border border-[#c8821a]/30 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-[#c8821a]" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">
                {activeKbData?.name ?? "Select a knowledge base"}
              </span>
              {activeKbData && <span className="text-xs text-white/30 ml-2">· Aria</span>}
            </div>
          </div>
          <button onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> New chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-14 h-14 rounded-2xl bg-[#c8821a]/10 border border-[#c8821a]/20 flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-[#c8821a]" />
              </div>
              <h3 className="text-white font-semibold mb-2">Start a conversation</h3>
              <p className="text-white/40 text-sm max-w-xs">
                {activeKb ? `Ask anything about ${activeKbData?.name}` : "Select a knowledge base to begin"}
              </p>
              {activeKb && (
                <div className="mt-6 grid grid-cols-1 gap-2 max-w-sm w-full">
                  {["What does my policy cover for water damage?","What is the excess for motor insurance?","How do I make a claim?"].map(q => (
                    <button key={q} onClick={() => setInput(q)}
                      className="text-left text-xs text-white/50 border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white transition-all px-4 py-2.5 rounded-xl">
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-[#c8821a]/20 border border-[#c8821a]/25 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-[#c8821a]">A</span>
                </div>
              )}
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-[#c8821a]/15 border border-[#c8821a]/25 text-white" : "bg-white/[0.05] border border-white/[0.07] text-white/90"}`}>
                {msg.content || (loading && msg.role === "assistant" ? (
                  <span className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8821a] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8821a] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8821a] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : "")}
              </div>
            </div>
          ))}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-white/[0.06] bg-[#0a1628] shrink-0">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                rows={1}
                placeholder={activeKb ? "Ask about your insurance policies…" : "Select a knowledge base first"}
                disabled={!activeKb || loading}
                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#c8821a]/50 transition-colors resize-none disabled:opacity-40 min-h-[46px] max-h-32" />
            </div>
            <button onClick={sendMessage} disabled={!input.trim() || !activeKb || loading}
              className="w-11 h-11 rounded-xl bg-[#c8821a] hover:bg-[#a86214] disabled:opacity-40 flex items-center justify-center transition-all shrink-0">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className="text-xs text-white/20 mt-2 text-center">AI responses are based on your uploaded documents. Always verify critical information.</p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-[#0c1d3a]">
        <div className="flex gap-1 items-center">
          <div className="w-2 h-2 rounded-full bg-[#c8821a] animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-[#c8821a] animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-[#c8821a] animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
