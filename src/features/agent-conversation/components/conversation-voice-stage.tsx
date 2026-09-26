"use client";

/**
 * src/features/agent-conversation/components/conversation-voice-stage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The REALTIME VOICE AGENT stage that renders INSIDE the chat window (not a
 * separate modal — the past mistake this feature corrects).
 *
 * Session lifecycle surfaced to the user:
 *   1. STARTING        → the parent flips voiceActive and this stage mounts;
 *                        the orb shows the CONNECTING breathing halo while
 *                        the provider session, mic and audio contexts boot.
 *   2. ACTIVE          → orb switches between USER SPEAKING (six wave rings
 *                        driven by mic amplitude), THINKING (orbit dots) and
 *                        AGENT SPEAKING (ripple bloom driven by playback
 *                        amplitude) — instantly, from the ui-state machine.
 *   3. Live transcript → the active turn's question/answer stream below the
 *                        orb, exactly like a chat conversation.
 *   4. COMPLETING      → "End session" disconnects; the parent folds the
 *                        completed turns back into the chat message list and
 *                        the window returns to the normal chat experience.
 *
 * Controls: mic pause/resume (session stays connected), interrupt (barge-in
 * while the agent speaks) and end session. The hidden <audio> element is the
 * WebRTC playback sink for remote-stream transports (OpenAI Realtime).
 */

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Loader2, Mic, MicOff, OctagonX, PhoneOff, Radio } from "lucide-react";
import { useAudioVisualizer } from "@/modules/assistant/core/hooks/useAudioVisualizer";
import { cn } from "@/lib/utils";
import { RealtimeVoiceOrb } from "./realtime-voice-orb";
import { isGreetingTurn } from "../lib/voice-turns";
import type { VoiceClientSession } from "../types";

interface ConversationVoiceStageProps {
  session: VoiceClientSession;
  /** Mic amplitude bands for the user-speaking visual (viz-only capture). */
  micLevels: number[];
  agentName: string;
  primaryColour: string;
  accentColour: string;
  avatarUrl?: string | null;
  onEnd: () => void;
  /** Hide the duplicate transcript when the parent renders the live chat rail. */
  showTranscript?: boolean;
}

const STATE_META: Record<
  string,
  { label: string; hint: string; tone: "listening" | "thinking" | "speaking" | "connecting" | "error" }
> = {
  listening: { label: "Listening", hint: "Speak naturally — I'm listening", tone: "listening" },
  thinking: { label: "Thinking", hint: "Looking into your knowledge base…", tone: "thinking" },
  speaking: { label: "Speaking", hint: `${""}Responding out loud`, tone: "speaking" },
  connecting: { label: "Connecting", hint: "Securing the voice session…", tone: "connecting" },
  interrupting: { label: "Listening", hint: "Got it — switching to you", tone: "listening" },
  error: { label: "Connection issue", hint: "The voice session dropped", tone: "error" },
  idle: { label: "Starting", hint: "Warming up the voice session…", tone: "connecting" },
};

