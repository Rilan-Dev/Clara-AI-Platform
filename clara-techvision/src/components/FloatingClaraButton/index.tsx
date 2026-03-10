"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Minimize2, Mic, MessageSquare, Send } from "lucide-react";
import VoiceModal from "@/components/voice/VoiceModal";
import { useKnowledgeBases } from "@/features/knowledge-bases/hooks/use-knowledge-bases";
import { portalService } from "@/services/api/portal.service";

type Message = { role: "user" | "assistant"; content: string; id: string };

export default function FloatingClaraButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [kbId, setKbId] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const knowledgeBasesQuery = useKnowledgeBases();

  useEffect(() => {
    if (!kbId && knowledgeBasesQuery.data && knowledgeBasesQuery.data.length > 0) {
      setKbId(knowledgeBasesQuery.data[0].id);
    }
  }, [kbId, knowledgeBasesQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !kbId || loading) return;

    const text = input.trim();
    setInput("");

    const userMsg: Message = { role: "user", content: text, id: Date.now().toString() };
    const assistantId = `${Date.now() + 1}`;

    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "", id: assistantId }]);
    setLoading(true);

    try {
      const history = messages.map((message) => ({ role: message.role, content: message.content }));
      for await (const chunk of portalService.streamChat(kbId, text, history)) {
        setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, content: message.content + chunk } : message)));
      }
    } catch {
      setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, content: "Sorry, I couldn't get a response. Please try again." } : message)));
    } finally {
      setLoading(false);
    }
  }, [input, kbId, loading, messages]);

  return (
    <>
      {!open ? (
        <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-xl shadow-sky-500/30 flex items-center justify-center transition-all hover:scale-110 group">
          <Brain className="w-6 h-6 text-white" />
          <span className="absolute inset-0 rounded-full bg-sky-400 opacity-20 animate-ping" />
        </button>
      ) : null}

      {open ? (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-h-[600px] flex flex-col bg-[#0c1929] border border-white/[0.08] rounded-2xl shadow-2xl shadow-sky-500/10 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06] bg-gradient-to-r from-sky-600/20 to-blue-600/20">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Clara AI</div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400">Online · TechVision</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setVoiceOpen(true)} className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-sky-400 transition-colors" title="Voice assistant">
                <Mic className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-colors">
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" style={{ maxHeight: "400px" }}>
            {messages.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-xs text-white/40">Hi! I&apos;m Clara, TechVision&apos;s AI assistant.</p>
                <p className="text-xs text-white/30 mt-1">Ask me anything about our products.</p>
                <div className="mt-4 space-y-1.5">
                  {["How do I get started?", "What are the API rate limits?", "How do I integrate the SDK?"].map((question) => (
                    <button key={question} onClick={() => setInput(question)} className="block w-full text-left text-xs text-white/50 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:text-white transition-all px-3 py-2 rounded-lg">
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <div key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" ? (
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500/30 to-blue-600/30 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-3 h-3 text-sky-400" />
                  </div>
                ) : null}
                <div className={`max-w-[82%] px-3 py-2.5 rounded-xl text-xs leading-relaxed ${message.role === "user" ? "bg-sky-500/20 border border-sky-500/25 text-white" : "bg-white/[0.05] border border-white/[0.06] text-white/85"}`}>
                  {message.content || (loading && message.role === "assistant" ? (
                    <span className="flex gap-1 items-center py-0.5">
                      {[0, 150, 300].map((delay) => <span key={delay} className="w-1 h-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />)}
                    </span>
                  ) : "")}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex gap-2 items-end">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ask Clara anything..."
                disabled={loading || !kbId}
                className="flex-1 bg-white/[0.05] border border-white/[0.07] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-sky-500/50 transition-colors disabled:opacity-40 min-h-[38px]"
              />
              <button onClick={() => void sendMessage()} disabled={!input.trim() || loading || !kbId} className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 flex items-center justify-center transition-all shrink-0">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <p className="text-[10px] text-white/20 text-center mt-2">Powered by Clara AI · TechVision</p>
          </div>
        </div>
      ) : null}

      {voiceOpen ? <VoiceModal onClose={() => setVoiceOpen(false)} kbId={kbId} accentColor="#0ea5e9" assistantName="Clara" /> : null}
    </>
  );
}
