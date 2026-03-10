"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, X, Volume2 } from "lucide-react";
import { ENDPOINTS } from "@/services/api/endpoints";

type Props = {
  kbId: string;
  assistantName?: string;
  accentColor?: string;
  onClose: () => void;
};

type TranscriptEntry = { role: "user" | "assistant"; text: string; ts: number };

export default function VoiceModal({ kbId, assistantName = "Clara", accentColor = "#4F46E5", onClose }: Props) {
  const [status, setStatus] = useState<"connecting" | "ready" | "speaking" | "listening" | "error">("connecting");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const pcRef    = useRef<RTCPeerConnection | null>(null);
  const dcRef    = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioRef.current) { audioRef.current.srcObject = null; }
    pcRef.current = null;
    dcRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        // 1. Get ephemeral token from backend
        const sessionRes = await fetch(ENDPOINTS.assistant.realtimeSession, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kbId }),
        });
        if (!sessionRes.ok) throw new Error("Failed to create voice session");
        const { client_secret } = await sessionRes.json();
        if (cancelled) return;

        // 2. Create WebRTC peer connection
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // 3. Attach remote audio
        const audio = new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        pc.ontrack = e => { audio.srcObject = e.streams[0]; };

        // 4. Get microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // 5. Create data channel for events
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;

        dc.onopen = () => {
          if (cancelled) return;
          setStatus("ready");
          // Send initial instructions
          dc.send(JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: `You are ${assistantName}, an AI assistant. Answer questions based on your knowledge base. Be concise and helpful.`,
              voice: "alloy",
              input_audio_transcription: { model: "whisper-1" },
              turn_detection: { type: "server_vad", silence_duration_ms: 800, threshold: 0.5 },
            },
          }));
        };

        dc.onmessage = e => {
          try {
            const ev = JSON.parse(e.data);
            if (ev.type === "conversation.item.input_audio_transcription.completed") {
              setTranscript(prev => [...prev, { role: "user", text: ev.transcript, ts: Date.now() }]);
              setStatus("listening");
            }
            if (ev.type === "response.audio_transcript.done") {
              setTranscript(prev => [...prev, { role: "assistant", text: ev.transcript, ts: Date.now() }]);
              setIsAiSpeaking(false);
              setStatus("ready");
            }
            if (ev.type === "response.audio.delta") {
              setIsAiSpeaking(true);
              setStatus("speaking");
            }
            if (ev.type === "error") {
              setErrorMsg(ev.error?.message ?? "Voice error");
              setStatus("error");
            }
          } catch { /* ignore parse errors */ }
        };

        // 6. Create SDP offer and connect
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdpRes = await fetch(ENDPOINTS.external.openAIRealtime("gpt-4o-realtime-preview-2024-12-17"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });
        if (!sdpRes.ok) throw new Error("OpenAI WebRTC connection failed");
        const answerSdp = await sdpRes.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Connection failed");
          setStatus("error");
        }
      }
    }

    connect();
    return () => { cancelled = true; cleanup(); };
  }, [kbId, assistantName, cleanup]);

  function toggleMute() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = isMuted;
      setIsMuted(!isMuted);
    }
  }

  const statusLabels: Record<string, string> = {
    connecting: "Connecting…",
    ready:      `${assistantName} is listening`,
    listening:  "Listening to you…",
    speaking:   `${assistantName} is speaking`,
    error:      "Connection error",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="bg-[#0f172a] border border-white/[0.12] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center"
                 style={{ background: accentColor }}>
              <Volume2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{assistantName} Voice</div>
              <div className="text-xs text-white/40">{statusLabels[status]}</div>
            </div>
          </div>
          <button onClick={() => { cleanup(); onClose(); }}
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Waveform / Status visualiser */}
        <div className="px-6 py-6 flex flex-col items-center">
          <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center mb-4 transition-all duration-300
            ${status === "error" ? "border-red-500/40 bg-red-500/10" : ""}
            ${status === "connecting" ? "border-white/20 bg-white/[0.04]" : ""}
            ${status === "ready" ? "border-emerald-500/40 bg-emerald-500/[0.08]" : ""}
            ${status === "listening" ? "border-blue-500/60 bg-blue-500/10 animate-pulse" : ""}
            ${status === "speaking" ? "border-violet-500/60 bg-violet-500/10" : ""}
          `} style={{ borderColor: status === "ready" ? accentColor + "66" : undefined,
                      backgroundColor: status === "ready" ? accentColor + "11" : undefined }}>
            {status === "speaking" ? (
              <div className="flex gap-1 items-end h-8">
                {[3,7,5,9,4,8,6,5,7].map((h, i) => (
                  <div key={i} className="w-1 rounded-full transition-all"
                       style={{
                         height: `${h * (isAiSpeaking ? 4 : 2)}px`,
                         background: accentColor,
                         animation: isAiSpeaking ? `waveBar ${0.5 + i * 0.1}s ease-in-out infinite alternate` : "none",
                       }} />
                ))}
              </div>
            ) : (
              <Mic className={`w-8 h-8 ${status === "error" ? "text-red-400" : status === "connecting" ? "text-white/30 animate-pulse" : "text-white/80"}`}
                   style={{ color: status === "ready" || status === "listening" ? accentColor : undefined }} />
            )}
          </div>
          {status === "error" && (
            <div className="text-xs text-red-400 text-center mb-2">{errorMsg}</div>
          )}
        </div>

        {/* Transcript */}
        <div ref={scrollRef}
             className="mx-6 mb-4 max-h-40 overflow-y-auto space-y-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          {transcript.length === 0 ? (
            <div className="text-xs text-white/30 text-center py-2">
              {status === "connecting" ? "Setting up voice connection…" : "Start speaking…"}
            </div>
          ) : transcript.map((entry, i) => (
            <div key={i} className={`text-xs leading-relaxed ${entry.role === "user" ? "text-white/60" : "text-white/90"}`}>
              <span className="font-medium" style={{ color: entry.role === "assistant" ? accentColor : undefined }}>
                {entry.role === "user" ? "You: " : `${assistantName}: `}
              </span>
              {entry.text}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="px-6 pb-6 flex items-center justify-center gap-4">
          <button onClick={toggleMute}
                  className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all
                    ${isMuted ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-white/[0.12] bg-white/[0.06] text-white/60 hover:text-white"}`}>
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={() => { cleanup(); onClose(); }}
                  className="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-full text-sm font-medium transition-all">
            End call
          </button>
        </div>

        <style>{`
          @keyframes waveBar {
            from { transform: scaleY(0.4); }
            to   { transform: scaleY(1.2); }
          }
        `}</style>
      </div>
    </div>
  );
}
