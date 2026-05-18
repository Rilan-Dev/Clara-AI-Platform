"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, PhoneOff, Loader2, Sparkles, Volume2 } from "lucide-react";
import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";
import { useAudioVisualizer } from "@/modules/assistant/core";
import { apiUrl } from "@/lib/runtime";

const DEMO_API_KEY = "DEMO_MODE";

type DemoConfig = {
  enabled: boolean;
  voiceEnabled: boolean;
  kbId: string;
  voiceGreeting: string;
};

export default function DemoVoiceSection() {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/platform/demo-config"))
      .then(r => r.json())
      .then((cfg: DemoConfig) => { setConfig(cfg); setConfigLoaded(true); })
      .catch(() => setConfigLoaded(true));
  }, []);

  // If config loaded and demo/voice is disabled, render nothing
  if (configLoaded && (!config?.enabled || !config?.voiceEnabled)) {
    return null;
  }

  // Don't render until config is loaded
  if (!configLoaded || !config) {
    return <div className="h-[500px]" />;
  }

  return (
    <section className="relative w-full max-w-5xl mx-auto py-24 px-6 z-20">
      <div className="text-center mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-6"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Interactive Demo
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight"
        >
          Experience Voice AI
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-white/50 text-lg max-w-2xl mx-auto"
        >
          Try a real-time, low-latency conversation with Clara directly from your browser. Powered by OpenAI Realtime and Gemini Live.
        </motion.p>
      </div>

      <div className="relative rounded-3xl overflow-hidden glass-card border border-white/[0.08] min-h-[500px] flex items-center justify-center p-8 bg-black/40">
        {/* Background ambient light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-2xl bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

        <AnimatePresence mode="wait">
          {!isVoiceActive ? (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center relative z-10"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-full border border-indigo-500/30 animate-pulse-ring" />
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Volume2 className="w-8 h-8 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">Ready to talk?</h3>
              <p className="text-sm text-white/40 mb-8 max-w-sm mx-auto">
                Make sure your microphone is connected. You can ask Clara about our pricing, features, or integrations.
              </p>
              <button
                onClick={() => setIsVoiceActive(true)}
                className="px-8 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
              >
                Start Voice Session
              </button>
            </motion.div>
          ) : (
            <DemoVoiceActive
              key="active"
              kbId={config.kbId}
              voiceGreeting={config.voiceGreeting}
              onEnd={() => setIsVoiceActive(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function DemoVoiceActive({ kbId, voiceGreeting, onEnd }: {
  kbId: string; voiceGreeting: string; onEnd: () => void;
}) {
  const session = useVoiceClient({
    demoMode: true,
    demoApiKey: DEMO_API_KEY,
    kbId,
    voiceGreeting,
  });

  useEffect(() => {
    session.connect();
    return () => {
      session.disconnect();
    };
  }, []);

  const visualizerInput = session.outputAnalyserNode ?? session.remoteAudioStream;
  const levels = useAudioVisualizer(visualizerInput);
  
  const avgVolume = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const pulseScale = 1 + (avgVolume * 0.4);

  const activeTurn = session.history.length > 0 ? session.history[session.history.length - 1] : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col items-center justify-center relative z-10 py-12"
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-white/5 rounded-full px-4 py-1.5 border border-white/10">
        <div className={`w-2 h-2 rounded-full ${session.status === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400 animate-pulse'}`} />
        <span className="text-xs text-white/60 font-medium tracking-wide">
          {session.status === 'connected' ? 'LIVE' : 'CONNECTING'}
        </span>
      </div>

      <audio
        autoPlay
        playsInline
        ref={(el) => {
          if (el && session.remoteAudioStream) {
            if (el.srcObject !== session.remoteAudioStream) {
              el.srcObject = session.remoteAudioStream;
            }
          }
        }}
        className="hidden"
      />

      {/* Visualizer Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative min-h-[250px]">
        {session.status === "error" ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
              <PhoneOff className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-base text-red-300 font-medium">Connection Failed</p>
            <p className="text-sm text-red-300/60 mt-2 max-w-xs text-center mx-auto">{session.error}</p>
          </div>
        ) : session.status === "idle" || session.status === "connecting" ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-6" />
            <p className="text-sm text-indigo-300 animate-pulse font-medium">Establishing secure connection...</p>
          </div>
        ) : (
          <div className="relative w-full flex justify-center items-center h-full">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ scale: pulseScale }}
                transition={{ type: "tween", ease: "easeOut", duration: 0.1 }}
                className="w-[280px] h-[280px] rounded-full bg-gradient-to-tr from-indigo-500/30 to-violet-500/30 blur-3xl"
              />
            </div>
            
            {/* Audio Bars */}
            <div className="flex gap-3 items-center justify-center z-10 h-32">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                // Symmetrical wave effect
                const mirrorIndex = i > 3 ? 6 - i : i;
                const level = levels[mirrorIndex] ?? 0;
                return (
                  <motion.div
                    key={i}
                    animate={{
                      height: Math.max(16, level * 120),
                      backgroundColor: session.isSpeaking ? "#a78bfa" : "#818cf8"
                    }}
                    transition={{ type: "tween", ease: "easeOut", duration: 0.05 }}
                    className="w-4 rounded-full opacity-90"
                    style={{ minHeight: '16px' }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Transcripts */}
      <div className="h-28 w-full max-w-2xl mx-auto flex flex-col justify-center text-center px-4 mt-8">
        <AnimatePresence mode="wait">
          {activeTurn && activeTurn.question && (
            <motion.div
              key={`q-${activeTurn.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-2"
            >
              <p className="text-xs text-white/30 uppercase tracking-wider mb-1 font-semibold">You said</p>
              <p className="text-lg text-white/90 line-clamp-1">{activeTurn.question}</p>
            </motion.div>
          )}
          
          {activeTurn && activeTurn.answer && (
            <motion.div
              key={`a-${activeTurn.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <p className="text-xs text-indigo-400 uppercase tracking-wider mb-1 font-semibold">Clara</p>
              <p className="text-lg text-indigo-100 line-clamp-2 leading-snug">
                {activeTurn.answer}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* End Session Button */}
      <div className="mt-8">
        <button
          onClick={() => {
            session.disconnect();
            onEnd();
          }}
          className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all overflow-hidden"
          title="End Session"
        >
          <div className="absolute inset-0 bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <PhoneOff className="w-6 h-6 text-red-400 group-hover:text-red-300 relative z-10" />
        </button>
      </div>
    </motion.div>
  );
}
