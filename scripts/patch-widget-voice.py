#!/usr/bin/env python3
"""Patch widget-screen.tsx: replace the hardcoded OpenAI WebRTC voice runtime
with the provider-routed useVoiceClient (same resolution chain as every other
Clara voice surface). Line-surgical because the replaced block is ~320 lines."""

import re
import sys

PATH = "/home/z/my-project/Clara-AI-Platform/src/features/embed/screens/widget-screen.tsx"
src = open(PATH, encoding="utf-8").read()

# ── 1. Delete the whole useVoiceRuntime implementation, keep the VoiceState type ──
start_marker = "// ─────────────────────────────────────────────────────────────────────────────\n// Voice runtime — mirrors clara.js startOpenAIVoiceRuntime() exactly"
end_marker = "  return { voiceState, voiceError, start, stop, sendJSON, audioElRef,\n    onUserTranscriptRef, onAssistantDeltaRef, onAssistantDoneRef,\n    onVoiceRagRef, onAutoplayBlockedRef };\n}\n"

start_idx = src.index(start_marker)
end_idx = src.index(end_marker) + len(end_marker)
removed = src[start_idx:end_idx]

replacement = '''// ─────────────────────────────────────────────────────────────────────────────
// Voice runtime — provider-routed through useVoiceClient
//
// The SAME resolution chain as every other Clara voice surface (kb → agent →
// org voice provider → brain inherit): an ElevenLabs-configured org runs the
// Mode A STT/chat/TTS pipeline here (with the org's synced voice + models),
// an OpenAI/Gemini org runs its realtime socket. The previous implementation
// was hard-wired to OpenAI WebRTC via /api/embed/voice-connect and silently
// ignored the platform admin's provider choice on embedded sites.
// ─────────────────────────────────────────────────────────────────────────────

type VoiceState = "idle" | "connecting" | "connected" | "listening" | "speaking" | "error";
'''

src = src[:start_idx] + replacement + src[end_idx:]
print(f"1. removed useVoiceRuntime ({removed.count(chr(10))} lines), replaced with VoiceState + note")

# ── 2. Replace the runtime wiring inside WidgetContent ──
wiring_old_start = "  // ── Voice runtime ─────────────────────────────────────────────────────────\n  const voice = useVoiceRuntime(apiKey, config);\n  const voiceAudioRef = useRef<HTMLAudioElement>(null);\n  useEffect(() => { voice.audioElRef.current = voiceAudioRef.current; }, [voice.audioElRef]);\n"
wiring_old_end = '    // Show "Tap to enable audio" banner if browser blocks autoplay\n    voice.onAutoplayBlockedRef.current = () => { setAutoplay(true); };\n  }, [apiKey, voice]);\n'

ws = src.index(wiring_old_start)
we = src.index(wiring_old_end) + len(wiring_old_end)
wiring_removed = src[ws:we]

wiring_new = '''  // ── Voice runtime (provider-routed) ──────────────────────────────────────
  const voiceSession = useVoiceClient({
    kbId: config?.kbId ?? null,
    // Presence of embedApiKey selects the public embed transports
    // (/api/embed/session + /api/embed/chat + clr_-key Mode A endpoints).
    embedApiKey: apiKey,
    voiceGreeting: config?.welcomeMessage,
  });

  const voiceState: VoiceState =
    voiceSession.status === "error" ? "error" :
    voiceSession.status === "connecting" ? "connecting" :
    voiceSession.status === "connected" ? (voiceSession.isSpeaking ? "speaking" : "listening") :
    "idle";
  const voiceError = voiceSession.error;
  const isVoiceActive2 = voiceState === "connecting" || voiceState === "listening" || voiceState === "speaking";

  const startVoice = useCallback(() => {
    voiceTurnMapRef.current.clear();
    setAutoplay(false);
    void voiceSession.connect();
  }, [voiceSession]);
  const stopVoice = useCallback(() => {
    voiceSession.disconnect();
  }, [voiceSession]);

  // Remote audio for the realtime sockets (OpenAI/Gemini surface a
  // MediaStream; the ElevenLabs pipeline plays through its own AudioContext,
  // which is created inside the click gesture so autoplay is granted).
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = voiceAudioRef.current;
    const stream = voiceSession.remoteAudioStream;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => { setAutoplay(true); });
    } else if (!stream && el.srcObject) {
      el.srcObject = null;
    }
  }, [voiceSession.remoteAudioStream]);

  // Voice transcript → chat bubbles. Each voice turn renders as a user
  // bubble plus a streaming assistant bubble (the same history model every
  // voice hook maintains). Replaces the old onUserTranscript /
  // onAssistantDelta callbacks.
  const voiceTurnMapRef = useRef(new Map<string, { userIdx: number; assistantIdx: number }>());
  useEffect(() => {
    if (voiceSession.history.length === 0) return;
    setMsgs((prev) => {
      let next = prev;
      for (const turn of voiceSession.history) {
        let mapping = voiceTurnMapRef.current.get(turn.id);
        if (!mapping) {
          mapping = { userIdx: -1, assistantIdx: -1 };
          voiceTurnMapRef.current.set(turn.id, mapping);
        }
        if (turn.question && mapping.userIdx === -1) {
          mapping.userIdx = next.length;
          next = [...next, { id: `${turn.id}-u`, role: "user", content: turn.question }];
        }
        if (mapping.assistantIdx === -1) {
          mapping.assistantIdx = next.length;
          next = [...next, { id: `${turn.id}-a`, role: "assistant", content: "" }];
        }
        const idx = mapping.assistantIdx;
        const existing = next[idx];
        if (existing && existing.role === "assistant" && existing.content !== turn.answer) {
          next = next.map((m, i) => (i === idx ? { ...m, content: turn.answer } : m));
        }
      }
      return next;
    });
  }, [voiceSession.history]);

'''
src = src[:ws] + wiring_new + src[we:]
print(f"2. replaced voice wiring block ({wiring_removed.count(chr(10))} lines -> useVoiceClient glue)")

