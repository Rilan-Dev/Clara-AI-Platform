import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useClara }      from "@/lib/clara/useClara";
import { useClaraVoice } from "@/lib/clara/useClaraVoice";
import { MarkdownMessage, MarkdownVoice } from "@/lib/clara/markdown";

type Source = { index: number; title: string; snippet?: string };

function SourcesBlock({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid rgba(59,109,232,0.1)" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 11, color: "hsl(221 83% 53%)", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, display: "inline-block", transition: "transform 0.15s",
          transform: open ? "rotate(90deg)" : "none" }}>▶</span>
        {open ? "Hide" : "Show"} {sources.length} source{sources.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 4 }}>
          {sources.map(s => (
            <div key={s.index} style={{ fontSize: 11, lineHeight: 1.45,
              background: "rgba(59,109,232,0.05)", borderRadius: 8, padding: "5px 8px",
              border: "1px solid rgba(59,109,232,0.1)" }}>
              <span style={{ fontWeight: 600, color: "hsl(221 83% 53%)" }}>[{s.index}] {s.title}</span>
              {s.snippet && <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 10.5 }}>{s.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const G  = "linear-gradient(135deg, hsl(221 83% 53%), hsl(217 91% 60%))";
const GD = "linear-gradient(135deg, hsl(221 83% 43%), hsl(217 91% 50%))";
type Tab = "chat" | "voice";

function ATCIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M4 6C4 4.9 4.9 4 6 4H26C27.1 4 28 4.9 28 6V20C28 21.1 27.1 22 26 22H10L4 28V6Z"
        fill="white" fillOpacity="0.95" />
      <text x="16" y="16" textAnchor="middle" dominantBaseline="middle"
        fontSize="8.5" fontWeight="800" fontFamily="Inter, system-ui, sans-serif"
        fill="hsl(221 83% 53%)" letterSpacing="0.5">ATC</text>
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13" stroke="white" strokeWidth={2.2} strokeLinecap="round"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="white"/>
    </svg>
  );
}
function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    </svg>
  );
}
function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2.5"/>
    </svg>
  );
}
function SpinIcon() {
  return (
    <svg className="animate-spin" width={22} height={22} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a9 9 0 1 1-6.2-8.56" strokeLinecap="round"/>
    </svg>
  );
}

