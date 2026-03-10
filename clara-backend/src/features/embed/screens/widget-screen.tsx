/**
 * /embed/widget?key=clr_xxx
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone embeddable widget page.
 * Organizations iframe this URL on their site:
 *   <iframe src="https://your-clara-instance.com/embed/widget?key=clr_xxx" />
 *
 * Or use the auto-loading script snippet for a floating button version.
 */
"use client";

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
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; snippet: string; index: number }>;
};

function WidgetContent() {
  const searchParams   = useSearchParams();
  const apiKey         = searchParams.get("key") ?? "";

  const [config, setConfig]             = useState<AssistantConfig | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load assistant config
  useEffect(() => {
    if (!apiKey) {
      setError("No API key provided");
      setConfigLoading(false);
      return;
    }
    fetch(apiUrl("/api/embed/config"), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.error) { setError(data.error as string); return; }
        const cfg = data as AssistantConfig;
        setConfig(cfg);
        setMessages([{ id: "welcome", role: "assistant", content: cfg.welcomeMessage }]);
      })
      .catch(() => setError("Failed to load assistant configuration"))
      .finally(() => setConfigLoading(false));
  }, [apiKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !config) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInput("");
    setLoading(true);

    const assistantId = `a_${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch(apiUrl("/api/embed/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          messages: allMessages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry, I encountered an error. Please try again." }
              : m
          )
        );
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as { type: string; payload: unknown };
            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + String(event.payload) }
                    : m
                )
              );
            } else if (event.type === "sources") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, sources: event.payload as Message["sources"] }
                    : m
                )
              );
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Network error. Please try again." } : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, config, messages, apiKey]);

  const primary = config?.primaryColour ?? "#6366f1";
  const accent  = config?.accentColour  ?? "#a5b4fc";

  if (configLoading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"system-ui,sans-serif", color:"#9ca3af", fontSize:"14px" }}>
        Loading assistant…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"system-ui,sans-serif", padding:"24px" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"32px", marginBottom:"8px" }}>⚠️</div>
          <div style={{ color:"#dc2626", fontSize:"13px" }}>{error}</div>
        </div>
      </div>
    );
  }

  const avatarLetter = config?.assistantName?.charAt(0)?.toUpperCase() ?? "A";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"system-ui,-apple-system,sans-serif", background:"#fff" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"12px 16px", background:primary, color:"#fff" }}>
        {config?.avatarUrl ? (
          <img src={config.avatarUrl} alt="" style={{ width:"32px", height:"32px", borderRadius:"50%", objectFit:"cover" }} />
        ) : (
          <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:accent, color:primary, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"14px" }}>
            {avatarLetter}
          </div>
        )}
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:"600", fontSize:"14px" }}>{config?.assistantName}</div>
          <div style={{ fontSize:"11px", opacity:0.75 }}>{config?.kbName}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
          <span style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#4ade80" }} />
          <span style={{ fontSize:"11px", opacity:0.75 }}>Online</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ display:"flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth:"85%",
              borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              padding:"10px 14px",
              fontSize:"13px",
              lineHeight:"1.5",
              background: msg.role === "user" ? primary : "#f3f4f6",
              color: msg.role === "user" ? "#fff" : "#1f2937",
            }}>
              {msg.content || (
                <span style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                  {[0,150,300].map((delay) => (
                    <span key={delay} style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#9ca3af", display:"inline-block", animation:`bounce 1.2s ${delay}ms infinite` }} />
                  ))}
                </span>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop:"8px", paddingTop:"8px", borderTop:"1px solid rgba(0,0,0,0.1)" }}>
                  {msg.sources.slice(0, 3).map((s) => (
                    <div key={s.index} style={{ fontSize:"11px", color: msg.role === "user" ? "rgba(255,255,255,0.7)" : "#6b7280", marginBottom:"2px" }}>
                      <strong style={{ color: msg.role === "user" ? "#fff" : primary }}>[S{s.index}]</strong> {s.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop:"1px solid #f3f4f6", padding:"12px" }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:"8px" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
            placeholder={`Ask ${config?.assistantName ?? "the assistant"}…`}
            rows={1}
            disabled={loading}
            style={{
              flex:1, resize:"none", borderRadius:"12px", border:"1px solid #e5e7eb",
              padding:"8px 12px", fontSize:"13px", fontFamily:"inherit",
              outline:"none", lineHeight:"1.5", maxHeight:"100px", overflowY:"auto",
              opacity: loading ? 0.5 : 1,
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              flexShrink:0, width:"36px", height:"36px", borderRadius:"10px",
              background: (!input.trim() || loading) ? "#d1d5db" : primary,
              color:"#fff", border:"none", cursor: (!input.trim() || loading) ? "not-allowed" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.2s",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <div style={{ textAlign:"center", marginTop:"8px" }}>
          <span style={{ fontSize:"10px", color:"#d1d5db" }}>Powered by Clara AI</span>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

export default function EmbedWidgetPage() {
  return (
    <Suspense fallback={
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"system-ui,sans-serif", color:"#9ca3af", fontSize:"14px" }}>
        Loading…
      </div>
    }>
      <WidgetContent />
    </Suspense>
  );
}