# ── 3. Fix the remaining UI references ──
# 3a. isVoiceActive derivation line
src = src.replace(
    "  const isVoiceActive = voice.voiceState !== \"idle\" && voice.voiceState !== \"error\";",
    "  const isVoiceActive = voiceState !== \"idle\" && voiceState !== \"error\";",
)
# 3b. status label
src = src.replace(
    """  const vsLabel = voice.voiceState === "connecting" ? "Connecting…" :
    voice.voiceState === "listening" ? "Listening…" :
    voice.voiceState === "speaking"  ? "Speaking…"  :
    voice.voiceState === "connected" ? "Connected"  : "";""",
    """  const vsLabel = voiceState === "connecting" ? "Connecting…" :
    voiceState === "listening" ? "Listening…" :
    voiceState === "speaking"  ? "Speaking…"  :
    voiceState === "connected" ? "Connected"  : "";""",
)
# 3c. error banner
src = src.replace(
    "      {voice.voiceError && (",
    "      {voiceError && (",
)
src = src.replace(
    "          {voice.voiceError}",
    "          {voiceError}",
)
# 3d. voice button
src = src.replace(
    "              onClick={() => isVoiceActive ? voice.stop() : void voice.start()}\n"
    "              title={isVoiceActive ? `Voice: ${voice.voiceState} — click to stop` : \"Start voice\"}",
    "              onClick={() => isVoiceActive ? stopVoice() : startVoice()}\n"
    "              title={isVoiceActive ? `Voice: ${voiceState} — click to stop` : \"Start voice\"}",
)
src = src.replace(
    """                background: voice.voiceState === "speaking"  ? "#10b981" :
                            voice.voiceState === "connecting" ? accent :
                            isVoiceActive ? primary : vBtnBg,""",
    """                background: voiceState === "speaking"  ? "#10b981" :
                            voiceState === "connecting" ? accent :
                            isVoiceActive ? primary : vBtnBg,""",
)
src = src.replace(
    """                animation: voice.voiceState === "connecting" || voice.voiceState === "speaking"
                  ? "voicePulse 1.2s ease-in-out infinite" : "none",""",
    """                animation: voiceState === "connecting" || voiceState === "speaking"
                  ? "voicePulse 1.2s ease-in-out infinite" : "none",""",
)

# 3e. import useVoiceClient
src = src.replace(
    'import { apiUrl } from "@/lib/runtime";',
    'import { apiUrl } from "@/lib/runtime";\n'
    'import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";',
    1,
)

# 3f. add the hidden <audio> element right after the header (first child of the root div)
src = src.replace(
    '      <style>{globalCss}</style>',
    '      <style>{globalCss}</style>\n'
    '\n'
    '      {/* Hidden audio sink for realtime voice sessions (OpenAI/Gemini\n'
    '          MediaStreams). The ElevenLabs pipeline plays through its own\n'
    '          AudioContext instead. */}\n'
    '      <audio ref={(el) => { voiceAudioRef.current = el; }} autoPlay playsInline style={{ display: "none" }} />',
    1,
)

open(PATH, "w", encoding="utf-8").write(src)
print("3. UI references + imports + audio element wired")
print("done.")
