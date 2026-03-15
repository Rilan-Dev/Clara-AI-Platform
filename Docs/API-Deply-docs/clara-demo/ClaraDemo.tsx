/**
 * src/pages/ClaraDemo.tsx
 * Live showcase: consume Clara streaming + voice with 100% your own UI.
 * Route: /clara-demo
 */
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useClara }      from "@/lib/clara/useClara";
import { useClaraVoice } from "@/lib/clara/useClaraVoice";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

type Tab = "chat" | "voice" | "both";

export default function ClaraDemo() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 pt-24 pb-20 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-black text-gray-900 mb-2">
            Clara AI — Your UI, Our Stream
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto text-sm">
            Two hooks. <code className="bg-gray-100 px-1 rounded">useClara()</code> for chat streaming.{" "}
            <code className="bg-gray-100 px-1 rounded">useClaraVoice()</code> for live voice.
            Build any design you want — no Clara design concepts to learn.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex justify-center gap-2">
          {(["chat", "voice", "both"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all capitalize ${
                tab === t
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
              {t === "both" ? "Chat + Voice" : t}
            </button>
          ))}
        </div>

        {tab === "chat"  && <ChatDemo />}
        {tab === "voice" && <VoiceDemo />}
        {tab === "both"  && (
          <div className="grid md:grid-cols-2 gap-6">
            <ChatDemo />
            <VoiceDemo />
          </div>
        )}

        {/* Code reference */}
        <CodeReference />
      </main>
      <Footer />
    </div>
  );
}

// ── Chat Demo — 100% custom Tailwind UI ───────────────────────────────────
// This is your code. Clara just gives you messages + send + isThinking.

