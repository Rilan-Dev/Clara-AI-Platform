/**
 * ClaraWidget.tsx — AmazeTechCLANS AI Chat Widget
 * Floating chat assistant powered by Clara AI + ATC Knowledge Base.
 * Branded to match the AmazeTechCLANS visual identity.
 *
 * Usage: Drop <ClaraWidget /> anywhere in the app (already in App.tsx).
 * No props required — everything streams from the KB automatically.
 */
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useClara } from "@/lib/clara/useClara";

// ── ATC brand gradient (matches --gradient-menu in index.css) ────────────────
const ATC_GRADIENT = "linear-gradient(135deg, hsl(221 83% 53%), hsl(217 91% 60%))";
const ATC_GRADIENT_DARK = "linear-gradient(135deg, hsl(221 83% 43%), hsl(217 91% 50%))";

// ── ATC branded FAB icon — "ATC" letters inside a chat bubble ───────────────
function ATCIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Chat bubble */}
      <path
        d="M4 6C4 4.9 4.9 4 6 4H26C27.1 4 28 4.9 28 6V20C28 21.1 27.1 22 26 22H10L4 28V6Z"
        fill="white"
        fillOpacity="0.95"
      />
      {/* ATC text */}
      <text
        x="16" y="16"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8.5"
        fontWeight="800"
        fontFamily="Inter, system-ui, sans-serif"
        fill="hsl(221 83% 53%)"
        letterSpacing="0.5"
      >
        ATC
      </text>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13" stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="white" />
    </svg>
  );
}

