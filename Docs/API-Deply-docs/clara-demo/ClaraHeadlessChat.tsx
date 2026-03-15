/**
 * APPROACH 3 — Headless Custom Chat (100% your own UI)
 * src/components/clara/ClaraHeadlessChat.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses useClara() — zero widget DOM from Clara.
 * Every pixel is yours. This is a full working example styled with Tailwind.
 *
 * Usage:  <ClaraHeadlessChat />
 */
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useClara } from "@/lib/clara/useClara";

export function ClaraHeadlessChat() {
  const { messages, send, isThinking, config } = useClara();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const primary = config?.primaryColour ?? "#6366f1";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    send(input.trim());
    setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-lg font-sans">
      {/* Header — completely custom */}
      <div className="flex items-center gap-3 px-5 py-4 text-white"
        style={{ background: `linear-gradient(135deg, ${primary}, ${config?.accentColour ?? "#818cf8"})` }}>
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {config?.assistantName?.charAt(0) ?? "A"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{config?.assistantName ?? "Clara"}</p>
          <p className="text-xs opacity-75">Powered by AmazeTechCLANS AI</p>
        </div>
        <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Online" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
              msg.role === "user"
                ? "text-white rounded-br-sm"
                : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm"
            }`} style={msg.role === "user" ? { background: primary } : {}}>
              {msg.content || (
                <span className="flex gap-1 items-center">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/20 space-y-0.5">
                  {msg.sources.slice(0,3).map(s => (
                    <p key={s.index} className="text-[11px] opacity-80">
                      <strong>[S{s.index}]</strong> {s.title}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
            placeholder={`Ask ${config?.assistantName ?? "Clara"} anything…`} rows={1}
            disabled={isThinking}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-h-[38px] max-h-[88px]"
            style={{ opacity: isThinking ? 0.6 : 1 }} />
          <button onClick={handleSend} disabled={!input.trim() || isThinking}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: primary }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-300 mt-2">
          {config?.customPoweredBy ?? (config?.widgetShowBranding !== false ? "Powered by Clara AI" : "")}
        </p>
      </div>
    </div>
  );
}
