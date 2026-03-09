"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Brain, X, Send, Mic, MicOff, Minimize2, MessageSquare, Volume2 } from "lucide-react";
import { streamChat } from "@/lib/api";

const ORG_ID  = "00000000-0000-0000-0000-000000000002";
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

type Message = { role: "user" | "assistant"; content: string; id: string };
type VoiceState = "idle" | "connecting" | "listening" | "speaking";

// ── Main component ────────────────────────────────────────────────────────────
export default function FloatingClaraButton() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [kbId, setKbId]         = useState<string>("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch first active KB for this org
  useEffect(() => {
    fetch(`${BACKEND}/api/kbs/all?orgId=${ORG_ID}`)
      .then(r => r.json())
      .then(d => { if (d.kbs?.length > 0) setKbId(d.kbs[0].id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !kbId || loading) return;
    const text = input.trim();
    setInput("");
    const userMsg: Message = { role: "user", content: text, id: Date.now().toString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { role: "assistant", content: "", id: assistantId }]);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      for await (const chunk of streamChat(kbId, text, history)) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: "Sorry, I couldn't get a response. Please try again." } : m));
    } finally {
      setLoading(false);
    }
  }, [input, kbId, loading, messages]);

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-xl shadow-sky-500/30 flex items-center justify-center transition-all hover:scale-110 group">
          <Brain className="w-6 h-6 text-white" />
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-sky-400 opacity-20 animate-ping" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-h-[600px] flex flex-col bg-[#0c1929] border border-white/[0.08] rounded-2xl shadow-2xl shadow-sky-500/10 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06] bg-gradient-to-r from-sky-600/20 to-blue-600/20">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Clara AI</div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400">Online · TechVision</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setVoiceOpen(true)}
                className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-sky-400 transition-colors"
                title="Voice assistant">
                <Mic className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-colors">
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" style={{ maxHeight: "400px" }}>
            {messages.length === 0 && (
              <div className="text-center py-6">
                <MessageSquare className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-xs text-white/40">Hi! I'm Clara, TechVision's AI assistant.</p>
                <p className="text-xs text-white/30 mt-1">Ask me anything about our products.</p>
                <div className="mt-4 space-y-1.5">
                  {["How do I get started?","What are the API rate limits?","How do I integrate the SDK?"].map(q => (
                    <button key={q} onClick={() => setInput(q)}
                      className="block w-full text-left text-xs text-white/50 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:text-white transition-all px-3 py-2 rounded-lg">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500/30 to-blue-600/30 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-3 h-3 text-sky-400" />
                  </div>
                )}
                <div className={`max-w-[82%] px-3 py-2.5 rounded-xl text-xs leading-relaxed ${msg.role === "user" ? "bg-sky-500/20 border border-sky-500/25 text-white" : "bg-white/[0.05] border border-white/[0.06] text-white/85"}`}>
                  {msg.content || (loading && msg.role === "assistant" ? (
                    <span className="flex gap-1 items-center py-0.5">
                      {[0,150,300].map(d => <span key={d} className="w-1 h-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </span>
                  ) : "")}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex gap-2 items-end">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask Clara anything…"
                disabled={loading || !kbId}
                className="flex-1 bg-white/[0.05] border border-white/[0.07] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-sky-500/50 transition-colors disabled:opacity-40 min-h-[38px]" />
              <button onClick={sendMessage} disabled={!input.trim() || loading || !kbId}
                className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 flex items-center justify-center transition-all shrink-0">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <p className="text-[10px] text-white/20 text-center mt-2">Powered by Clara AI · TechVision</p>
          </div>
        </div>
      )}

      {/* Voice Modal */}
      {voiceOpen && <VoiceModal onClose={() => setVoiceOpen(false)} kbId={kbId} />}
    </>
  );
}

// ── Voice Modal ──────────────────────────────────────────────────────────────
function VoiceModal({ onClose, kbId }: { onClose: () => void; kbId: string }) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [error, setError] = useState("");
  const pcRef   = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function startVoice() {
    setVoiceState("connecting");
    try {
      // Get ephemeral key from clara-backend
      const sessionRes = await fetch(`${BACKEND}/api/realtime/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId }),
      });
      if (!sessionRes.ok) throw new Error("Failed to create voice session");
      const { client_secret } = await sessionRes.json();
      const ephemeralKey = client_secret?.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");

      // WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio playback
      pc.ontrack = e => {
        if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; audioRef.current.play().catch(() => {}); }
        setVoiceState("speaking");
      };

      // Mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // Data channel for events
      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = e => {
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === "conversation.item.created") {
            const item = evt.item;
            if (item?.content?.[0]?.transcript) {
              setTranscript(prev => [...prev, { role: item.role, text: item.content[0].transcript }]);
            }
          }
        } catch {}
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model   = "gpt-4o-realtime-preview-2024-12-17";
      const sdpRes  = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error("WebRTC negotiation failed");
      const sdpAnswer = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
      setVoiceState("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voice connection failed";
      setError(msg);
      setVoiceState("idle");
    }
  }

  function stopVoice() {
    pcRef.current?.close();
    pcRef.current = null;
    setVoiceState("idle");
  }

  useEffect(() => { return () => { pcRef.current?.close(); }; }, []);

  const stateLabel: Record<VoiceState, string> = {
    idle: "Tap microphone to start",
    connecting: "Connecting…",
    listening: "Listening…",
    speaking: "Clara is speaking",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[340px] bg-[#0c1929] border border-white/[0.08] rounded-2xl shadow-2xl shadow-sky-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Voice Assistant</div>
              <div className="text-xs text-sky-400">Clara AI — TechVision</div>
            </div>
          </div>
          <button onClick={() => { stopVoice(); onClose(); }} className="text-white/30 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Waveform */}
        <div className="px-5 py-8 flex flex-col items-center">
          <div className={`relative w-24 h-24 rounded-full flex items-center justify-center mb-5 ${voiceState === "speaking" ? "bg-sky-500/20 border-2 border-sky-400/50" : "bg-white/[0.05] border-2 border-white/[0.08]"}`}>
            {voiceState !== "idle" && (
              <span className={`absolute inset-0 rounded-full ${voiceState === "speaking" ? "bg-sky-400/15 animate-ping" : ""}`} />
            )}
            <Mic className={`w-8 h-8 ${voiceState === "listening" ? "text-sky-400" : voiceState === "speaking" ? "text-sky-300" : "text-white/30"}`} />
          </div>
          <p className="text-sm font-medium text-white mb-1">{stateLabel[voiceState]}</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

          {/* Transcript */}
          {transcript.length > 0 && (
            <div className="w-full mt-4 max-h-32 overflow-y-auto space-y-2 scrollbar-thin">
              {transcript.slice(-4).map((t, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg ${t.role === "user" ? "bg-sky-500/10 text-white/70 text-right" : "bg-white/[0.04] text-white/60"}`}>
                  {t.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 pb-5 flex items-center justify-center gap-4">
          {voiceState === "idle" ? (
            <button onClick={startVoice}
              className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
              <Mic className="w-4 h-4" /> Start voice
            </button>
          ) : (
            <button onClick={stopVoice}
              className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
              <MicOff className="w-4 h-4" /> End call
            </button>
          )}
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />
      </div>
    </div>
  );
}
