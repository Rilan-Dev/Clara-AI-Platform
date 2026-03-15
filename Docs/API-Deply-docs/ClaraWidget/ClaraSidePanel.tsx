/**
 * ClaraSidePanel.tsx — ATC branded slide-in chat + voice panel
 * Opens from "💬 Ask Clara" in the header.
 * Chat tab uses useClara() streaming. Voice tab uses the secure relay.
 */
import {
  useState, useRef, useEffect, KeyboardEvent,
  createContext, useContext,
} from "react";
import { useClara }      from "@/lib/clara/useClara";
import { ClaraVoiceButton } from "./ClaraVoiceButton";

// ── Context for open/close from anywhere ────────────────────────────────────

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

// ── ATC brand ────────────────────────────────────────────────────────────────

const ATC_GRADIENT = "linear-gradient(135deg, hsl(221 83% 53%), hsl(217 91% 60%))";

function CloseIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/>
    </svg>
  );
}

type Source = { index: number; title: string; snippet?: string };

function SourcesBlock({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  const count = sources.length;
  return (
    <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid rgba(59,109,232,0.1)" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 11, color: "hsl(221 83% 53%)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, transform: open ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>▶</span>
        {open ? "Hide" : "Show"} {count} source{count !== 1 ? "s" : ""}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
          {sources.map(s => (
            <div key={s.index} style={{ fontSize: 11, lineHeight: 1.45, background: "rgba(59,109,232,0.05)",
              borderRadius: 8, padding: "5px 8px", border: "1px solid rgba(59,109,232,0.1)" }}>
              <span style={{ fontWeight: 600, color: "hsl(221 83% 53%)" }}>[{s.index}] {s.title}</span>
              {s.snippet && <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 10.5, lineHeight: 1.5 }}>{s.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────

type Tab = "chat" | "voice";

function ClaraSidePanel() {
  const { open, setOpen } = useSidePanel();
  const { messages, send, isThinking, config } = useClara();
  const [tab,   setTab]   = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && tab === "chat") setTimeout(() => inputRef.current?.focus(), 320);
  }, [open, tab]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    send(input.trim()); setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const assistantName = config?.assistantName ?? "ATC Assistant";

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2147483644,
            background: "rgba(0,0,0,0.28)", backdropFilter: "blur(3px)",
            transition: "opacity 0.2s",
          }}
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${assistantName} assistant`}
        style={{
          position: "fixed", top: 0, right: 0,
          height: "100dvh", zIndex: 2147483645,
          width: "min(440px, 100vw)",
          background: "#ffffff",
          boxShadow: "-8px 0 40px rgba(59,109,232,0.14)",
          display: "flex", flexDirection: "column",
          fontFamily: "Inter, system-ui, sans-serif",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
        }}>

        {/* Header */}
        <div style={{
          background: ATC_GRADIENT, padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 11, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 13, color: "#fff", letterSpacing: 0.5,
          }}>
            ATC
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#fff",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {assistantName}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 1 }}>
              AmazeTechCLANS · Online
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.18)", border: "none",
              borderRadius: "50%", width: 28, height: 28, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.15s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.3)")}
            onMouseOut={e  => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}>
            <CloseIcon />
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", borderBottom: "1px solid rgba(59,109,232,0.1)",
          flexShrink: 0, background: "#fff",
        }}>
          {(["chat", "voice"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "11px 0", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                background: "none", transition: "color 0.15s",
                color: tab === t ? "hsl(221 83% 53%)" : "#94a3b8",
                borderBottom: tab === t ? "2px solid hsl(221 83% 53%)" : "2px solid transparent",
              }}>
              {t === "chat" ? "💬 Chat" : "🎙 Voice"}
            </button>
          ))}
        </div>

        {/* ── Chat tab ─────────────────────────────────────────────────── */}
        {tab === "chat" && (
          <>
            <div style={{
              flex: 1, overflowY: "auto", padding: "14px 14px 6px",
              display: "flex", flexDirection: "column", gap: 9,
              background: "#f8f9fc",
            }}>
              {messages.length === 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: "100%", color: "#94a3b8", fontSize: 13, textAlign: "center",
                  padding: "0 24px",
                }}>
                  Ask me anything about AmazeTechCLANS products, services, or support.
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id}
                  style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "84%", padding: "9px 13px",
                    borderRadius: msg.role === "user" ? "16px 16px 3px 16px" : "16px 16px 16px 3px",
                    fontSize: 13.5, lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap",
                    background: msg.role === "user" ? ATC_GRADIENT : "#fff",
                    color: msg.role === "user" ? "#fff" : "#1e293b",
                    boxShadow: msg.role === "user"
                      ? "0 2px 8px rgba(59,109,232,0.22)"
                      : "0 1px 4px rgba(0,0,0,0.07)",
                    border: msg.role === "assistant" ? "1px solid rgba(59,109,232,0.08)" : "none",
                  }}>
                    {msg.role === "assistant" && !msg.content ? (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {[0,1,2].map(i => (
                          <span key={i} style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: "hsl(221 83% 60%)",
                            display: "inline-block",
                            animation: "atcsp-bounce 0.85s infinite",
                            animationDelay: `${i*150}ms`,
                          }}/>
                        ))}
                      </span>
                    ) : msg.content}
                    {msg.sources && msg.sources.length > 0 && (
                      <SourcesBlock sources={msg.sources} />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
              borderTop: "1px solid rgba(59,109,232,0.1)",
              display: "flex", gap: 8, alignItems: "flex-end",
              background: "#fff", flexShrink: 0,
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
                  color: "#1e293b", opacity: isThinking ? 0.5 : 1,
                }}
                onFocus={e => (e.target.style.borderColor = "hsl(221 83% 53%)")}
                onBlur={e  => (e.target.style.borderColor = "rgba(59,109,232,0.2)")}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isThinking}
                style={{
                  width: 36, height: 36, borderRadius: "50%", border: "none",
                  background: !input.trim() || isThinking ? "#cbd5e1" : ATC_GRADIENT,
                  cursor: !input.trim() || isThinking ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", flexShrink: 0,
                }}>
                <SendIcon />
              </button>
            </div>
          </>
        )}

        {/* ── Voice tab ─────────────────────────────────────────────────── */}
        {tab === "voice" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 20, background: "#f8f9fc" }}>
            <ClaraVoiceButton />
          </div>
        )}

        {/* Branding footer */}
        <div style={{
          textAlign: "center", fontSize: 10, color: "#94a3b8",
          padding: "5px 0 calc(8px + env(safe-area-inset-bottom))",
          background: "#fff", flexShrink: 0,
        }}>
          Powered by{" "}
          <a href="https://amazetechclans.com" target="_blank" rel="noopener noreferrer"
            style={{ color: "hsl(221 83% 53%)", textDecoration: "none", fontWeight: 600 }}>
            AmazeTechCLANS AI
          </a>
        </div>
      </div>

      <style>{`
        @keyframes atcsp-bounce {
          0%,80%,100% { transform:translateY(0); }
          40%          { transform:translateY(-5px); }
        }
      `}</style>
    </>
  );
}