export function ClaraWidget() {
  const { messages, send, isThinking, config } = useClara();
  const [open, setOpen]   = useState(false);
  const [input, setInput] = useState("");
  const [pulse, setPulse] = useState(true); // initial attention pulse
  const bottomRef         = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLTextAreaElement>(null);

  // Stop pulse ring after 5 s so it doesn't distract forever
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 5000);
    return () => clearTimeout(t);
  }, []);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 280);
  }, [open]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    send(input.trim());
    setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const assistantName = config?.assistantName ?? "ATC Assistant";

  return (
    <>
      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${assistantName} chat`}
        style={{
          position: "fixed",
          zIndex: 2147483646,
          bottom: 88,
          right: 24,
          width: 372,
          maxWidth: "calc(100vw - 32px)",
          height: 560,
          maxHeight: "calc(100dvh - 110px)",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 20,
          boxShadow: "0 20px 64px rgba(59,109,232,0.18), 0 4px 16px rgba(0,0,0,0.10)",
          border: "1px solid rgba(59,109,232,0.12)",
          overflow: "hidden",
          fontFamily: "Inter, system-ui, sans-serif",
          transformOrigin: "bottom right",
          transform: open ? "scale(1) translateY(0)" : "scale(0.88) translateY(16px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
        }}>

        {/* Header */}
        <div style={{
          background: ATC_GRADIENT,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 11,
          flexShrink: 0,
        }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <ATCIcon size={22} />
          </div>

          {/* Name + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#fff",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {assistantName}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>
              AmazeTechCLANS · Online
            </p>
          </div>

          {/* Close */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            style={{
              background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%",
              width: 28, height: 28, cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.3)")}
            onMouseOut={e  => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}>
            <CloseIcon />
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "14px 14px 6px",
          display: "flex", flexDirection: "column", gap: 9,
          background: "#f8f9fc",
          scrollBehavior: "smooth",
        }}>
          {messages.length === 0 && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", gap: 10, opacity: 0.5,
            }}>
              <ATCIcon size={40} />
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", textAlign: "center" }}>
                Ask me anything about<br />AmazeTechCLANS
              </p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id}
              style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "84%",
                padding: "9px 13px",
                borderRadius: msg.role === "user" ? "16px 16px 3px 16px" : "16px 16px 16px 3px",
                fontSize: 13.5,
                lineHeight: 1.55,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
                background: msg.role === "user" ? ATC_GRADIENT : "#ffffff",
                color: msg.role === "user" ? "#ffffff" : "#1e293b",
                boxShadow: msg.role === "user"
                  ? "0 2px 8px rgba(59,109,232,0.25)"
                  : "0 1px 4px rgba(0,0,0,0.07)",
                border: msg.role === "assistant" ? "1px solid rgba(59,109,232,0.08)" : "none",
              }}>
                {/* Thinking dots */}
                {msg.role === "assistant" && !msg.content ? (
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 18 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        display: "block", width: 6, height: 6, borderRadius: "50%",
                        background: "hsl(221 83% 60%)",
                        animation: "atc-bounce 0.85s infinite",
                        animationDelay: `${i * 150}ms`,
                      }} />
                    ))}
                  </span>
                ) : msg.content}

                {/* Source citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{
                    marginTop: 8, paddingTop: 8,
                    borderTop: msg.role === "user" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(59,109,232,0.1)",
                  }}>
                    {msg.sources.slice(0, 3).map(s => (
                      <p key={s.index} style={{ margin: 0, fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
                        [{s.index}] {s.title}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <div style={{
          padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
          borderTop: "1px solid rgba(59,109,232,0.1)",
          display: "flex", gap: 8, alignItems: "flex-end",
          background: "#ffffff", flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about AmazeTechCLANS…"
            rows={1}
            disabled={isThinking}
            style={{
              flex: 1, resize: "none", border: "1.5px solid rgba(59,109,232,0.2)",
              borderRadius: 12, padding: "8px 11px", fontSize: 13.5,
              fontFamily: "inherit", outline: "none", lineHeight: 1.45,
              maxHeight: 88, minHeight: 36, background: "#f8f9fc",
              color: "#1e293b", transition: "border-color 0.15s",
              opacity: isThinking ? 0.5 : 1,
            }}
            onFocus={e  => (e.target.style.borderColor = "hsl(221 83% 53%)")}
            onBlur={e   => (e.target.style.borderColor = "rgba(59,109,232,0.2)")}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            aria-label="Send message"
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: !input.trim() || isThinking ? "#cbd5e1" : ATC_GRADIENT,
              cursor: !input.trim() || isThinking ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.15s, transform 0.1s",
            }}
            onMouseOver={e => { if (input.trim() && !isThinking) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
            onMouseOut={e  => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}>
            <SendIcon />
          </button>
        </div>

        {/* Branding footer */}
        <div style={{
          textAlign: "center", fontSize: 10, color: "#94a3b8",
          padding: "4px 0 8px", flexShrink: 0, background: "#ffffff",
        }}>
          Powered by{" "}
          <a href="https://amazetechclans.com" target="_blank" rel="noopener noreferrer"
            style={{ color: "hsl(221 83% 53%)", textDecoration: "none", fontWeight: 600 }}>
            AmazeTechCLANS AI
          </a>
        </div>
      </div>

      {/* ── FAB Launcher ─────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", zIndex: 2147483647, bottom: 24, right: 24 }}>
        {/* Attention pulse ring (shows for 5 s on load) */}
        {pulse && !open && (
          <span style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            background: "hsl(221 83% 53%)", opacity: 0,
            animation: "atc-ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
          }} />
        )}

        {/* Label badge — shows when closed */}
        {!open && (
          <div style={{
            position: "absolute", bottom: "110%", right: 0, marginBottom: 6,
            background: ATC_GRADIENT,
            color: "#fff", fontSize: 12, fontWeight: 600,
            padding: "5px 12px", borderRadius: 20, whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(59,109,232,0.35)",
            fontFamily: "Inter, system-ui, sans-serif",
            animation: "atc-fade-in 0.4s ease 0.6s both",
            pointerEvents: "none",
          }}>
            Chat with us 👋
          </div>
        )}

        {/* Main FAB button */}
        <button
          onClick={() => setOpen(v => !v)}
          aria-label={open ? "Close chat" : "Open ATC chat assistant"}
          aria-expanded={open}
          style={{
            width: 56, height: 56,
            borderRadius: "50%",
            background: open ? ATC_GRADIENT_DARK : ATC_GRADIENT,
            border: "none",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 24px rgba(59,109,232,0.4)",
            transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s",
          }}
          onMouseOver={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(59,109,232,0.55)";
          }}
          onMouseOut={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(59,109,232,0.4)";
          }}>
          <div style={{
            transition: "transform 0.22s, opacity 0.15s",
            transform: open ? "rotate(90deg) scale(0.85)" : "rotate(0deg) scale(1)",
          }}>
            {open ? <CloseIcon /> : <ATCIcon size={28} />}
          </div>
        </button>
      </div>

      {/* ── Keyframe styles injected once ────────────────────────────────── */}
      <style>{`
        @keyframes atc-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%            { transform: translateY(-5px); }
        }
        @keyframes atc-ping {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes atc-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
