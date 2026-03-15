import { useState, useRef, useEffect, KeyboardEvent, createContext, useContext } from "react";
import { useClara } from "@/lib/clara/useClara";

const SidePanelCtx = createContext({ open: false, setOpen: (_: boolean) => {} });

export function ClaraSidePanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidePanelCtx.Provider value={{ open, setOpen }}>
      {children}
      <ClaraSidePanel />
    </SidePanelCtx.Provider>
  );
}

export function useSidePanel() { return useContext(SidePanelCtx); }

/* ── The panel itself ────────────────────────────────────────────────────── */
function ClaraSidePanel() {
  const { open, setOpen }  = useSidePanel();
  const { messages, send, isThinking, config } = useClara();
  const [input, setInput]  = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const primary   = config?.primaryColour ?? "#6366f1";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    send(input.trim()); setInput("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[2147483644]"
          style={{ transition: "opacity 0.2s" }} />
      )}

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full z-[2147483645] flex flex-col bg-white shadow-2xl"
        style={{
          width: "min(420px, 100vw)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          fontFamily: config?.widgetFontFamily ?? "system-ui,sans-serif",
        }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 text-white flex-shrink-0"
          style={{ background: primary }}>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
            {config?.assistantName?.charAt(0) ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{config?.assistantName ?? "Clara"}</p>
            <p className="text-xs opacity-75">AI Assistant</p>
          </div>
          <button onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center flex-shrink-0 transition-colors"
            aria-label="Close">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user" ? "text-white rounded-br-sm" : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm"
              }`} style={msg.role === "user" ? { background: primary } : {}}>
                {msg.content || (
                  <span className="flex gap-1">{[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `${i*150}ms` }} />
                  ))}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2 items-end flex-shrink-0">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="Type your message…" rows={1} disabled={isThinking}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 min-h-[38px] max-h-[88px]" />
          <button onClick={handleSend} disabled={!input.trim() || isThinking}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 transition-opacity"
            style={{ background: primary }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
