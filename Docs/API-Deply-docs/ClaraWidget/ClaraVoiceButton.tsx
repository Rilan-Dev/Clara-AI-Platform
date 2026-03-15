/**
 * ClaraVoiceButton — drop-in voice button using useClaraVoice.
 * Full WebRTC/Gemini voice with live transcript and audio visualizer.
 * Usage:  <ClaraVoiceButton />
 */
import { useClaraVoice } from "@/lib/clara/useClaraVoice";

export function ClaraVoiceButton() {
  const { status, transcript, isSpeaking, audioLevels,
          connect, disconnect, interrupt, sendText, error } = useClaraVoice();

  const isConnected  = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Visualizer */}
      <div className="flex items-end justify-center gap-0.5 w-48 h-10">
        {audioLevels.map((level, i) => (
          <div key={i} className="flex-1 rounded-full transition-all duration-75"
            style={{ height: `${Math.max(3, level * 40)}px`,
              background: isSpeaking ? "#6366f1" : isConnected ? "#a5b4fc" : "#e5e7eb" }} />
        ))}
      </div>

      {/* Main button */}
      <div className="relative">
        {isConnected && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-indigo-500" />
        )}
        <button
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting}
          className="relative w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg
            transition-all disabled:opacity-50"
          style={{ background: isConnected ? "#ef4444" : "#6366f1" }}
          aria-label={isConnected ? "End voice" : "Start voice"}>
          {isConnecting ? (
            <svg className="w-7 h-7 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12a9 9 0 1 1-6.2-8.56" strokeLinecap="round"/>
            </svg>
          ) : isConnected ? (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          ) : (
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
      </div>

      {/* Status */}
      <p className="text-sm text-center text-gray-500">
        {status === "idle"       && "Tap to start voice"}
        {status === "connecting" && "Connecting…"}
        {status === "connected"  && (isSpeaking ? "Clara is speaking…" : "Listening…")}
        {status === "error"      && <span className="text-red-500">{error}</span>}
      </p>

      {/* Interrupt */}
      {isConnected && isSpeaking && (
        <button onClick={interrupt}
          className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
          Interrupt
        </button>
      )}

      {/* Live transcript */}
      {transcript.length > 0 && (
        <div className="w-full max-w-xs space-y-1.5 max-h-40 overflow-y-auto">
          {transcript.map(turn => (
            <div key={turn.id} className={`text-xs px-3 py-1.5 rounded-xl ${
              turn.speaker === "user"
                ? "bg-gray-100 text-gray-700 ml-4"
                : "bg-indigo-50 text-indigo-700 mr-4"
            } ${turn.status === "speaking" ? "opacity-70" : ""}`}>
              {turn.text || "…"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
