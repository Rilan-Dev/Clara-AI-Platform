/**
 * ClaraVoiceButton.tsx — ATC branded voice assistant widget
 * Fully interactive: mic → relay → AI audio → transcript → visualizer
 * Connects to the secure server-side relay. Zero AI secrets in browser.
 */
import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { useClaraVoice } from "@/lib/clara/useClaraVoice";

const ATC_GRADIENT = "linear-gradient(135deg, hsl(221 83% 53%), hsl(217 91% 60%))";

// ── Icons ────────────────────────────────────────────────────────────────────

function MicIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function StopIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
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

function SendIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/>
    </svg>
  );
}

export function ClaraVoiceButton() {
  const {
    status, transcript, isSpeaking, audioLevels,
    connect, disconnect, interrupt, sendText, error,
  } = useClaraVoice();

  const [textInput, setTextInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const isIdle       = status === "idle";
  const isConnecting = status === "connecting";
  const isConnected  = status === "connected";
  const isError      = status === "error";

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput.trim());
    setTextInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSendText();
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Audio Visualizer ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        gap: 2, height: 48, padding: "0 4px",
        background: "#0f172a", borderRadius: 12,
        overflow: "hidden",
      }}>
        {audioLevels.map((level, i) => (
          <div key={i} style={{
            flex: 1,
            borderRadius: 2,
            minHeight: 3,
            height: `${Math.max(3, level * 44)}px`,
            transition: "height 60ms linear",
            background: isSpeaking
              ? `hsl(${213 + i * 0.5} 90% ${50 + level * 25}%)`
              : isConnected
              ? `hsl(221 83% ${30 + level * 30}%)`
              : "#1e293b",
          }} />
        ))}
      </div>

      {/* ── Status line ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: isConnected
            ? (isSpeaking ? "hsl(217 91% 60%)" : "#22c55e")
            : isConnecting ? "#f59e0b"
            : isError ? "#ef4444"
            : "#475569",
          boxShadow: isConnected && isSpeaking
            ? "0 0 8px hsl(217 91% 60% / 0.7)" : "none",
          animation: isConnecting || (isConnected && isSpeaking)
            ? "atcv-pulse 1.4s ease-in-out infinite" : "none",
        }} />
        <span style={{ fontSize: 13, color: isError ? "#ef4444" : "#64748b", textAlign: "center" }}>
          {isConnecting && "Connecting to voice…"}
          {isConnected  && !isSpeaking && "Listening — speak now"}
          {isConnected  && isSpeaking  && "ATC Assistant is speaking"}
          {isIdle       && "Tap to start voice session"}
          {isError      && (error ?? "Connection failed — tap to retry")}
        </span>
      </div>

      {/* ── Main mic button ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          {/* Outer pulse ring when connected */}
          {isConnected && (
            <span style={{
              position: "absolute", inset: -6, borderRadius: "50%",
              background: isSpeaking ? "hsl(217 91% 60% / 0.25)" : "hsl(221 83% 53% / 0.15)",
              animation: "atcv-ping 2s cubic-bezier(0,0,0.2,1) infinite",
            }} />
          )}

          <button
            onClick={isConnected ? disconnect : isIdle || isError ? connect : undefined}
            disabled={isConnecting}
            aria-label={isConnected ? "End voice session" : "Start voice session"}
            style={{
              width: 68, height: 68, borderRadius: "50%", border: "none",
              cursor: isConnecting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", flexShrink: 0,
              background: isConnected
                ? (isSpeaking ? "#1d4ed8" : ATC_GRADIENT)
                : isError ? "#ef4444"
                : ATC_GRADIENT,
              boxShadow: isConnected
                ? "0 6px 28px rgba(59,109,232,0.45)"
                : "0 4px 18px rgba(59,109,232,0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              opacity: isConnecting ? 0.7 : 1,
              transform: isConnected && isSpeaking ? "scale(1.06)" : "scale(1)",
            }}
            onMouseOver={e => {
              if (!isConnecting)
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
            }}
            onMouseOut={e => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                isConnected && isSpeaking ? "scale(1.06)" : "scale(1)";
            }}>
            {isConnecting ? <SpinIcon />
              : isConnected ? <StopIcon />
              : <MicIcon />}
          </button>
        </div>
      </div>

      {/* ── Interrupt button — only while AI is speaking ─────────────────── */}
      {isConnected && isSpeaking && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={interrupt}
            style={{
              background: "none", border: "1.5px solid rgba(59,109,232,0.3)",
              borderRadius: 20, padding: "5px 16px", fontSize: 12,
              color: "hsl(221 83% 53%)", cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.15s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(59,109,232,0.08)")}
            onMouseOut={e  => (e.currentTarget.style.background = "none")}>
            ✋ Interrupt
          </button>
        </div>
      )}

      {/* ── Text input fallback while connected ─────────────────────────── */}
      {isConnected && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Or type instead of speaking…"
            style={{
              flex: 1, border: "1.5px solid rgba(59,109,232,0.2)", borderRadius: 10,
              padding: "7px 11px", fontSize: 13, outline: "none",
              fontFamily: "inherit", background: "#f8f9fc", color: "#1e293b",
            }}
            onFocus={e  => (e.target.style.borderColor = "hsl(221 83% 53%)")}
            onBlur={e   => (e.target.style.borderColor = "rgba(59,109,232,0.2)")}
          />
          <button
            onClick={handleSendText}
            disabled={!textInput.trim()}
            style={{
              width: 34, height: 34, borderRadius: "50%", border: "none",
              background: !textInput.trim() ? "#cbd5e1" : ATC_GRADIENT,
              cursor: !textInput.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", flexShrink: 0,
            }}>
            <SendIcon />
          </button>
        </div>
      )}

      {/* ── Live transcript ──────────────────────────────────────────────── */}
      {transcript.length > 0 && (
        <div
          ref={transcriptRef}
          style={{
            maxHeight: 180, overflowY: "auto", display: "flex",
            flexDirection: "column", gap: 6,
            padding: "2px 0",
          }}>
          {transcript.map(turn => (
            <div key={turn.id}
              style={{ display: "flex", justifyContent: turn.speaker === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "88%",
                padding: "7px 12px",
                borderRadius: turn.speaker === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                fontSize: 12.5,
                lineHeight: 1.5,
                wordBreak: "break-word",
                background: turn.speaker === "user"
                  ? ATC_GRADIENT
                  : "rgba(59,109,232,0.07)",
                color: turn.speaker === "user" ? "#fff" : "#1e293b",
                border: turn.speaker === "assistant" ? "1px solid rgba(59,109,232,0.12)" : "none",
                opacity: turn.status === "speaking" ? 0.8 : 1,
              }}>
                {turn.text || <span style={{ opacity: 0.5, fontStyle: "italic" }}>…</span>}
                {turn.status === "speaking" && (
                  <span style={{
                    display: "inline-block", width: 2, height: 13,
                    background: "currentColor", marginLeft: 2,
                    animation: "atcv-cursor 0.8s steps(2) infinite",
                    verticalAlign: "text-bottom",
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Keyframes ────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes atcv-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes atcv-ping {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes atcv-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
