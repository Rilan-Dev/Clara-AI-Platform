/**
 * /embed/widget?key=clr_xxx
 * Standalone embeddable widget page — supports full extended design config.
 */
"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/runtime";

type AssistantConfig = {
  kbId: string;
  kbName: string;
  assistantName: string;
  avatarUrl: string | null;
  welcomeMessage: string;
  primaryColour: string;
  accentColour: string;
  defaultLanguage: string;
  widgetTheme?: string;
  widgetBorderRadius?: number;
  widgetFontFamily?: string;
  widgetShowBranding?: boolean;
  customCss?: string | null;
  customThemeCss?: string | null;
  customPoweredBy?: string | null;
  customHeaderHtml?: string | null;
  customFooterHtml?: string | null;
  // Extended design fields
  headerBg?: string | null;
  headerTextColor?: string;
  headerHeight?: number;
  headerBlur?: boolean;
  showStatusDot?: boolean;
  statusDotColor?: string;
  avatarShape?: "circle" | "rounded" | "square";
  chatAreaBg?: string | null;
  userBubbleBg?: string | null;
  userBubbleText?: string;
  userBubbleRadius?: string;
  userBubblePadding?: string;
  userBubbleShadow?: string;
  botBubbleBg?: string | null;
  botBubbleText?: string | null;
  botBubbleRadius?: string;
  botBubbleBorder?: string | null;
  botBubblePadding?: string;
  botBubbleShadow?: string;
  messageGap?: number;
  messageMaxWidth?: number;
  messageFontSize?: number;
  messageLineHeight?: number;
  showTimestamps?: boolean;
  timestampColor?: string;
  timestampFontSize?: number;
  typingDotColor?: string;
  typingDotSize?: number;
  inputBg?: string | null;
  inputBorder?: string | null;
  inputBorderFocus?: string | null;
  inputRadius?: number;
  inputTextColor?: string | null;
  inputPlaceholderColor?: string | null;
  inputPadding?: string;
  inputAreaBg?: string | null;
  inputAreaBorder?: string | null;
  sendBtnBg?: string | null;
  sendBtnHoverBg?: string | null;
  sendBtnTextColor?: string;
  sendBtnRadius?: number;
  sendBtnSize?: number;
  scrollbarWidth?: number;
  scrollbarColor?: string;
  scrollbarTrackColor?: string;
  footerBg?: string | null;
  footerTextColor?: string | null;
  animationsEnabled?: boolean;
  messageAnimationStyle?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; snippet: string; index: number }>;
};

