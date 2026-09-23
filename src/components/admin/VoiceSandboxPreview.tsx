"use client";
/**
 * src/components/admin/VoiceSandboxPreview.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline voice live-preview panel embedded inside the Widget Design sandbox.
 * Uses the real useVoiceClient hook (OpenAI Realtime or Gemini Live) wired to
 * the actual kbId so the voice session is identical to what end-users experience.
 *
 * Renders inside the WidgetDesignPanel — not in a modal.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, PhoneOff, Zap, Volume2, Radio } from "lucide-react";
import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";
import { useAudioVisualizer } from "@/modules/assistant/core";

type Props = {
  kbId: string;
  kbName: string;
  primaryColour?: string;
  assistantName?: string;
};

export function VoiceSandboxPreview({ kbId, kbName, primaryColour = "#6366f1", assistantName = "Clara" }: Props) {
  const session = useVoiceClient({
    kbId,
    documentId: null,
    voiceGreeting: `Voice preview for "${kbName}". Ask any question to test the voice experience.`,
  });

  const {
    status, error, isSpeaking, history,
    connect, disconnect, interrupt, sendText,
    remoteAudioStream, outputAnalyserNode,
  } = session;

  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(false);
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  useEffect(() => { connectRef.current = connect; },    [connect]);
  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [textInput, setTextInput] = useState("");

  // ── Audio visualizer ──────────────────────────────────────────────────────
  const vizInput = outputAnalyserNode ?? remoteAudioStream;
  const levels   = useAudioVisualizer(vizInput);

  // ── Remote audio (OpenAI WebRTC) ──────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!remoteAudioStream) {
      try { el.pause(); } catch { /* ignore */ }
      el.srcObject = null;
      setAutoplayBlocked(false);
      return;
    }
    if (el.srcObject === remoteAudioStream) return;
    try { el.pause(); } catch { /* ignore */ }
    el.srcObject = remoteAudioStream;
    el.muted = false;
    void el.play().catch((err: unknown) => {
      if ((err as DOMException)?.name === "NotAllowedError") setAutoplayBlocked(true);
    });
  }, [remoteAudioStream]);

  // ── Auto-connect on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (sessionRef.current) return;
    sessionRef.current = true;
    let cancelled = false;
    void (async () => {
      try { await connectRef.current?.(); }
      catch (e) {
        if (!cancelled) {
          console.error("[VoiceSandbox] connect error:", e);
          sessionRef.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef.current) {
        sessionRef.current = false;
        disconnectRef.current?.();
      }
    };
  }, []);

  const connected   = status === "connected";
  const connecting  = status === "connecting";
  const isError     = status === "error";

  const handleUnmute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    void el.play().then(() => setAutoplayBlocked(false)).catch(() => {});
  }, []);

  const handleSendText = useCallback(() => {
    const t = textInput.trim();
    if (!t || !connected) return;
    sendText(t);
    setTextInput("");
  }, [textInput, connected, sendText]);


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Hidden audio element for OpenAI WebRTC playback */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/70
        bg-muted/50 px-4 py-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `${primaryColour}22`, border: `1px solid ${primaryColour}44` }}>
            <Radio className="h-3.5 w-3.5" style={{ color: primaryColour }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Voice Live Preview</p>
            <p className="text-[11px] text-muted-foreground/70">
              Real {session.provider === "gemini" ? "Gemini Live" : "OpenAI Realtime"} · {kbName}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
              connected   ? "animate-ping bg-emerald-400/50"
              : connecting? "animate-ping bg-amber-400/50"
              : isError   ? "bg-rose-400/50"
              : "bg-muted-foreground/30"
            }`}/>
            <span className={`relative inline-flex h-2 w-2 rounded-full ${
              connected   ? "bg-emerald-400"
              : connecting? "bg-amber-400"
              : isError   ? "bg-rose-400"
              : "bg-muted-foreground/40"
            }`}/>
          </span>
          <span className="text-xs text-muted-foreground">
            {connected ? "Connected" : connecting ? "Connecting…" : isError ? "Error" : "Idle"}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {connected && (
            <button onClick={interrupt} disabled={!isSpeaking}
              title="Interrupt the assistant"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs
                font-medium transition-all
                ${isSpeaking
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 cursor-pointer"
                  : "border-border text-muted-foreground/80 cursor-not-allowed"
                }`}>
              <Zap className="h-3 w-3"/>Interrupt
            </button>
          )}
          <button
            onClick={connected ? () => { sessionRef.current = false; disconnect(); } : () => { void connect(); }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs
              font-medium transition-all border
              ${connected
                ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : connecting
                ? "border-border text-muted-foreground/70 cursor-not-allowed"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              }`}
            disabled={connecting}>
            {connected
              ? <><PhoneOff className="h-3 w-3"/>Disconnect</>
              : connecting
              ? <><span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/40 border-t-foreground"/>Connecting…</>
              : <><Mic className="h-3 w-3"/>Connect voice</>
            }
          </button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {isError && error && (
        <div className="mx-4 mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ── Autoplay blocked banner ───────────────────────────────────────── */}
      {autoplayBlocked && (
        <button onClick={handleUnmute}
          className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2
            rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3
            text-sm font-medium text-amber-600 hover:bg-amber-500/20 transition-colors">
          <Volume2 className="h-4 w-4"/>
          Tap to enable audio playback
        </button>
      )}

      {/* ── Audio visualizer ─────────────────────────────────────────────── */}
      <div className="px-4 pt-4">
        <div className="flex h-28 w-full items-end justify-center gap-[3px] rounded-xl
          bg-gradient-to-b from-muted/50 to-transparent px-3 py-2">
          {levels.map((v, i) => (
            <div key={i}
              className="flex-1 rounded-t transition-all duration-100"
              style={{
                height: `${Math.max(4, v * 100)}%`,
                background: isSpeaking
                  ? `linear-gradient(to top, ${primaryColour}cc, ${primaryColour}66)`
                  : connected
                  ? "linear-gradient(to top, rgba(79,70,229,0.5), rgba(79,70,229,0.2))"
                  : "hsl(var(--muted-foreground) / 0.2)",
                boxShadow: isSpeaking && v > 0.3
                  ? `0 0 8px ${primaryColour}88`
                  : "none",
              }}/>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
          {isSpeaking
            ? `🔊 ${assistantName} is speaking…`
            : connected
            ? "🎙️ Speak now — I'm listening"
            : connecting
            ? "Establishing secure voice connection…"
            : "Voice session not started"}
        </p>
      </div>

      {/* ── Conversation history ──────────────────────────────────────────── */}
      <div className="mx-4 mt-3 max-h-60 overflow-y-auto space-y-2 pb-1
        [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
        {history.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground/70">
            {connected
              ? "Ask a question by speaking or typing below"
              : "Connect to start the voice session"}
          </div>
        ) : (
          history.map((turn, i) => (
            <div key={turn.id}
              className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground/70">Turn {i + 1}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium
                  ${turn.status === "speaking"
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-600"
                    : turn.status === "pending"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  }`}>
                  {turn.status === "speaking" ? "Speaking" : turn.status === "pending" ? "Composing" : "Done"}
                </span>
              </div>
              {turn.question && (
                <div>
                  <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider mb-0.5">You said</p>
                  <p className="text-xs text-foreground/80">{turn.question}</p>
                </div>
              )}
              {turn.answer && (
                <div>
                  <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider mb-0.5">{assistantName} replied</p>
                  <p className={`text-xs text-foreground/80 line-clamp-4 ${turn.status === "speaking" ? "animate-pulse" : ""}`}>
                    {turn.answer}
                  </p>
                </div>
              )}
              {turn.sources.length > 0 && (
                <p className="text-[11px] text-muted-foreground/70">{turn.sources.length} source{turn.sources.length !== 1 ? "s" : ""} cited</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Text input (type to send) ─────────────────────────────────────── */}
      <div className="mx-4 mb-4 mt-3 flex items-center gap-2">
        <input
          type="text"
          value={textInput}
          disabled={!connected}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSendText(); }}
          placeholder={connected ? "Or type a message to send via voice…" : "Connect voice to send messages"}
          className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2
            text-xs text-foreground/80 placeholder:text-muted-foreground/80 focus:border-primary/40
            focus:outline-none disabled:opacity-40"
        />
        <button onClick={handleSendText} disabled={!connected || !textInput.trim()}
          className="rounded-lg px-3 py-2 text-xs font-medium transition-all
            border border-border bg-muted text-muted-foreground
            hover:border-primary/40 hover:bg-primary/10 hover:text-foreground
            disabled:opacity-30 disabled:cursor-not-allowed">
          Send
        </button>
      </div>

      {/* ── Provider info ─────────────────────────────────────────────────── */}
      <div className="border-t border-border/70 px-4 py-2.5 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground/80">
          {session.provider === "gemini"
            ? "⚡ Gemini Live — low-latency bidirectional audio"
            : "⚡ OpenAI Realtime — WebRTC audio session"}
        </p>
        {connected && <MicOff className="h-3 w-3 text-muted-foreground/80"/>}
      </div>
    </div>
  );
}
