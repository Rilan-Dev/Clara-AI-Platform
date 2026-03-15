/**
 * APPROACH 4 — Floating Custom Panel (headless + custom FAB + custom panel)
 * src/components/clara/ClaraFloatingCustom.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Like Approach 1 but 100% your own design for both the FAB and the chat panel.
 * Uses useClara() to stream messages. Animate-able, fully branded.
 *
 * Usage:  <ClaraFloatingCustom position="bottom-right" />
 */
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useClara } from "@/lib/clara/useClara";

interface Props { position?: "bottom-right" | "bottom-left"; }

export function ClaraFloatingCustom({ position = "bottom-right" }: Props) {
  const { messages, send, isThinking, config } = useClara();
  const [open, setOpen]   = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const primary   = config?.primaryColour ?? "#6366f1";
  const right     = position === "bottom-right";

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    send(input.trim()); setInput("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const panelStyle: React.CSSProperties = {
    position: "fixed", zIndex: 2147483646, bottom: 88,
    ...(right ? { right: 24 } : { left: 24 }),
    width: 360, maxWidth: "calc(100vw - 32px)",
    background: "#fff", borderRadius: 20, overflow: "hidden",
    boxShadow: "0 16px 60px rgba(0,0,0,0.18)",
    display: open ? "flex" : "none", flexDirection: "column",
    height: config?.widgetChatHeight ?? 520,
    fontFamily: config?.widgetFontFamily ?? "system-ui,sans-serif",
    transition: "all 0.28s cubic-bezier(0.34,1.56,0.64,1)",
  };

  const fabStyle: React.CSSProperties = {
    position: "fixed", zIndex: 2147483647, bottom: 24,
    ...(right ? { right: 24 } : { left: 24 }),
    width: config?.widgetButtonSize ?? 56, height: config?.widgetButtonSize ?? 56,
    borderRadius: "50%", background: primary, border: "none",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.28)",
    transition: "transform 0.2s, box-shadow 0.2s",
    color: "#fff",
  };

  return (
    <>
      {/* Custom floating panel */}
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ padding: "14px 16px", background: primary, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>
            {config?.assistantName?.charAt(0) ?? "A"}
          </div>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {config?.assistantName ?? "Clara"}
          </span>
          <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "84%", padding: "9px 13px", borderRadius: msg.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px", fontSize: 13.5, lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap", background: msg.role === "user" ? primary : "#f5f5fb", color: msg.role === "user" ? "#fff" : "#1a1a2e" }}>
                {msg.content || <span style={{ display: "flex", gap: 4 }}>{[0,1,2].map(i => <i key={i} style={{ display: "block", width: 6, height: 6, borderRadius: "50%", background: "#9898b8", animation: "bounce .85s infinite", animationDelay: `${i*150}ms` }} />)}</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 7, alignItems: "flex-end", background: "#fff" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="Ask a question…" rows={1} disabled={isThinking}
            style={{ flex: 1, border: "1.5px solid rgba(0,0,0,0.09)", borderRadius: 11, padding: "8px 11px", fontSize: 13.5, fontFamily: "inherit", outline: "none", resize: "none", maxHeight: 88, minHeight: 36, lineHeight: 1.45, opacity: isThinking ? 0.5 : 1 }} />
          <button onClick={handleSend} disabled={!input.trim() || isThinking}
            style={{ width: 34, height: 34, borderRadius: "50%", background: !input.trim() || isThinking ? "#d1d5db" : primary, border: "none", cursor: !input.trim() || isThinking ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="white" stroke="none"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Custom FAB */}
      <button style={fabStyle} onClick={() => setOpen(v => !v)} aria-label="Toggle chat"
        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
        onMouseOut={e =>  { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}>
        {open
          ? <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        }
      </button>

      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`}</style>
    </>
  );
}
