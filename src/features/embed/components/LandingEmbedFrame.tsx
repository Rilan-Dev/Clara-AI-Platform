"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PhoneOff, Sparkles, Volume2 } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import DemoWebsiteFrame from "@/features/embed/components/DemoWebsiteFrame";

type Config = {
  kbId: string;
  kbName: string;
  assistantName: string;
  avatarUrl: string | null;
  welcomeMessage: string;
  primaryColour?: string | null;
  accentColour?: string | null;
  voiceEnabled?: boolean;
  voiceWaveColor?: string | null;
};

type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";

type VoiceRuntime = { state: VoiceState; error: string | null; start: () => Promise<void>; stop: () => void };

function useEmbedVoice(apiKey: string, config: Config, onUser: (text: string) => void, onAssistant: (delta: string) => void): VoiceRuntime {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const transcriptRef = useRef("");
  const lastTranscriptRef = useRef("");

  const send = useCallback((payload: unknown) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") { try { dc.send(JSON.stringify(payload)); } catch {} }
  }, []);

  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { micRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { remoteRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { audioRef.current?.pause(); } catch {}
    try { audioRef.current?.remove(); } catch {}
    dcRef.current = null; pcRef.current = null; micRef.current = null; remoteRef.current = null; audioRef.current = null;
    transcriptRef.current = "";
  }, []);

  const stop = useCallback(() => { stoppedRef.current = true; cleanup(); setState("idle"); setError(null); }, [cleanup]);

  const start = useCallback(async () => {
    if (!config.voiceEnabled || ["connecting", "listening", "speaking"].includes(state)) return;
    stoppedRef.current = false; setError(null); setState("connecting"); transcriptRef.current = ""; lastTranscriptRef.current = "";
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      micRef.current = mic;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      const remote = new MediaStream(); remoteRef.current = remote;
      const audio = document.createElement("audio"); audio.autoplay = true; document.body.appendChild(audio); audioRef.current = audio;
      pc.ontrack = (event) => {
        const stream = event.streams?.[0]; if (!stream) return;
        stream.getTracks().forEach((track) => { if (!remote.getTracks().includes(track)) remote.addTrack(track); });
        audio.srcObject = remote; void audio.play().catch(() => undefined);
      };

      const dc = pc.createDataChannel("oai-events"); dcRef.current = dc; dc.onopen = () => setState("listening");
      dc.onclose = () => { if (!stoppedRef.current) { cleanup(); setError("Voice connection closed. Please try again."); setState("error"); } };
      dc.onmessage = (event) => {
        let msg: Record<string, unknown>; try { msg = JSON.parse(String(event.data)); } catch { return; }
        const type = String(msg.type ?? "");
        if (type === "input_audio_buffer.speech_started") {
          transcriptRef.current = ""; setState("listening");
        } else if (type === "conversation.item.input_audio_transcription.delta") {
          transcriptRef.current += String(msg.delta ?? "");
        } else if (type === "conversation.item.input_audio_transcription.completed") {
          const text = String(msg.transcript ?? transcriptRef.current).trim(); transcriptRef.current = "";
          if (!text || text === lastTranscriptRef.current) return;
          lastTranscriptRef.current = text; onUser(text);
          void fetch(apiUrl("/api/embed/search"), { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: text, limit: 6 }) })
            .then((r) => r.ok ? r.json() : { context: "", sources: [] })
            .then((payload: { context?: string }) => {
              const context = String(payload.context ?? "").trim();
              if (context) send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `Relevant knowledge-base information:\n${context}` }] } });
              send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
              send({ type: "response.create", response: { tool_choice: "none" } });
            })
            .catch(() => {
              send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
              send({ type: "response.create", response: { tool_choice: "none" } });
            });
        } else if (type === "response.created") {
          setState("speaking");
        } else if (type === "response.audio_transcript.delta" || type === "response.text.delta") {
          const delta = String(msg.delta ?? ""); if (delta) onAssistant(delta); setState("speaking");
        } else if (type === "response.done") {
          setState("listening");
        } else if (type === "response.function_call_arguments.done") {
          const name = String(msg.name ?? ""); const callId = String(msg.call_id ?? ""); if (name !== "rag_search" || !callId) return;
          let args: { query?: string } = {}; try { args = JSON.parse(String(msg.arguments ?? "{}")); } catch {}
          void fetch(apiUrl("/api/embed/search"), { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: String(args.query ?? lastTranscriptRef.current), limit: 6 }) })
            .then((r) => r.ok ? r.json() : { context: "", sources: [] })
            .then((payload: { context?: string; sources?: unknown[] }) => {
              send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ context: payload.context ?? "", sources: payload.sources ?? [] }) } });
              send({ type: "response.create", response: { tool_choice: "none" } });
            })
            .catch(() => {
              send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ context: "" }) } });
              send({ type: "response.create", response: { tool_choice: "none" } });
            });
        } else if (type === "error") {
          const detail = msg.error as Record<string, unknown> | undefined; setError(String(detail?.message ?? msg.message ?? "Voice session error")); setState("error");
        }
      };

      const track = mic.getAudioTracks()[0]; if (!track) throw new Error("No microphone audio track was available.");
      pc.addTrack(track, mic);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== "complete") await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => { if (finished) return; finished = true; pc.removeEventListener("icegatheringstatechange", check); resolve(); };
        const check = () => { if (pc.iceGatheringState === "complete") finish(); };
        pc.addEventListener("icegatheringstatechange", check); window.setTimeout(finish, 8000);
      });

      const response = await fetch(apiUrl("/api/embed/voice-connect"), { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ sdpOffer: pc.localDescription?.sdp ?? offer.sdp ?? "" }) });
      const payload = await response.json().catch(() => ({})) as { sdpAnswer?: string; welcomeMessage?: string; error?: string };
      if (!response.ok || !payload.sdpAnswer) throw new Error(payload.error ?? `Voice connection failed (${response.status})`);
      await pc.setRemoteDescription({ type: "answer", sdp: payload.sdpAnswer });
      if (payload.welcomeMessage) send({ type: "response.create", response: { instructions: `Greet the user with this message: ${JSON.stringify(payload.welcomeMessage)}`, tool_choice: "none" } });
    } catch (err) {
      cleanup();
      if (!stoppedRef.current) {
        const e = err as DOMException;
        const message = e?.name === "NotAllowedError" ? "Microphone access was denied. Allow microphone access and try again." : e?.name === "NotFoundError" ? "No microphone was detected." : (err as Error)?.message || "Unable to start voice session.";
        setError(message); setState("error");
      }
    }
  }, [apiKey, cleanup, config, onAssistant, onUser, send, state]);

  useEffect(() => () => cleanup(), [cleanup]);
  return { state, error, start, stop };
}

