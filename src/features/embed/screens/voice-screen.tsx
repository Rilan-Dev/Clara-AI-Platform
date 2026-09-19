"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, PhoneOff, Sparkles, Volume2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/runtime";
import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";
import { useAudioVisualizer } from "@/modules/assistant/core";

type VoiceConfig = {
  kbId: string;
  kbName: string;
  assistantName: string;
  avatarUrl: string | null;
  welcomeMessage: string;
  defaultLanguage?: string | null;
  voiceEnabled?: boolean;
  voiceProvider?: string;
  primaryColour?: string | null;
  accentColour?: string | null;
};

function VoiceActive({ config, apiKey, onEnd }: {
  config: VoiceConfig;
  apiKey: string;
  onEnd: () => void;
}) {
  const session = useVoiceClient({
    kbId: config.kbId,
    // Presence of embedApiKey alone selects the public embed session/RAG
    // transport. The value is the real clr_ API key, resolved server-side
    // from the DB (embed_api_key table) or env fallback — never a bypass token.
    embedApiKey: apiKey,
    voiceGreeting: config.welcomeMessage,
  });

  useEffect(() => {
    void session.connect().catch((error) => {
      console.error("[embed/voice] connect failed", error);
    });
    return () => session.disconnect();
    // Connect exactly once for this mounted voice session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visualizerInput = session.outputAnalyserNode ?? session.remoteAudioStream;
  const levels = useAudioVisualizer(visualizerInput);
  const avgVolume = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const pulseScale = 1 + avgVolume * 0.4;
  const activeTurn = session.history.length > 0 ? session.history[session.history.length - 1] : null;
  const primary = config.primaryColour?.trim() || "#6366f1";
  const accent = config.accentColour?.trim() || "#8b5cf6";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full min-h-[620px] flex flex-col items-center justify-center relative z-10 py-10 px-6 text-foreground"
    >
      <div className="absolute top-5 right-5 flex items-center gap-2 bg-muted/50 rounded-full px-4 py-1.5 border border-border/70">
        <div className={`w-2 h-2 rounded-full ${session.status === "connected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-amber-500 animate-pulse"}`} />
        <span className="text-xs text-muted-foreground font-medium tracking-wide">
          {session.status === "connected" ? "LIVE" : "CONNECTING"}
        </span>
      </div>

      <audio
        autoPlay
        playsInline
        ref={(el) => {
          if (el && session.remoteAudioStream && el.srcObject !== session.remoteAudioStream) {
            el.srcObject = session.remoteAudioStream;
          }
        }}
        className="hidden"
      />

      <div className="flex-1 w-full flex flex-col items-center justify-center relative min-h-[280px]">
        {session.status === "error" ? (
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4 border border-destructive/30">
              <PhoneOff className="w-8 h-8 text-destructive" />
            </div>
            <p className="text-base text-destructive font-medium">Connection Failed</p>
            <p className="text-sm text-destructive/70 mt-2">{session.error || "Voice connection could not be established."}</p>
          </div>
        ) : session.status === "idle" || session.status === "connecting" ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 animate-spin mb-6" style={{ color: accent }} />
            <p className="text-sm font-medium animate-pulse" style={{ color: accent }}>Establishing secure connection...</p>
          </div>
        ) : (
          <div className="relative w-full flex justify-center items-center h-full">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ scale: pulseScale }}
                transition={{ type: "tween", ease: "easeOut", duration: 0.1 }}
                className="w-[280px] h-[280px] rounded-full blur-3xl"
                style={{ background: `linear-gradient(135deg, ${primary}4d, ${accent}4d)` }}
              />
            </div>
            <div className="flex gap-3 items-center justify-center z-10 h-32">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                const mirrorIndex = i > 3 ? 6 - i : i;
                const level = levels[mirrorIndex] ?? 0;
                return (
                  <motion.div
                    key={i}
                    animate={{ height: Math.max(16, level * 120) }}
                    transition={{ type: "tween", ease: "easeOut", duration: 0.05 }}
                    className="w-4 rounded-full opacity-90"
                    style={{ minHeight: 16, backgroundColor: session.isSpeaking ? accent : primary }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-28 w-full max-w-2xl mx-auto flex flex-col justify-center text-center px-4 mt-8 bg-surface rounded-2xl">
        <AnimatePresence mode="wait">
          {activeTurn?.question && (
            <motion.div key={`q-${activeTurn.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <p className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1 font-semibold">You said</p>
              <p className="text-lg text-foreground/80 line-clamp-1">{activeTurn.question}</p>
            </motion.div>
          )}
          {activeTurn?.answer && (
            <motion.div key={`a-${activeTurn.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <p className="text-xs uppercase tracking-wider mb-1 font-semibold" style={{ color: accent }}>Clara</p>
              <p className="text-lg text-foreground line-clamp-2 leading-snug">{activeTurn.answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8">
        <button
          onClick={() => { session.disconnect(); onEnd(); }}
          className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 transition-all overflow-hidden"
          title="End Session"
          aria-label="End voice session"
        >
          <div className="absolute inset-0 bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <PhoneOff className="w-6 h-6 text-destructive group-hover:text-destructive/80 relative z-10" />
        </button>
      </div>
    </motion.div>
  );
}

export default function EmbedVoicePage() {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get("key")?.trim() ?? "";
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      setError("No API key provided");
      setLoading(false);
      return;
    }

    fetch(apiUrl("/api/embed/config"), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then(async (response) => {
        const data = await response.json() as VoiceConfig & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error || `Configuration failed (${response.status})`);
        setConfig(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load voice configuration"))
      .finally(() => setLoading(false));
  }, [apiKey]);

  const primary = useMemo(() => config?.primaryColour?.trim() || "#6366f1", [config]);
  const accent = useMemo(() => config?.accentColour?.trim() || "#8b5cf6", [config]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading voice assistant…</div>;
  if (error || !config) return <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center text-destructive text-sm">{error || "Voice configuration unavailable"}</div>;
  if (config.voiceEnabled === false) return <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center text-muted-foreground text-sm">Voice assistant is disabled for this assistant.</div>;

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-background text-foreground flex items-center justify-center p-6">
      <div className="absolute inset-0 pointer-events-none opacity-60" style={{ background: `radial-gradient(circle at 50% 45%, ${primary}26, transparent 55%)` }} />
      <div className="relative w-full max-w-5xl min-h-[620px] rounded-3xl overflow-hidden border border-border bg-card flex items-center justify-center p-8 shadow-lg">
        <div className="absolute top-7 left-7 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/70 bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5" style={{ color: accent }} />
          Interactive Voice AI
        </div>
        <div className="absolute top-7 right-7 text-xs text-muted-foreground">{config?.assistantName}</div>

        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div key="start" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="text-center relative z-10 max-w-xl">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 relative" style={{ background: `linear-gradient(135deg, ${primary}33, ${accent}33)` }}>
                <div className="absolute inset-0 rounded-full border animate-pulse" style={{ borderColor: `${primary}66` }} />
                <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                  <Volume2 className="w-8 h-8 text-white" />
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">Ready to talk with {config?.assistantName}?</h1>
              <p className="text-sm md:text-base text-muted-foreground mb-8">Make sure your microphone is connected. Start a real-time conversation using the same assistant, knowledge base, language, and AI configuration as the public embed.</p>
              <button onClick={() => setActive(true)} className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/25">
                <Mic className="w-4 h-4" /> Start Voice Session
              </button>
            </motion.div>
          ) : (
            config && (
              <VoiceActive
                key="active"
                config={config}
                apiKey={apiKey}
                onEnd={() => setActive(false)}
              />
            )
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}