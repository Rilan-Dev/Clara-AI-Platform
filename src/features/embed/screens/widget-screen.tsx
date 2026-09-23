/**
 * /embed/widget?key=clr_xxx
 * Standalone embeddable widget page — full voice + chat support.
 */
"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/runtime";
import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";
import { sanitizeWidgetHtml } from "@/features/embed/lib/sanitize-html";
// Note: apiUrl is used for internal admin API calls.
// Voice runtime uses window.location.origin directly (works for embedded deploy).

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AssistantConfig = {
  kbId: string; kbName: string; assistantName: string; avatarUrl: string | null;
  welcomeMessage: string; primaryColour: string; accentColour: string;
  defaultLanguage: string; widgetTheme?: string; widgetBorderRadius?: number;
  widgetFontFamily?: string; widgetShowBranding?: boolean;
  customCss?: string | null; customThemeCss?: string | null;
  customPoweredBy?: string | null; customHeaderHtml?: string | null;
  customFooterHtml?: string | null;
  headerBg?: string | null; headerTextColor?: string; headerHeight?: number;
  headerBlur?: boolean; showStatusDot?: boolean; statusDotColor?: string;
  avatarShape?: "circle" | "rounded" | "square"; chatAreaBg?: string | null;
  userBubbleBg?: string | null; userBubbleText?: string;
  userBubbleRadius?: string; userBubblePadding?: string; userBubbleShadow?: string;
  botBubbleBg?: string | null; botBubbleText?: string | null;
  botBubbleRadius?: string; botBubbleBorder?: string | null;
  botBubblePadding?: string; botBubbleShadow?: string;
  messageGap?: number; messageMaxWidth?: number; messageFontSize?: number;
  messageLineHeight?: number; showTimestamps?: boolean;
  timestampColor?: string; timestampFontSize?: number;
  typingDotColor?: string; typingDotSize?: number;
  inputBg?: string | null; inputBorder?: string | null;
  inputBorderFocus?: string | null; inputRadius?: number;
  inputTextColor?: string | null; inputPlaceholderColor?: string | null;
  inputPadding?: string; inputAreaBg?: string | null; inputAreaBorder?: string | null;
  sendBtnBg?: string | null; sendBtnHoverBg?: string | null;
  sendBtnTextColor?: string; sendBtnRadius?: number; sendBtnSize?: number;
  scrollbarWidth?: number; scrollbarColor?: string; scrollbarTrackColor?: string;
  footerBg?: string | null; footerTextColor?: string | null;
  animationsEnabled?: boolean; messageAnimationStyle?: string;
  // Voice
  voiceEnabled?: boolean; voiceProvider?: string;
  voiceBtnBg?: string | null; voiceBtnSize?: number; voiceBtnRadius?: number;
  voiceBtnActiveColor?: string | null; voicePanelBg?: string | null;
  voiceWaveColor?: string | null;
};