function VoiceExperience({ apiKey, config }: { apiKey: string; config: Config }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [levels, setLevels] = useState([0.2, 0.4, 0.3, 0.5, 0.3, 0.4, 0.2]);
  const onUser = useCallback((text: string) => { setQuestion(text); setAnswer(""); }, []);
  const onAssistant = useCallback((delta: string) => setAnswer((value) => value + delta), []);
  const voice = useEmbedVoice(apiKey, config, onUser, onAssistant);
  const primary = config.primaryColour || "#6366f1";
  const wave = config.voiceWaveColor || config.accentColour || "#818cf8";
  const active = ["connecting", "listening", "speaking"].includes(voice.state);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setLevels((current) => current.map((value) => Math.max(0.15, Math.min(1, value * 0.65 + Math.random() * 0.55)))), 100);
    return () => window.clearInterval(timer);
  }, [active]);

  return (
    <section className="relative w-full max-w-5xl mx-auto py-24 px-6 z-20 text-white">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-6"><Sparkles className="w-3.5 h-3.5" /> Interactive Demo</div>
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight">Experience Voice AI</h2>
        <p className="text-white/50 text-lg max-w-2xl mx-auto">Try a real-time, low-latency conversation with {config.assistantName} directly from your browser. Powered by your configured voice provider.</p>
      </div>
      <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] min-h-[500px] flex items-center justify-center p-8 bg-black/40">
        <div className="absolute inset-0 pointer-events-none blur-[100px]" style={{ background: `${primary}14` }} />
        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div key="start" initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} className="text-center relative z-10">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 relative" style={{ background: `${primary}22` }}><div className="absolute inset-0 rounded-full border animate-pulse" style={{ borderColor: `${primary}55` }} /><div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${primary}, ${wave})` }}><Volume2 className="w-8 h-8 text-white" /></div></div>
              <h3 className="text-xl font-medium text-white mb-2">{voice.state === "error" ? "Connection failed" : "Ready to talk?"}</h3>
              <p className="text-sm text-white/40 mb-8 max-w-sm mx-auto">{voice.error || `Make sure your microphone is connected. Ask ${config.assistantName} about policies, coverage, claims, or services.`}</p>
              <button onClick={() => void voice.start()} disabled={!config.voiceEnabled} className="px-8 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all hover:scale-105 disabled:opacity-50">{config.voiceEnabled ? "Start Voice Session" : "Voice unavailable"}</button>
            </motion.div>
          ) : (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full flex flex-col items-center justify-center relative z-10 py-12">
              <div className="absolute top-4 right-4 flex items-center gap-2 bg-white/5 rounded-full px-4 py-1.5 border border-white/10"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-xs text-white/60 font-medium tracking-wide">{voice.state === "speaking" ? "SPEAKING" : voice.state === "connecting" ? "CONNECTING" : "LIVE"}</span></div>
              {voice.state === "connecting" ? <div className="flex flex-col items-center"><Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-6" /><p className="text-sm text-indigo-300 animate-pulse font-medium">Establishing secure connection...</p></div> : <div className="flex gap-3 items-center justify-center z-10 h-32">{levels.map((level, index) => <motion.div key={index} animate={{ height: Math.max(16, level * 120) }} transition={{ duration: .08 }} className="w-4 rounded-full opacity-90" style={{ backgroundColor: wave }} />)}</div>}
              <div className="h-28 w-full max-w-2xl flex flex-col justify-center text-center px-4 mt-8">{question && <><p className="text-xs text-white/30 uppercase tracking-wider mb-1 font-semibold">You said</p><p className="text-lg text-white/90 line-clamp-1">{question}</p></>}{answer && <><p className="text-xs text-indigo-400 uppercase tracking-wider mb-1 mt-3 font-semibold">{config.assistantName}</p><p className="text-lg text-indigo-100 line-clamp-2 leading-snug">{answer}</p></>}</div>
              <button onClick={voice.stop} className="mt-8 flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30" title="End Session"><PhoneOff className="w-6 h-6 text-red-400" /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function VoiceLandingFrame({ apiKey }: { apiKey: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!apiKey) { setError("Missing embed API key"); return; }
    let cancelled = false;
    fetch(apiUrl("/api/embed/config"), { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) throw new Error(data.error ?? `Config request failed (${response.status})`);
        if (!cancelled) setConfig(data as Config);
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message || "Unable to load assistant configuration"); });
    return () => { cancelled = true; };
  }, [apiKey]);
  if (error) return <div className="min-h-screen flex items-center justify-center bg-transparent px-4 text-center text-xs text-red-300">{error}</div>;
  if (!config) return <div className="min-h-screen flex items-center justify-center bg-transparent"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>;
  if (config.voiceEnabled === false) return <div className="min-h-screen flex items-center justify-center bg-transparent text-sm text-white/50">Voice is not enabled for this assistant.</div>;
  return <VoiceExperience apiKey={apiKey} config={config} />;
}

export default function LandingEmbedFrame({ apiKey, mode }: { apiKey: string; mode: "fab" | "voice" }) {
  // Phase 4 demo website: the TechVision page resolves its own embed key
  // (explicit ?key param → platform demo-config fallback), so no config
  // precondition applies in fab mode.
  if (mode === "fab") return <DemoWebsiteFrame apiKey={apiKey} />;
  return <VoiceLandingFrame apiKey={apiKey} />;
}