function ChatDemo() {
  const { messages, send, isThinking, reset } = useClara();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    send(input.trim());
    setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ height: 560 }}>
      {/* Your own header — any design */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">A</div>
          <div>
            <p className="font-semibold text-sm leading-none">AmazeTech Support</p>
            <p className="text-[11px] opacity-70 mt-0.5">AI Assistant · Online</p>
          </div>
        </div>
        <button onClick={reset} className="text-white/60 hover:text-white text-xs transition-colors">
          Clear
        </button>
      </div>

      {/* Your own messages — any styling */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-gray-50">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Ask anything about AmazeTechCLANS…
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold mr-2 flex-shrink-0 mt-1">
                A
              </div>
            )}
            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-indigo-600 text-white rounded-br-sm"
                : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm"
            }`}>
              {msg.content || (
                <span className="flex gap-1 items-center py-0.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              )}
              {/* Your own source citations */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/20 space-y-1">
                  {msg.sources.map(s => (
                    <p key={s.index} className="text-[11px] opacity-70">
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

      {/* Your own input — any design */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2 items-end flex-shrink-0">
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
          placeholder="Type a message…" rows={1} disabled={isThinking}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-indigo-200 min-h-[38px] max-h-[88px]
            disabled:opacity-50 transition-opacity" />
        <button onClick={handleSend} disabled={!input.trim() || isThinking}
          className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200
            flex items-center justify-center flex-shrink-0 transition-colors">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Voice Demo — 100% custom UI ───────────────────────────────────────────
// useClaraVoice() gives you all the data. Design whatever you want.

function VoiceDemo() {
  const { status, transcript, isSpeaking, audioLevels,
          connect, disconnect, interrupt, sendText, error } = useClaraVoice();

  const [textInput, setTextInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const isConnected  = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ height: 560 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">Voice Assistant</p>
            <p className="text-[11px] opacity-70 mt-0.5 capitalize">{status}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button onClick={interrupt}
              className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">
              Interrupt
            </button>
          )}
          {isConnected && (
            <button onClick={disconnect}
              className="text-xs bg-red-500/80 hover:bg-red-500 px-3 py-1 rounded-full transition-colors">
              End
            </button>
          )}
        </div>
      </div>

      {/* Audio visualizer — 32 bars from audioLevels */}
      <div className="flex items-end justify-center gap-0.5 px-4 py-3 bg-gray-900 h-16 flex-shrink-0">
        {audioLevels.map((level, i) => (
          <div key={i}
            className="flex-1 rounded-full transition-all duration-75"
            style={{
              height: `${Math.max(4, level * 52)}px`,
              background: isSpeaking
                ? `hsl(${220 + i * 2}, 80%, ${50 + level * 30}%)`
                : isConnected
                ? `hsl(270, 60%, ${35 + level * 30}%)`
                : "#374151",
            }}
          />
        ))}
      </div>

      {/* Status / speaking indicator */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-t border-gray-800 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isConnected  ? (isSpeaking ? "bg-blue-400 animate-pulse" : "bg-green-400")
          : isConnecting ? "bg-amber-400 animate-pulse"
          : "bg-gray-600"
        }`} />
        <span className="text-xs text-gray-400">
          {isSpeaking   ? "Clara is speaking…"
          : isConnected  ? "Listening — speak naturally"
          : isConnecting ? "Connecting…"
          : "Tap the button below to start"}
        </span>
      </div>

      {/* Transcript */}
      <div ref={transcriptRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
        {transcript.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm text-center px-4">
            {isConnected
              ? "Speak to get started — Clara will respond in real-time"
              : "Connect to start a voice conversation"}
          </div>
        )}
        {transcript.map(turn => (
          <div key={turn.id} className={`flex ${turn.speaker === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
              turn.speaker === "user"
                ? "bg-violet-600 text-white rounded-br-sm"
                : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm"
            } ${turn.status === "speaking" ? "opacity-80" : ""}`}>
              {turn.text || <span className="text-[11px] opacity-50 italic">…</span>}
              {turn.status === "speaking" && (
                <span className="inline-block w-1 h-3.5 bg-current ml-0.5 animate-pulse rounded-full" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Connect / Text input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
        {!isConnected && !isConnecting && (
          <button onClick={connect} disabled={isConnecting}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white
              font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            Start Voice Session
          </button>
        )}
        {isConnecting && (
          <div className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm text-center font-medium">
            Connecting…
          </div>
        )}
        {isConnected && (
          <div className="flex gap-2">
            <input value={textInput} onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { sendText(textInput); setTextInput(""); } }}
              placeholder="Or type instead of speaking…"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            <button onClick={() => { sendText(textInput); setTextInput(""); }}
              disabled={!textInput.trim()}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-gray-200 text-white text-sm font-medium transition-colors">
              Send
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
      </div>
    </div>
  );
}

// ── Code reference — what developers actually copy ─────────────────────────

function CodeReference() {
  const [tab, setTab] = useState<"chat" | "voice">("chat");

  const chatCode = `import { useClara } from "@/lib/clara";

function MyChat() {
  const { messages, send, isThinking, reset } = useClara();

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id} className={msg.role === "user" ? "my-bubble" : "their-bubble"}>
          {msg.content}
        </div>
      ))}
      <button onClick={() => send("Hello!")} disabled={isThinking}>
        Send
      </button>
    </div>
  );
}`;

  const voiceCode = `import { useClaraVoice } from "@/lib/clara";

function MyVoice() {
  const {
    status,       // "idle" | "connecting" | "connected" | "error"
    transcript,   // [{ id, speaker: "user"|"assistant", text, status }]
    isSpeaking,   // boolean — AI is playing audio
    audioLevels,  // number[32] — bar heights 0–1 for a visualizer
    connect,      // () => Promise<void>  — requests mic, starts WebRTC
    disconnect,   // () => void
    interrupt,    // () => void — cut off AI mid-sentence
    sendText,     // (text) => void — text input while voice is active
    error,        // string | null
  } = useClaraVoice();

  return (
    <div>
      {/* Your own visualizer */}
      <div style={{ display: "flex", gap: 2, height: 48 }}>
        {audioLevels.map((level, i) => (
          <div key={i} style={{ flex: 1, height: level * 48, background: "#6366f1" }} />
        ))}
      </div>

      {/* Your own transcript */}
      {transcript.map(turn => (
        <div key={turn.id} className={turn.speaker}>
          {turn.text}
        </div>
      ))}

      {/* Your own controls */}
      <button onClick={status === "connected" ? disconnect : connect}>
        {status === "connected" ? "End call" : "Start voice"}
      </button>
      <button onClick={interrupt} disabled={!isSpeaking}>
        Interrupt
      </button>
    </div>
  );
}`;

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      <div className="flex border-b border-gray-800">
        {(["chat", "voice"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-medium transition-colors capitalize ${
              tab === t ? "text-white bg-gray-800" : "text-gray-500 hover:text-gray-300"
            }`}>
            {t} hook
          </button>
        ))}
      </div>
      <pre className="p-5 text-xs text-green-400 overflow-x-auto leading-relaxed">
        <code>{tab === "chat" ? chatCode : voiceCode}</code>
      </pre>
    </div>
  );
}