type Message = {
  id: string; role: "user" | "assistant"; content: string;
  sources?: Array<{ title: string; snippet: string; index: number }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Voice runtime — provider-routed through useVoiceClient
//
// The SAME resolution chain as every other Clara voice surface (kb → agent →
// org voice provider → brain inherit): an ElevenLabs-configured org runs the
// Mode A STT/chat/TTS pipeline here (with the org's synced voice + models),
// an OpenAI/Gemini org runs its realtime socket. The previous implementation
// was hard-wired to OpenAI WebRTC via /api/embed/voice-connect and silently
// ignored the platform admin's provider choice on embedded sites.
// ─────────────────────────────────────────────────────────────────────────────

type VoiceState = "idle" | "connecting" | "connected" | "listening" | "speaking" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Main widget component
// ─────────────────────────────────────────────────────────────────────────────

function WidgetContent() {
  const searchParams = useSearchParams();
  const apiKey    = searchParams.get("key") ?? "";
  const isPreview = searchParams.get("preview") === "1";

  const [config, setConfig]  = useState<AssistantConfig | null>(null);
  const [error,  setError]   = useState<string | null>(null);
  const [messages, setMsgs]  = useState<Message[]>([]);
  const [input,  setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [configLoading, setCL] = useState(true);
  const [avatarImgErr, setAvatarImgErr] = useState(false);
  const [sendHovered, setSendHov]       = useState(false);
  const [autoplayBlocked, setAutoplay]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Voice runtime (provider-routed) ──────────────────────────────────────
  const voiceSession = useVoiceClient({
    kbId: config?.kbId ?? null,
    // Presence of embedApiKey selects the public embed transports
    // (/api/embed/session + /api/embed/chat + clr_-key Mode A endpoints).
    embedApiKey: apiKey,
    voiceGreeting: config?.welcomeMessage,
  });

  const voiceState: VoiceState =
    voiceSession.status === "error" ? "error" :
    voiceSession.status === "connecting" ? "connecting" :
    voiceSession.status === "connected" ? (voiceSession.isSpeaking ? "speaking" : "listening") :
    "idle";
  const voiceError = voiceSession.error;

  // Voice transcript → chat bubbles. Each voice turn renders as a user
  // bubble plus a streaming assistant bubble (the same history model every
  // voice hook maintains). Replaces the old onUserTranscript /
  // onAssistantDelta callbacks.
  const voiceTurnMapRef = useRef(new Map<string, { userIdx: number; assistantIdx: number }>());

  const startVoice = useCallback(() => {
    voiceTurnMapRef.current.clear();
    setAutoplay(false);
    void voiceSession.connect();
  }, [voiceSession]);
  const stopVoice = useCallback(() => {
    voiceSession.disconnect();
  }, [voiceSession]);

  // Remote audio for the realtime sockets (OpenAI/Gemini surface a
  // MediaStream; the ElevenLabs pipeline plays through its own AudioContext,
  // which is created inside the click gesture so autoplay is granted).
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = voiceAudioRef.current;
    const stream = voiceSession.remoteAudioStream;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => { setAutoplay(true); });
    } else if (!stream && el.srcObject) {
      el.srcObject = null;
    }
  }, [voiceSession.remoteAudioStream]);

  useEffect(() => {
    if (voiceSession.history.length === 0) return;
    setMsgs((prev) => {
      let next = prev;
      for (const turn of voiceSession.history) {
        let mapping = voiceTurnMapRef.current.get(turn.id);
        if (!mapping) {
          mapping = { userIdx: -1, assistantIdx: -1 };
          voiceTurnMapRef.current.set(turn.id, mapping);
        }
        if (turn.question && mapping.userIdx === -1) {
          mapping.userIdx = next.length;
          next = [...next, { id: `${turn.id}-u`, role: "user", content: turn.question }];
        }
        if (mapping.assistantIdx === -1) {
          mapping.assistantIdx = next.length;
          next = [...next, { id: `${turn.id}-a`, role: "assistant", content: "" }];
        }
        const idx = mapping.assistantIdx;
        const existing = next[idx];
        if (existing && existing.role === "assistant" && existing.content !== turn.answer) {
          next = next.map((m, i) => (i === idx ? { ...m, content: turn.answer } : m));
        }
      }
      return next;
    });
  }, [voiceSession.history]);


  // ── Config loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPreview) { setCL(true); return; }
    if (!apiKey)   { setError("No API key provided"); setCL(false); return; }
    fetch(apiUrl("/api/embed/config"), { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.error) { setError(data.error as string); return; }
        setConfig(data as AssistantConfig);
        setMsgs([{ id: "welcome", role: "assistant", content: data.welcomeMessage as string }]);
      })
      .catch(() => setError("Failed to load assistant configuration"))
      .finally(() => setCL(false));
  }, [apiKey, isPreview]);

  // Preview mode — postMessage from admin panel
  useEffect(() => {
    if (!isPreview) return;
    const handle = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; payload?: AssistantConfig } | null;
      if (d?.type !== "clara-admin-preview-config" || !d.payload) return;
      setConfig(d.payload);
      setAvatarImgErr(false);
      setMsgs([{ id: "welcome", role: "assistant", content: d.payload.welcomeMessage }]);
      setError(null); setCL(false);
    };
    window.addEventListener("message", handle);
    window.parent?.postMessage({ type: "clara-admin-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", handle);
  }, [isPreview]);

  useEffect(() => {
    const scroller = bottomRef.current?.parentElement;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ── Chat send ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !config) return;
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: input.trim() };
    const all = [...messages, userMsg];
    setMsgs(all); setInput(""); setLoading(true);
    const aid = `a${Date.now()}`;
    setMsgs((p) => [...p, { id: aid, role: "assistant", content: "" }]);

    if (isPreview) {
      const ans = `Preview reply to: "${userMsg.content}". All design edits are live.`;
      const chunks = ans.match(/.{1,26}(\s|$)/g) ?? [ans];
      let i = 0;
      const tick = () => {
        if (i >= chunks.length) { setLoading(false); return; }
        const token = chunks[i]; i++;
        setMsgs((p) => p.map((m) => m.id === aid ? { ...m, content: m.content + token } : m));
        window.setTimeout(tick, 35);
      };
      tick(); return;
    }

    try {
      const res = await fetch(apiUrl("/api/embed/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ messages: all.filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok || !res.body) { setMsgs((p) => p.map((m) => m.id === aid ? { ...m, content: "Sorry, an error occurred." } : m)); return; }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
          try {
            const ev = JSON.parse(line) as { type: string; payload: unknown };
            if (ev.type === "token") setMsgs((p) => p.map((m) => m.id === aid ? { ...m, content: m.content + String(ev.payload) } : m));
            else if (ev.type === "sources") setMsgs((p) => p.map((m) => m.id === aid ? { ...m, sources: ev.payload as Message["sources"] } : m));
          } catch {}
        }
      }
    } catch { setMsgs((p) => p.map((m) => m.id === aid ? { ...m, content: "Network error." } : m)); }
    finally  { setLoading(false); }
  }, [input, loading, config, messages, apiKey, isPreview]);

  // ── Design token resolution ───────────────────────────────────────────────
  const t = (v: string | null | undefined, fb: string) =>
    (v && v.trim()) ? v.trim() : fb;
  const primary    = t(config?.primaryColour,  "#6366f1");
  const accent     = t(config?.accentColour,   "#818cf8");
  const dark       = config?.widgetTheme === "dark";
  const hdrBg      = t(config?.headerBg,       primary);
  const hdrTxt     = t(config?.headerTextColor,"#ffffff");
  const hdrH       = config?.headerHeight      ?? 60;
  const chatBg     = t(config?.chatAreaBg,     dark ? "#0f0f1a" : "#f8f9fd");
  const userBg     = t(config?.userBubbleBg,   primary);
  const userTxt    = t(config?.userBubbleText,  "#ffffff");
  const userR      = config?.userBubbleRadius  || "18px 18px 4px 18px";
  const userP      = config?.userBubblePadding || "10px 14px";
  const userSh     = config?.userBubbleShadow  || "0 1px 4px rgba(0,0,0,0.15)";
  const botBg      = t(config?.botBubbleBg,    dark ? "#2a2a40" : "#f0f0f8");
  const botTxt     = t(config?.botBubbleText,  dark ? "#e2e2f0" : "#1f2937");
  const botR       = config?.botBubbleRadius   || "18px 18px 18px 4px";
  const botP       = config?.botBubblePadding  || "10px 14px";
  const botBdr     = t(config?.botBubbleBorder,`1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`);
  const botSh      = config?.botBubbleShadow   || "0 1px 3px rgba(0,0,0,0.08)";
  const msgGap     = config?.messageGap        ?? 12;
  const msgMaxW    = config?.messageMaxWidth    ?? 85;
  const fontSize   = config?.messageFontSize   ?? 13;
  const lineH      = config?.messageLineHeight ?? 1.5;
  const fontFamily = t(config?.widgetFontFamily,"system-ui,-apple-system,sans-serif");
  const radius     = config?.widgetBorderRadius ?? 18;
  const inputBg2   = t(config?.inputBg,         dark ? "#1a1a2e" : "#ffffff");
  const inputBrd   = t(config?.inputBorder,     `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#e5e7eb"}`);
  const inputR     = config?.inputRadius       ?? 12;
  const inputTxt   = t(config?.inputTextColor,  dark ? "#e2e2f0" : "#1f2937");
  const inputPh    = t(config?.inputPlaceholderColor, dark ? "#555575" : "#9ca3af");
  const inputPad   = config?.inputPadding      || "8px 12px";
  const inputAreaBg= t(config?.inputAreaBg,     dark ? "#0f0f1a" : "#ffffff");
  const inputAreaB = t(config?.inputAreaBorder, `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`);
  const sendBg     = t(config?.sendBtnBg,       primary);
  const sendR2     = config?.sendBtnRadius     ?? 10;
  const sendSz     = config?.sendBtnSize       ?? 36;
  const sendTxt    = t(config?.sendBtnTextColor,"#ffffff");
  const dotColor   = t(config?.typingDotColor,  "#9ca3af");
  const dotSz      = config?.typingDotSize     ?? 6;
  const scrollW    = config?.scrollbarWidth    ?? 4;
  const scrollC    = t(config?.scrollbarColor,  "#c7d2fe");
  const scrollT    = t(config?.scrollbarTrackColor,"transparent");
  const footTxt    = t(config?.footerTextColor, dark ? "#4a4a6a" : "#d1d5db");
  const footBg     = t(config?.footerBg,        "transparent");
  const avatarBr   = config?.avatarShape === "square" ? "4px" : config?.avatarShape === "rounded" ? "8px" : "50%";
  const animStyle  = config?.messageAnimationStyle ?? "fade";
  const themeCss   = config?.customThemeCss   ?? "";
  const customCss  = config?.customCss        ?? "";
  // Always show voice button on deployed widget (the session bootstrap
  // resolves access server-side). Disable only in preview mode.
  const showVoice  = !isPreview;
  const vBtnBg     = t(config?.voiceBtnBg,     dark ? "#2a2a40" : "#e5e7eb");
  const vBtnSz     = config?.voiceBtnSize      ?? 36;
  const vBtnR      = config?.voiceBtnRadius    ?? 10;
  const vBtnActive = t(config?.voiceBtnActiveColor, "#ef4444");
  const isVoiceActive = voiceState !== "idle" && voiceState !== "error";

  const globalCss = `
    .cw-msgs::-webkit-scrollbar { width: ${scrollW}px; }
    .cw-msgs::-webkit-scrollbar-track { background: ${scrollT}; }
    .cw-msgs::-webkit-scrollbar-thumb { background: ${scrollC}; border-radius: 99px; }
    .cw-msg { animation: ${
      animStyle === "slide" ? "cwSlideIn 0.22s ease" :
      animStyle === "pop"   ? "cwPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1)" :
      animStyle === "none"  ? "none" : "cwFadeIn 0.18s ease"
    } both; }
    @keyframes cwFadeIn  { from { opacity:0; transform:translateY(6px) } }
    @keyframes cwSlideIn { from { opacity:0; transform:translateX(20px) } }
    @keyframes cwPopIn   { from { opacity:0; transform:scale(0.88) } }
    @keyframes cwBounce  { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
    @keyframes voicePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
    textarea.clara-textarea::placeholder,
    .clara-textarea::placeholder { color: ${inputPh} !important; }
    ${themeCss}
    ${customCss}
  `;

  if (configLoading) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",
      height:"100dvh",fontFamily:"system-ui,sans-serif",color:"#9ca3af",fontSize:"14px" }}>
      {isPreview ? "Waiting for preview config…" : "Loading assistant…"}
    </div>
  );
  if (error) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",
      height:"100dvh",fontFamily:"system-ui,sans-serif",padding:"24px" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:"32px",marginBottom:"8px" }}>⚠️</div>
        <div style={{ color:"#dc2626",fontSize:"13px" }}>{error}</div>
      </div>
    </div>
  );

  const avatarLetter = config?.assistantName?.charAt(0)?.toUpperCase() ?? "A";
  // "connected" never renders as a label by itself: once the session is up it
  // is either listening (mic open) or speaking (assistant audio playing).
  // A paused mic replaces both — the visitor explicitly held the microphone.
  const vsLabel = voiceSession.micMuted ? "Mic paused" :
    voiceState === "connecting" ? "Connecting…" :
    voiceState === "listening" ? "Listening…" :
    voiceState === "speaking"  ? "Speaking…"  : "";

  return (
    <div className="clara-widget" style={{
      display:"flex",flexDirection:"column",height:"100dvh",minHeight:"100vh",
      fontFamily,background:chatBg,color:dark?"#e2e2f0":"#1f2937",
      borderRadius:radius,overflow:"hidden",
    }}>
      <style>{globalCss}</style>

      {/* Hidden audio sink for realtime voice sessions (OpenAI/Gemini
          MediaStreams). The ElevenLabs pipeline plays through its own
          AudioContext instead. */}
      <audio ref={(el) => { voiceAudioRef.current = el; }} autoPlay playsInline style={{ display: "none" }} />

      {/* ── Header ── */}
      <div className="clara-header" style={{
        display:"flex",alignItems:"center",gap:"12px",padding:"0 16px",
        height:hdrH, background:hdrBg, color:hdrTxt, flexShrink:0,
        backdropFilter:config?.headerBlur ? "blur(12px)" : undefined,
        WebkitBackdropFilter:config?.headerBlur ? "blur(12px)" : undefined,
      }}>
        {config?.avatarUrl && !avatarImgErr
          ? <img key={config.avatarUrl} src={config.avatarUrl} alt="" className="clara-avatar"
              onError={() => setAvatarImgErr(true)}
              style={{ width:32,height:32,borderRadius:avatarBr,objectFit:"cover",flexShrink:0 }} />
          : <div className="clara-avatar" style={{
              width:32,height:32,borderRadius:avatarBr,background:accent,color:hdrTxt,
              display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,
              fontSize:14,flexShrink:0 }}>
              {avatarLetter}
            </div>
        }
        <div style={{ flex:1,minWidth:0 }}>
          <div className="clara-header-name" style={{ fontWeight:600,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
            {config?.assistantName}
          </div>
          {config?.showStatusDot !== false && (
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ width:7,height:7,borderRadius:"50%",
                background: isVoiceActive ? (vBtnActive||"#ef4444") : (config?.statusDotColor??"#4ade80"),
                display:"inline-block",flexShrink:0,
                animation: isVoiceActive ? "voicePulse 1s infinite" : "none" }} />
              <span style={{ fontSize:11,opacity:0.75 }}>
                {isVoiceActive ? vsLabel : "Online"}
              </span>
            </div>
          )}
        </div>
        {config?.customHeaderHtml && !config.customHeaderHtml.includes("<!DOCTYPE") && config.customHeaderHtml.length < 2000 && (
          <div dangerouslySetInnerHTML={{ __html: sanitizeWidgetHtml(config.customHeaderHtml) }} style={{ display:"flex",alignItems:"center" }} />
        )}
      </div>

      {/* ── Voice error banner ── */}
      {voiceError && (
        <div style={{ padding:"8px 16px",background:"#fef2f2",borderBottom:"1px solid #fecaca",
          fontSize:11,color:"#dc2626",flexShrink:0 }}>
          {voiceError}
        </div>
      )}

      {/* ── Autoplay blocked banner (tap to enable AI audio output) ── */}
      {autoplayBlocked && (
        <button
          onClick={() => {
            // Try to resume any audio element on the page (the dynamic one we created)
            document.querySelectorAll("audio").forEach((el) => {
              void el.play().catch(() => {});
            });
            setAutoplay(false);
          }}
          style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            padding:"10px 16px",background:"#fffbeb",borderBottom:"1px solid #fde68a",
            fontSize:12,color:"#92400e",cursor:"pointer",border:"none",width:"100%",
            fontWeight:600,flexShrink:0,
          }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905H6.44l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06z"/>
          </svg>
          Tap to enable AI audio
        </button>
      )}

      {/* ── Messages ── */}
      <div className="cw-msgs clara-messages" style={{
        flex:1,overflowY:"auto",padding:"16px",
        display:"flex",flexDirection:"column",gap:msgGap,background:chatBg,
      }}>
        {messages.map((msg) => (
          <div key={msg.id} className="cw-msg" style={{
            display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",
          }}>
            <div className={msg.role==="user"?"clara-msg-user":"clara-msg-bot"}
              style={{
                maxWidth:`${msgMaxW}%`,
                borderRadius:msg.role==="user"?userR:botR,
                padding:msg.role==="user"?userP:botP,
                fontSize,lineHeight:lineH,
                background:msg.role==="user"?userBg:botBg,
                color:msg.role==="user"?userTxt:botTxt,
                border:msg.role==="user"?"none":botBdr,
                boxShadow:msg.role==="user"?userSh:botSh,
                wordBreak:"break-word",
              }}>
              {msg.content||<span style={{display:"flex",gap:4,alignItems:"center"}}>
                {[0,150,300].map((d)=>(
                  <span key={d} className="clara-typing-dot" style={{
                    width:dotSz,height:dotSz,borderRadius:"50%",background:dotColor,
                    display:"inline-block",animation:`cwBounce 1.2s ${d}ms infinite`,
                  }}/>
                ))}</span>}
              {msg.sources?.length && (
                <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.1)"}}>
                  {msg.sources.slice(0,3).map((s)=>(
                    <div key={s.index} className="clara-sources" style={{fontSize:11,
                      color:msg.role==="user"?"rgba(255,255,255,0.7)":"#6b7280",marginBottom:2}}>
                      <strong style={{color:msg.role==="user"?"#fff":primary}}>[S{s.index}]</strong>{" "}{s.title}
                    </div>
                  ))}
                </div>
              )}
              {config?.showTimestamps && (
                <div className="clara-timestamp" style={{
                  fontSize:config?.timestampFontSize??10,color:config?.timestampColor??"#9ca3af",opacity:0.65,marginTop:4,
                }}>now</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* ── Input area ── */}
      <div className="clara-input-area" style={{
        borderTop:inputAreaB,padding:"12px",
        paddingBottom:"calc(12px + env(safe-area-inset-bottom))",
        background:inputAreaBg,flexShrink:0,
      }}>
        <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
          <textarea value={input} rows={1}
            onChange={(e)=>setInput(e.target.value)}
            onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendMessage();}}}
            placeholder={`Ask ${config?.assistantName??"the assistant"}…`}
            disabled={loading}
            className="clara-textarea"
            style={{
              flex:1,resize:"none",borderRadius:inputR,border:inputBrd,
              padding:inputPad,fontSize:13,fontFamily:"inherit",
              outline:"none",lineHeight:1.5,maxHeight:100,overflowY:"auto",
              opacity:loading?0.5:1,background:inputBg2,color:inputTxt,
            }}/>

          {/* Voice button — only when voiceEnabled === true on live deploy */}
          {showVoice && (
            <button
              onClick={() => isVoiceActive ? stopVoice() : startVoice()}
              title={isVoiceActive ? (voiceSession.micMuted ? `Voice: ${voiceState} · mic paused` : `Voice: ${voiceState} — click to stop`) : "Start voice"}
              className="clara-voice-btn"
              style={{
                flexShrink:0,width:vBtnSz,height:vBtnSz,borderRadius:vBtnR,
                background: voiceState === "speaking"  ? "#10b981" :
                            voiceState === "connecting" ? accent :
                            isVoiceActive ? primary : vBtnBg,
                color: isVoiceActive ? "#fff" : (dark?"#9ca3af":"#6b7280"),
                border:"none",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                transition:"background 0.18s, transform 0.12s",
                transform: isVoiceActive ? "scale(1.08)" : "scale(1)",
                animation: voiceState === "connecting" || voiceState === "speaking"
                  ? "voicePulse 1.2s ease-in-out infinite" : "none",
              }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isVoiceActive
                  ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>
                  : <>
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </>
                }
              </svg>
            </button>
          )}

          {/* Mic pause/resume — only while a voice session is active.
              Muting keeps the session connected; the mic sends digital
              silence until the visitor resumes it. */}
          {showVoice && isVoiceActive && (
            <button
              onClick={() => voiceSession.setMicMuted(!voiceSession.micMuted)}
              title={voiceSession.micMuted
                ? "Resume microphone — Clara hears you again"
                : "Pause microphone — the session stays live but Clara stops hearing you"}
              aria-label={voiceSession.micMuted ? "Resume microphone" : "Pause microphone"}
              aria-pressed={voiceSession.micMuted}
              className="clara-mic-mute-btn"
              style={{
                flexShrink:0,width:vBtnSz,height:vBtnSz,borderRadius:vBtnR,
                background: voiceSession.micMuted ? "#f59e0b" : (dark?"#2a2a40":"#e5e7eb"),
                color: voiceSession.micMuted ? "#fff" : (dark?"#9ca3af":"#6b7280"),
                border: voiceSession.micMuted ? "1px solid #f59e0b66" : "none",
                cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                transition:"background 0.18s, transform 0.12s",
                transform: voiceSession.micMuted ? "scale(1.05)" : "scale(1)",
              }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {voiceSession.micMuted ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                    <path d="M15 9.34V5a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2"/>
                    <path d="M12 19v4"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </>
                ) : (
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </>
                )}
              </svg>
            </button>
          )}

          {/* Send button */}
          <button onClick={()=>void sendMessage()}
            disabled={!input.trim()||loading}
            onMouseEnter={()=>setSendHov(true)}
            onMouseLeave={()=>setSendHov(false)}
            className="clara-send-btn"
            style={{
              flexShrink:0,width:sendSz,height:sendSz,borderRadius:sendR2,
              background:(!input.trim()||loading)
                ?(dark?"#2a2a40":"#e5e7eb")
                :sendHovered?t(config?.sendBtnHoverBg,sendBg):sendBg,
              color:(!input.trim()||loading)?(dark?"#555":"#aaa"):sendTxt,
              border:"none",cursor:(!input.trim()||loading)?"not-allowed":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"background 0.18s, transform 0.1s",
              transform:sendHovered&&input.trim()&&!loading?"scale(1.06)":"scale(1)",
            }}>
            <svg className="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>

        {Boolean(config?.widgetShowBranding) && (
          <div className="clara-branding" style={{textAlign:"center",marginTop:8,background:footBg}}>
            {config?.customFooterHtml
              ? <span dangerouslySetInnerHTML={{__html:sanitizeWidgetHtml(config.customFooterHtml)}}/>
              : <span style={{fontSize:10,color:footTxt}}>
                  {(config?.customPoweredBy && config.customPoweredBy.trim())
                    ? config.customPoweredBy.trim() : "Powered by Clara AI"}
                </span>
            }
          </div>
        )}
      </div>

      {/* Hidden audio element for remote WebRTC voice stream */}
      <audio ref={voiceAudioRef} className="hidden" style={{display:"none"}} />
    </div>
  );
}

export default function EmbedWidgetPage() {
  return (
    <Suspense fallback={
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",
        height:"100dvh",fontFamily:"system-ui,sans-serif",color:"#9ca3af",fontSize:"14px"}}>
        Loading…
      </div>
    }>
      <WidgetContent/>
    </Suspense>
  );
}