export function ConversationVoiceStage({
  session,
  micLevels,
  agentName,
  primaryColour,
  accentColour,
  avatarUrl,
  onEnd,
  showTranscript = true,
}: ConversationVoiceStageProps) {
  // Agent playback levels — analyser fast-path when available, remote stream
  // otherwise (WebRTC transports).
  const agentLevels = useAudioVisualizer(session.outputAnalyserNode ?? session.remoteAudioStream);

  const uiState = session.uiState;
  const meta = STATE_META[uiState] ?? STATE_META.idle;

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // The transcript shows the last turn the USER actually spoke. The session
  // greeting (a system announcement seeded into history by the provider
  // hooks — "Welcome message" placeholder for OpenAI/Gemini, empty question
  // for ElevenLabs/Sarvam) is skipped: rendering it printed a fake
  // "You: Welcome message" bubble at session start and duplicated the
  // welcome text. The greeting still plays audibly.
  const activeTurn = useMemo(() => {
    const history = session.history ?? [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (!isGreetingTurn(history[i])) return history[i];
    }
    return null;
  }, [session.history]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [activeTurn?.question, activeTurn?.answer]);

  const toneColour =
    meta.tone === "speaking"
      ? accentColour
      : meta.tone === "error"
        ? "#ef4444"
        : primaryColour;

  return (
    <div className="flex h-full min-h-[30rem] flex-col">
      {/* Hidden WebRTC playback sink. */}
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

      {/* Status header — lifecycle label + provider + elapsed state dot. */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide"
          style={{ borderColor: `${toneColour}55`, color: toneColour, background: `${toneColour}0f` }}
        >
          {uiState === "connecting" || uiState === "idle" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span
              className={cn("h-2 w-2 rounded-full", uiState !== "error" && "animate-pulse")}
              style={{ background: toneColour, boxShadow: `0 0 8px ${toneColour}` }}
            />
          )}
          {meta.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <Radio className="h-3 w-3" />
          Realtime voice
          {session.provider ? ` · ${session.provider}` : ""}
        </span>
      </div>

      {/* The orb — the floor owner is always visually unambiguous. */}
      <div className="flex flex-1 items-center justify-center py-2">
        <RealtimeVoiceOrb
          state={uiState}
          micLevels={micLevels}
          agentLevels={agentLevels}
          primaryColour={primaryColour}
          accentColour={accentColour}
          agentName={agentName}
          avatarUrl={avatarUrl}
          size={252}
        />
      </div>

      {/* State hint — one calm line under the orb. */}
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        {session.error ? session.error : meta.hint}
      </p>

      {showTranscript && (
        <div
          ref={transcriptRef}
          className="mx-auto mt-3 w-full max-w-xl flex-1 basis-24 overflow-y-auto rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-sm shadow-inner"
        >
          {activeTurn ? (
            <div className="space-y-3">
              {activeTurn.question && (
                <div>
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">You</p>
                  <p className="text-foreground/85">{activeTurn.question}</p>
                </div>
              )}
              {activeTurn.answer ? (
                <div>
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accentColour }}>{agentName}</p>
                  <p className="leading-relaxed text-foreground">
                    {activeTurn.answer}
                    {activeTurn.status === "pending" && session.uiState === "speaking" && (
                      <span className="ml-1 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse rounded-sm" style={{ background: accentColour }} />
                    )}
                  </p>
                </div>
              ) : uiState === "thinking" ? (
                <p className="text-xs italic text-muted-foreground">Checking the knowledge base…</p>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground/70">The conversation transcript will appear here as you talk.</p>
          )}
        </div>
      )}

      {/* Session controls — mic, interrupt, end. */}
      <div className="mt-4 flex items-center justify-center gap-4 pb-1">
        <button
          type="button"
          onClick={() => session.setMicMuted(!session.micMuted)}
          className={cn(
            "group flex h-12 w-12 items-center justify-center rounded-full border transition-all",
            session.micMuted
              ? "border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25"
              : "border-border bg-muted/50 hover:bg-muted",
          )}
          title={session.micMuted ? "Resume microphone" : "Pause microphone — the session stays live"}
          aria-label={session.micMuted ? "Resume microphone" : "Pause microphone"}
          aria-pressed={session.micMuted}
        >
          {session.micMuted ? (
            <MicOff className="h-5 w-5 text-amber-500" />
          ) : (
            <Mic className="h-5 w-5 text-foreground/70 group-hover:text-foreground" />
          )}
        </button>

        <AnimatePresence>
          {uiState === "speaking" && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              onClick={() => session.interrupt()}
              className="flex h-12 items-center gap-2 rounded-full border border-border bg-muted/50 px-5 text-sm font-medium text-foreground/80 transition hover:bg-muted"
              title="Interrupt — jump in while the assistant is speaking"
            >
              <OctagonX className="h-4 w-4" />
              Interrupt
            </motion.button>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onEnd}
          className="flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
          title="End the voice session and return to chat"
        >
          <PhoneOff className="h-4 w-4" />
          End session
        </button>
      </div>

      {session.error && (
        <div className="mx-auto mt-2 flex w-full max-w-xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AudioLines className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{session.error}</span>
        </div>
      )}

      {/* Interrupt affordance while the agent speaks (screen reader). */}
      <span className="sr-only" aria-live="polite">
        {uiState === "speaking"
          ? `${agentName} is speaking. Press the interrupt button to jump in.`
          : uiState === "listening"
            ? "Your turn — the assistant is listening."
            : ""}
      </span>
    </div>
  );
}