export function ClaraWidget() {
  const chat  = useClara();
  const voice = useClaraVoice();

  const [open,  setOpen]  = useState(false);
  const [tab,   setTab]   = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const [pulse, setPulse] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { const t = setTimeout(() => setPulse(false), 5000); return () => clearTimeout(t); }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat.messages]);

  useEffect(() => {
    if (open && tab === "chat") setTimeout(() => inputRef.current?.focus(), 280);
  }, [open, tab]);

  const handleSend = () => {
    if (!input.trim() || chat.isThinking) return;
    chat.send(input.trim()); setInput("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const name = chat.config?.assistantName ?? "ATC Assistant";
  const voiceConnected = voice.status === "connected";
  const voiceConnecting = voice.status === "connecting";

  return (
    <>
      <div role="dialog" aria-modal="true" aria-label={`${name} assistant`}
        style={{
          position: "fixed", zIndex: 2147483646, bottom: 88, right: 24,
          width: 372, maxWidth: "calc(100vw - 32px)",
          height: tab === "voice" ? 800 : 600,
          maxHeight: "calc(100dvh - 110px)",
          display: "flex", flexDirection: "column",
          background: "#ffffff", borderRadius: 20, overflow: "hidden",
          fontFamily: "Inter, system-ui, sans-serif",
          boxShadow: "0 20px 64px rgba(59,109,232,0.18), 0 4px 16px rgba(0,0,0,0.10)",
          border: "1px solid rgba(59,109,232,0.12)",
          transformOrigin: "bottom right",
          transform: open ? "scale(1) translateY(0)" : "scale(0.88) translateY(16px)",
          opacity: open ? 1 : 0, pointerEvents: open ? "all" : "none",
          transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
        }}>

        <div style={{ background: G, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ATCIcon size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.72)", marginTop: 1 }}>
              AmazeTechCLANS ·{" "}
              {voiceConnected && tab === "voice"
                ? <span style={{ color: "#86efac" }}>● Voice live</span>
                : "Online"}
            </p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close"
            style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%", width: 27, height: 27, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.3)")}
            onMouseOut={e  => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}>
            <CloseIcon />
          </button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid rgba(59,109,232,0.1)", background: "#fff", flexShrink: 0 }}>
          {(["chat", "voice"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "9px 0", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
                background: "none",
                color: tab === t ? "hsl(221 83% 53%)" : "#94a3b8",
                borderBottom: tab === t ? "2px solid hsl(221 83% 53%)" : "2px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                transition: "color 0.15s",
              }}>
              {t === "chat" ? <><ChatIcon size={13} /> Chat</> : <><MicIcon size={13} /> Voice</>}
              {t === "voice" && voiceConnected && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>

        {tab === "chat" && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px", display: "flex", flexDirection: "column", gap: 9, background: "#f8f9fc" }}>
              {chat.messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, opacity: 0.45 }}>
                  <ATCIcon size={38} />
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b", textAlign: "center" }}>Ask me anything about<br />AmazeTechCLANS</p>
                </div>
              )}
              {chat.messages.map(msg => (
                <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "84%", padding: "9px 13px",
                    borderRadius: msg.role === "user" ? "16px 16px 3px 16px" : "16px 16px 16px 3px",
                    fontSize: 13.5, lineHeight: 1.55, wordBreak: "break-word",
                    background: msg.role === "user" ? G : "#fff",
                    color: msg.role === "user" ? "#fff" : "#1e293b",
                    boxShadow: msg.role === "user" ? "0 2px 8px rgba(59,109,232,0.22)" : "0 1px 4px rgba(0,0,0,0.07)",
                    border: msg.role === "assistant" ? "1px solid rgba(59,109,232,0.08)" : "none",
                  }}>
                    {msg.role === "assistant" && !msg.content ? (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                        {[0,1,2].map(i => (<span key={i} style={{ display: "block", width: 6, height: 6, borderRadius: "50%", background: "hsl(221 83% 60%)", animation: "atcw-bounce 0.85s infinite", animationDelay: `${i*150}ms` }}/>))}
                      </span>
                    ) : (
                      <MarkdownMessage content={msg.content} isUser={msg.role === "user"} />
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <SourcesBlock sources={msg.sources} />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", borderTop: "1px solid rgba(59,109,232,0.1)", display: "flex", gap: 8, alignItems: "flex-end", background: "#fff", flexShrink: 0 }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
                placeholder="Ask about AmazeTechCLANS…" rows={1} disabled={chat.isThinking}
                style={{ flex: 1, resize: "none", border: "1.5px solid rgba(59,109,232,0.2)", borderRadius: 12, padding: "8px 11px", fontSize: 13.5, fontFamily: "inherit", outline: "none", lineHeight: 1.45, maxHeight: 88, minHeight: 36, background: "#f8f9fc", color: "#1e293b", opacity: chat.isThinking ? 0.5 : 1 }}
                onFocus={e => (e.target.style.borderColor = "hsl(221 83% 53%)")}
                onBlur={e  => (e.target.style.borderColor = "rgba(59,109,232,0.2)")} />
              <button onClick={handleSend} disabled={!input.trim() || chat.isThinking} aria-label="Send"
                style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: !input.trim() || chat.isThinking ? "#cbd5e1" : G, cursor: !input.trim() || chat.isThinking ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SendIcon />
              </button>
            </div>
          </>
        )}

        {tab === "voice" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f8f9fc", overflow: "hidden" }}>

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 52, padding: "0 8px", background: "#0f172a", flexShrink: 0 }}>
              {voice.audioLevels.map((level, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 2, minHeight: 3,
                  height: `${Math.max(3, level * 46)}px`,
                  transition: "height 55ms linear",
                  background: voice.isSpeaking
                    ? `hsl(${213 + i * 0.5} 85% ${50 + level * 28}%)`
                    : voiceConnected
                    ? `hsl(221 83% ${28 + level * 32}%)`
                    : "#1e293b",
                }} />
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "10px 16px 4px", flexShrink: 0 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: voiceConnected ? (voice.isSpeaking ? "hsl(217 91% 60%)" : "#22c55e") : voiceConnecting ? "#f59e0b" : voice.status === "error" ? "#ef4444" : "#475569",
                boxShadow: voiceConnected && voice.isSpeaking ? "0 0 8px hsl(217 91% 60% / 0.7)" : "none",
                animation: voiceConnecting || (voiceConnected && voice.isSpeaking) ? "atcw-pulse 1.4s ease-in-out infinite" : "none",
              }} />
              <span style={{ fontSize: 12.5, color: voice.status === "error" ? "#ef4444" : "#64748b", textAlign: "center" }}>
                {voiceConnecting && "Connecting…"}
                {voiceConnected && !voice.isSpeaking && "Listening — speak now"}
                {voiceConnected && voice.isSpeaking  && "ATC Assistant is speaking"}
                {voice.status === "idle"  && "Tap the button to start voice"}
                {voice.status === "error" && (voice.error ?? "Failed — tap to retry")}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                {voiceConnected && (
                  <span style={{ position: "absolute", inset: -6, borderRadius: "50%", background: voice.isSpeaking ? "hsl(217 91% 60% / 0.2)" : "hsl(221 83% 53% / 0.12)", animation: "atcw-ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />
                )}
                <button
                  onClick={voiceConnected ? voice.disconnect : voice.connect}
                  disabled={voiceConnecting}
                  aria-label={voiceConnected ? "End voice" : "Start voice"}
                  style={{
                    width: 64, height: 64, borderRadius: "50%", border: "none",
                    cursor: voiceConnecting ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", flexShrink: 0, opacity: voiceConnecting ? 0.75 : 1,
                    background: voiceConnected ? (voice.isSpeaking ? "#1d4ed8" : G) : voice.status === "error" ? "#ef4444" : G,
                    boxShadow: voiceConnected ? "0 6px 28px rgba(59,109,232,0.45)" : "0 4px 18px rgba(59,109,232,0.3)",
                    transform: voiceConnected && voice.isSpeaking ? "scale(1.06)" : "scale(1)",
                    transition: "transform 0.2s, background 0.2s",
                  }}>
                  {voiceConnecting ? <SpinIcon /> : voiceConnected ? <StopIcon /> : <MicIcon size={24} />}
                </button>
              </div>
            </div>

            {voiceConnected && voice.isSpeaking && (
              <div style={{ display: "flex", justifyContent: "center", paddingBottom: 6, flexShrink: 0 }}>
                <button onClick={voice.interrupt}
                  style={{ background: "none", border: "1.5px solid rgba(59,109,232,0.3)", borderRadius: 20, padding: "4px 14px", fontSize: 11.5, color: "hsl(221 83% 53%)", cursor: "pointer", fontFamily: "inherit" }}>
                  ✋ Interrupt
                </button>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px 6px" }}>
              {voice.transcript.length === 0 && !voiceConnected && (
                <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, marginTop: 8 }}>Voice transcript appears here</p>
              )}
              {voice.transcript.map(turn => (
                <div key={turn.id} style={{ display: "flex", justifyContent: turn.speaker === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
                  <div style={{
                    maxWidth: "88%", padding: "7px 12px",
                    borderRadius: turn.speaker === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                    fontSize: 12.5, lineHeight: 1.5, wordBreak: "break-word",
                    background: turn.speaker === "user" ? G : "rgba(59,109,232,0.07)",
                    color: turn.speaker === "user" ? "#fff" : "#1e293b",
                    border: turn.speaker === "assistant" ? "1px solid rgba(59,109,232,0.12)" : "none",
                    opacity: turn.status === "speaking" ? 0.85 : 1,
                  }}>
                    {turn.text
                      ? <MarkdownVoice text={turn.text} isUser={turn.speaker === "user"} />
                      : <span style={{ opacity: 0.45, fontStyle: "italic" }}>…</span>}
                    {turn.status === "speaking" && (
                      <span style={{ display: "inline-block", width: 2, height: 12, background: "currentColor", marginLeft: 2, animation: "atcw-cursor 0.8s steps(2) infinite", verticalAlign: "text-bottom" }} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {voiceConnected && (
              <div style={{ padding: "8px 12px calc(8px + env(safe-area-inset-bottom))", borderTop: "1px solid rgba(59,109,232,0.1)", display: "flex", gap: 6, background: "#fff", flexShrink: 0 }}>
                <input
                  placeholder="Or type instead of speaking…"
                  onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { voice.sendText(e.currentTarget.value.trim()); e.currentTarget.value = ""; }}}
                  style={{ flex: 1, border: "1.5px solid rgba(59,109,232,0.2)", borderRadius: 10, padding: "7px 11px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#f8f9fc", color: "#1e293b" }}
                  onFocus={e => (e.target.style.borderColor = "hsl(221 83% 53%)")}
                  onBlur={e  => (e.target.style.borderColor = "rgba(59,109,232,0.2)")} />
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 10, color: "#94a3b8", padding: "4px 0 8px", flexShrink: 0, background: "#fff" }}>
          Powered by{" "}
          <a href="https://amazetechclans.com" target="_blank" rel="noopener noreferrer"
            style={{ color: "hsl(221 83% 53%)", textDecoration: "none", fontWeight: 600 }}>
            AmazeTechCLANS AI
          </a>
        </div>
      </div>

      <div style={{ position: "fixed", zIndex: 2147483647, bottom: 24, right: 24 }}>
        {pulse && !open && (
          <span style={{ position: "absolute", inset: -4, borderRadius: "50%", background: "hsl(221 83% 53%)", opacity: 0, animation: "atcw-ping 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
        )}
        {!open && voiceConnected && (
          <span style={{ position: "absolute", top: 0, right: 0, width: 13, height: 13, borderRadius: "50%", background: "#22c55e", border: "2px solid #fff", zIndex: 1 }} />
        )}
        {!open && (
          <div style={{ position: "absolute", bottom: "110%", right: 0, marginBottom: 6, background: G, color: "#fff", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(59,109,232,0.35)", fontFamily: "Inter, system-ui, sans-serif", animation: "atcw-fade-in 0.4s ease 0.6s both", pointerEvents: "none" }}>
            Chat with us 👋
          </div>
        )}
        <button onClick={() => setOpen(v => !v)}
          aria-label={open ? "Close assistant" : "Open ATC assistant"} aria-expanded={open}
          style={{ width: 56, height: 56, borderRadius: "50%", background: open ? GD : G, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(59,109,232,0.4)", transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s" }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(59,109,232,0.55)"; }}
          onMouseOut={e  => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";   (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(59,109,232,0.4)"; }}>
          <div style={{ transition: "transform 0.22s", transform: open ? "rotate(90deg) scale(0.85)" : "scale(1)" }}>
            {open ? <CloseIcon /> : <ATCIcon size={28} />}
          </div>
        </button>
      </div>

      <style>{`
        @keyframes atcw-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes atcw-ping   { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(2.2);opacity:0} }
        @keyframes atcw-fade-in{ from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes atcw-pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes atcw-cursor { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </>
  );
}