function WidgetContent() {
  const searchParams = useSearchParams();
  const apiKey       = searchParams.get("key") ?? "";
  const isPreview    = searchParams.get("preview") === "1";

  const [config, setConfig]           = useState<AssistantConfig | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [configLoading, setCL]        = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);


  // Load config from API
  useEffect(() => {
    if (isPreview) { setCL(true); return; }
    if (!apiKey)   { setError("No API key provided"); setCL(false); return; }
    fetch(apiUrl("/api/embed/config"), { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.error) { setError(data.error as string); return; }
        const cfg = data as AssistantConfig;
        setConfig(cfg);
        setMessages([{ id: "welcome", role: "assistant", content: cfg.welcomeMessage }]);
      })
      .catch(() => setError("Failed to load assistant configuration"))
      .finally(() => setCL(false));
  }, [apiKey, isPreview]);

  // Preview mode — wait for postMessage from admin panel
  useEffect(() => {
    if (!isPreview) return;
    function handle(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; payload?: AssistantConfig } | null;
      if (d?.type !== "clara-admin-preview-config" || !d.payload) return;
      setConfig(d.payload);
      setMessages([{ id: "welcome", role: "assistant", content: d.payload.welcomeMessage }]);
      setError(null);
      setCL(false);
    }
    window.addEventListener("message", handle);
    window.parent?.postMessage({ type: "clara-admin-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", handle);
  }, [isPreview]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !config) return;
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: input.trim() };
    const all = [...messages, userMsg];
    setMessages(all);
    setInput("");
    setLoading(true);
    const aid = `a${Date.now()}`;
    setMessages((p) => [...p, { id: aid, role: "assistant", content: "" }]);

    if (isPreview) {
      const ans = `Preview reply to: "${userMsg.content}". All design edits are live.`;
      const chunks = ans.match(/.{1,26}(\s|$)/g) ?? [ans];
      let i = 0;
      const tick = () => {
        if (i >= chunks.length) { setLoading(false); return; }
        setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: m.content + chunks[i] } : m));
        i++; window.setTimeout(tick, 35);
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
      if (!res.ok || !res.body) {
        setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: "Sorry, an error occurred." } : m));
        return;
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
          try {
            const ev = JSON.parse(line) as { type: string; payload: unknown };
            if (ev.type === "token")
              setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: m.content + String(ev.payload) } : m));
            else if (ev.type === "sources")
              setMessages((p) => p.map((m) => m.id === aid ? { ...m, sources: ev.payload as Message["sources"] } : m));
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: "Network error." } : m));
    } finally { setLoading(false); }
  }, [input, loading, config, messages, apiKey, isPreview]);


  // ── Resolve design tokens ───────────────────────────────────────────────────
  const primary     = config?.primaryColour   ?? "#6366f1";
  const accent      = config?.accentColour    ?? "#818cf8";
  const dark        = config?.widgetTheme === "dark";
  const hdrBg       = config?.headerBg        || primary;
  const hdrTxt      = config?.headerTextColor || "#ffffff";
  const hdrH        = config?.headerHeight    ?? 60;
  const chatBg      = config?.chatAreaBg      || (dark ? "#0f0f1a" : "#f8f9fd");
  const userBg      = config?.userBubbleBg    || primary;
  const userTxt     = config?.userBubbleText  || "#ffffff";
  const userR       = config?.userBubbleRadius  || "18px 18px 4px 18px";
  const userP       = config?.userBubblePadding || "10px 14px";
  const userShadow  = config?.userBubbleShadow  || "0 1px 4px rgba(0,0,0,0.15)";
  const botBg       = config?.botBubbleBg     || (dark ? "#2a2a40" : "#f0f0f8");
  const botTxt      = config?.botBubbleText   || (dark ? "#e2e2f0" : "#1f2937");
  const botR        = config?.botBubbleRadius  || "18px 18px 18px 4px";
  const botP        = config?.botBubblePadding || "10px 14px";
  const botBorder   = config?.botBubbleBorder || `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`;
  const botShadow   = config?.botBubbleShadow || "0 1px 3px rgba(0,0,0,0.08)";
  const msgGap      = config?.messageGap      ?? 12;
  const msgMaxW     = config?.messageMaxWidth ?? 85;
  const fontSize    = config?.messageFontSize ?? 13;
  const lineH       = config?.messageLineHeight ?? 1.5;
  const fontFamily  = config?.widgetFontFamily || "system-ui,-apple-system,sans-serif";
  const radius      = config?.widgetBorderRadius ?? 18;
  const inputBg     = config?.inputBg         || (dark ? "#1a1a2e" : "#ffffff");
  const inputBrd    = config?.inputBorder      || `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#e5e7eb"}`;
  const inputR      = config?.inputRadius     ?? 12;
  const inputTxt    = config?.inputTextColor  || (dark ? "#e2e2f0" : "#1f2937");
  const inputPh     = config?.inputPlaceholderColor || (dark ? "#555575" : "#9ca3af");
  const inputPad    = config?.inputPadding    || "8px 12px";
  const inputAreaBg = config?.inputAreaBg     || (dark ? "#0f0f1a" : "#ffffff");
  const inputAreaB  = config?.inputAreaBorder || `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`;
  const sendBg      = config?.sendBtnBg       || primary;
  const sendR       = config?.sendBtnRadius   ?? 10;
  const sendSz      = config?.sendBtnSize     ?? 36;
  const sendTxt     = config?.sendBtnTextColor || "#ffffff";
  const dotColor    = config?.typingDotColor  || "#9ca3af";
  const dotSz       = config?.typingDotSize   ?? 6;
  const scrollW     = config?.scrollbarWidth  ?? 4;
  const scrollC     = config?.scrollbarColor  || "#c7d2fe";
  const scrollT     = config?.scrollbarTrackColor || "transparent";
  const footerTxt   = config?.footerTextColor || (dark ? "#3a3a5a" : "#d1d5db");
  const footerBg2   = config?.footerBg        || "transparent";
  const avatarBr    = config?.avatarShape === "square" ? "4px" : config?.avatarShape === "rounded" ? "8px" : "50%";
  const animStyle   = config?.messageAnimationStyle ?? "fade";
  const themeCss    = config?.customThemeCss  ?? "";
  const customCss   = config?.customCss       ?? "";

  const globalCss = `
    .cw-msgs::-webkit-scrollbar { width: ${scrollW}px; }
    .cw-msgs::-webkit-scrollbar-track { background: ${scrollT}; }
    .cw-msgs::-webkit-scrollbar-thumb { background: ${scrollC}; border-radius: 99px; }
    .cw-msg { animation: ${
      animStyle === "slide" ? "cwSlideIn 0.22s ease" :
      animStyle === "pop"   ? "cwPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1)" :
      animStyle === "none"  ? "none" :
      "cwFadeIn 0.18s ease"
    } both; }
    @keyframes cwFadeIn  { from { opacity:0; transform:translateY(6px) } }
    @keyframes cwSlideIn { from { opacity:0; transform:translateX(20px) } }
    @keyframes cwPopIn   { from { opacity:0; transform:scale(0.88) } }
    @keyframes cwBounce  { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
    .clara-textarea::placeholder { color: ${inputPh}; }
    ${themeCss}
    ${customCss}
  `;

  if (configLoading) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",
        height:"100dvh",fontFamily:"system-ui,sans-serif",color:"#9ca3af",fontSize:"14px" }}>
        {isPreview ? "Waiting for preview config…" : "Loading assistant…"}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",
        height:"100dvh",fontFamily:"system-ui,sans-serif",padding:"24px" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"32px",marginBottom:"8px" }}>⚠️</div>
          <div style={{ color:"#dc2626",fontSize:"13px" }}>{error}</div>
        </div>
      </div>
    );
  }

  const avatarLetter = config?.assistantName?.charAt(0)?.toUpperCase() ?? "A";

  return (
    <div className="clara-widget" style={{
      display:"flex",flexDirection:"column",height:"100dvh",minHeight:"100vh",
      fontFamily,background:chatBg,color:dark?"#e2e2f0":"#1f2937",
      borderRadius:radius,overflow:"hidden",
    }}>
      <style>{globalCss}</style>

      {/* Header */}
      <div className="clara-header" style={{
        display:"flex",alignItems:"center",gap:"12px",padding:`0 16px`,
        height:hdrH,background:hdrBg,color:hdrTxt,flexShrink:0,
        backdropFilter:config?.headerBlur?"blur(12px)":undefined,
      }}>
        {config?.avatarUrl
          ? <img src={config.avatarUrl} alt="" className="clara-avatar"
              style={{ width:32,height:32,borderRadius:avatarBr,objectFit:"cover",flexShrink:0 }} />
          : <div className="clara-avatar" style={{
              width:32,height:32,borderRadius:avatarBr,background:accent,color:primary,
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
              <span className="clara-header-status" style={{
                width:7,height:7,borderRadius:"50%",background:config?.statusDotColor??"#4ade80",
                display:"inline-block",flexShrink:0 }} />
              <span style={{ fontSize:11,opacity:0.75 }}>Online</span>
            </div>
          )}
        </div>
        {config?.customHeaderHtml && (
          <div dangerouslySetInnerHTML={{ __html: config.customHeaderHtml }}
            style={{ display:"flex",alignItems:"center" }} />
        )}
      </div>

      {/* Messages */}
      <div className="cw-msgs clara-messages" style={{
        flex:1,overflowY:"auto",padding:"16px",
        display:"flex",flexDirection:"column",gap:msgGap,background:chatBg,
      }}>
        {messages.map((msg) => (
          <div key={msg.id} className="cw-msg" style={{
            display:"flex",
            justifyContent:msg.role==="user"?"flex-end":"flex-start",
          }}>
            <div className={msg.role==="user"?"clara-msg-user":"clara-msg-bot"}
              style={{
                maxWidth:`${msgMaxW}%`,
                borderRadius:msg.role==="user"?userR:botR,
                padding:msg.role==="user"?userP:botP,
                fontSize,lineHeight:lineH,
                background:msg.role==="user"?userBg:botBg,
                color:msg.role==="user"?userTxt:botTxt,
                border:msg.role==="user"?"none":botBorder,
                boxShadow:msg.role==="user"?userShadow:botShadow,
                wordBreak:"break-word",
              }}>
              {msg.content||<span style={{display:"flex",gap:4,alignItems:"center"}}>
                {[0,150,300].map((d)=>(
                  <span key={d} className="clara-typing-dot" style={{
                    width:dotSz,height:dotSz,borderRadius:"50%",background:dotColor,
                    display:"inline-block",animation:`cwBounce 1.2s ${d}ms infinite`,
                  }}/>
                ))}</span>}
              {msg.sources&&msg.sources.length>0&&(
                <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.1)"}}>
                  {msg.sources.slice(0,3).map((s)=>(
                    <div key={s.index} className="clara-sources" style={{fontSize:11,
                      color:msg.role==="user"?"rgba(255,255,255,0.7)":"#6b7280",marginBottom:2}}>
                      <strong style={{color:msg.role==="user"?"#fff":primary}}>[S{s.index}]</strong>{" "}{s.title}
                    </div>
                  ))}
                </div>
              )}
              {config?.showTimestamps&&(
                <div className="clara-timestamp" style={{
                  fontSize:config?.timestampFontSize??10,
                  color:config?.timestampColor??"#9ca3af",opacity:0.65,marginTop:4,
                }}>now</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="clara-input-area" style={{
        borderTop:`${inputAreaB}`,padding:"12px",
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
              opacity:loading?0.5:1,background:inputBg,color:inputTxt,
            }}/>
          <button onClick={()=>void sendMessage()}
            disabled={!input.trim()||loading}
            className="clara-send-btn"
            style={{
              flexShrink:0,width:sendSz,height:sendSz,borderRadius:sendR,
              background:(!input.trim()||loading)?(dark?"#2a2a40":"#e5e7eb"):sendBg,
              color:(!input.trim()||loading)?(dark?"#555":"#aaa"):sendTxt,
              border:"none",
              cursor:(!input.trim()||loading)?"not-allowed":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"background 0.2s",
            }}>
            <svg className="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        {config?.widgetShowBranding!==false&&(
          <div className="clara-branding" style={{textAlign:"center",marginTop:8,
            background:footerBg2}}>
            {config?.customFooterHtml
              ? <span dangerouslySetInnerHTML={{__html:config.customFooterHtml}}/>
              : <span style={{fontSize:10,color:footerTxt}}>
                  {config?.customPoweredBy??"Powered by Clara AI"}
                </span>
            }
          </div>
        )}
      </div>
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
