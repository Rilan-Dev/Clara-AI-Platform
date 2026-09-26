"use client";

/**
 * Voice Chat controls for the chat window (turn-based STT → chat → TTS on
 * the agent's Voice Chat provider): a dictate button in the composer and a
 * listen button on assistant replies. Rendered only when the resolved Voice
 * Chat provider supports one-shot speech (Sarvam, ElevenLabs) — other
 * providers show nothing, and the realtime voice agent is unaffected.
 */

import { createContext, useContext } from "react";
import { Loader2, MicVocal, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceChatSpeech } from "../hooks/use-voice-chat-speech";

export type VoiceChatControls = VoiceChatSpeech & { toggleDictation: () => void };

const VoiceChatContext = createContext<VoiceChatControls | null>(null);
export const VoiceChatProvider = VoiceChatContext.Provider;

export function useVoiceChatControls(): VoiceChatControls | null {
  const controls = useContext(VoiceChatContext);
  return controls?.supported ? controls : null;
}

/** Composer button: dictate a message (records, transcribes, sends). */
export function DictateButton({ disabled = false }: { disabled?: boolean }) {
  const voiceChat = useVoiceChatControls();
  if (!voiceChat) return null;
  const { dictation, toggleDictation } = voiceChat;
  const recording = dictation === "recording";
  const busy = dictation === "transcribing";
  const label = recording ? "Stop and send your dictated message" : busy ? "Transcribing…" : "Dictate a message (voice chat)";
  return (
    <button
      type="button"
      onClick={toggleDictation}
      disabled={disabled || busy}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11",
        recording ? "bg-red-500/10 text-red-600 hover:bg-red-500/15" : "text-foreground/65 hover:bg-muted hover:text-foreground",
      )}
      title={label}
      aria-label={label}
      aria-pressed={recording}
    >
      {busy ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin" />
      ) : recording ? (
        <Square className="h-4 w-4 animate-pulse fill-current" />
      ) : (
        <MicVocal className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}

/** Reply action: read an assistant message aloud (or stop). */
export function ListenButton({ messageId, text }: { messageId: string; text: string }) {
  const voiceChat = useVoiceChatControls();
  if (!voiceChat || !text.trim()) return null;
  const speaking = voiceChat.speakingId === messageId;
  return (
    <div className="mt-1 pl-0.5">
    <button
      type="button"
      onClick={() => (speaking ? voiceChat.stopSpeaking() : void voiceChat.speak(messageId, text))}
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      aria-label={speaking ? "Stop reading this reply" : "Read this reply aloud"}
      aria-pressed={speaking}
    >
      {speaking ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
      {speaking ? "Stop" : "Listen"}
    </button>
    </div>
  );
}

/** Inline Voice Chat error under the composer. */
export function VoiceChatError() {
  const voiceChat = useVoiceChatControls();
  if (!voiceChat?.error) return null;
  return (
    <p role="alert" className="mx-auto mt-1 w-full max-w-3xl px-2 text-center text-[11px] text-destructive">
      {voiceChat.error}{" "}
      <button type="button" onClick={voiceChat.clearError} className="underline underline-offset-2">
        Dismiss
      </button>
    </p>
  );
}
