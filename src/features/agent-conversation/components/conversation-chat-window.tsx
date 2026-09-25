"use client";

/**
 * Shared Clara conversation surface for Draft Preview and Published agents.
 *
 * UX model:
 * - Realtime is the primary experience: a large branded voice stage on the
 *   left/center and a live conversation rail on the right.
 * - Text remains a first-class mode and can be switched to without changing
 *   the underlying agent/provider session.
 * - The component is deliberately transport/provider agnostic. It only calls
 *   the existing start/end/send callbacks supplied by useAgentConversation.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  CornerDownLeft,
  Headphones,
  Mic,
  MessageSquare,
  Phone,
  Sparkles,
} from "lucide-react";
import { ConversationVoiceStage } from "./conversation-voice-stage";
import { RealtimeVoiceOrb } from "./realtime-voice-orb";
import { OrbComposer } from "./orb-composer";
import type { ConversationMessage, VoiceClientSession } from "../types";
import { ChatAnnouncer } from "@/components/ui/chat-announcer";

interface ConversationChatWindowProps {
  assistantName: string;
  avatarUrl?: string | null;
  primaryColour: string;
  accentColour: string;
  headerBadge?: React.ReactNode;
  headerAside?: React.ReactNode;
  welcomeMessage: string;
  messages: ConversationMessage[];
  thinking: boolean;
  chatError: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  sendDisabled?: boolean;
  placeholder?: string;
  suggestions?: string[];
  onSuggestion?: (value: string) => void;
  citeSources: boolean;
  voiceAvailable: boolean;
  voiceUnavailableReason?: string | null;
  onVoiceStart: () => void;
  voiceActive: boolean;
  voiceSession: VoiceClientSession | null;
  micLevels?: number[];
  onVoiceEnd: () => void;
  /** Published agents start voice-first and expose a single top-right mode toggle. */
  publishedMode?: boolean;
}

type ConversationMode = "voice" | "chat";

export function ConversationChatWindow({
  assistantName,
  avatarUrl,
  primaryColour,
  accentColour,
  headerBadge,
  headerAside,
  welcomeMessage,
  messages,
  thinking,
  chatError,
  input,
  onInputChange,
  onSend,
  sendDisabled,
  placeholder,
  suggestions,
  onSuggestion,
  citeSources,
  voiceAvailable,
  voiceUnavailableReason,
  onVoiceStart,
  voiceActive,
  voiceSession,
  micLevels,
  onVoiceEnd,
  publishedMode = false,
}: ConversationChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];
  const streaming = thinking || lastMessage?.role === "assistant";
  const [mode, setMode] = useState<ConversationMode>(publishedMode && voiceAvailable ? "voice" : voiceAvailable ? "voice" : "chat");

  useEffect(() => {
    if (!voiceAvailable && !voiceActive) setMode("chat");
    if (publishedMode && voiceAvailable && !voiceActive && mode !== "chat") setMode("voice");
  }, [voiceAvailable, voiceActive]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    if (nearBottom || thinking || voiceActive) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, thinking, voiceActive]);

  const canSend = !sendDisabled && input.trim().length > 0 && !thinking;
  const runtimeError = chatError?.trim() || null;

  const setConversationMode = (next: ConversationMode) => {
    if (voiceActive) return;
    if (next === "voice" && !voiceAvailable) return;
    setMode(next);
  };

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent">
      {publishedMode ? (
        <button
          type="button"
          onClick={() => setConversationMode(mode === "voice" ? "chat" : "voice")}
          disabled={!voiceAvailable || voiceActive}
          className="absolute right-4 top-4 z-30 inline-flex h-9 items-center gap-2 rounded-full bg-background/75 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-xl transition hover:bg-background disabled:cursor-default disabled:opacity-70"
          aria-label={mode === "voice" ? "Switch to chat" : "Switch to voice"}
        >
          {mode === "voice" ? <MessageSquare className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
          <span>{mode === "voice" ? "Switch to chat" : "Switch to voice"}</span>
        </button>
      ) : (
        <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-semibold text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              assistantName.trim().charAt(0).toUpperCase()
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{assistantName}</h2>
              {headerBadge}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {voiceActive
                ? "Realtime conversation"
                : mode === "voice"
                  ? "Talk naturally with your AI agent"
                  : thinking
                    ? "Searching the knowledge base…"
                    : "Chat grounded in your knowledge base"}
            </p>
          </div>

          {publishedMode ? (
            <button
              type="button"
              onClick={() => setConversationMode(mode === "voice" ? "chat" : "voice")}
              disabled={!voiceAvailable || voiceActive}
              className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-foreground transition hover:bg-muted/70 disabled:cursor-default disabled:opacity-70"
              aria-label={mode === "voice" ? "Switch to chat" : "Switch to voice"}
            >
              {mode === "voice" ? <MessageSquare className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
              <span>{mode === "voice" ? "Switch to chat" : "Switch to voice"}</span>
            </button>
          ) : (
            <div className="hidden items-center gap-1 rounded-xl bg-muted/40 p-1 sm:flex">
              <button type="button" onClick={() => setConversationMode("voice")} disabled={!voiceAvailable || voiceActive}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition ${mode === "voice" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"} disabled:cursor-default`}>
                <Headphones className="h-3.5 w-3.5" /> Voice
              </button>
              <button type="button" onClick={() => setConversationMode("chat")} disabled={voiceActive}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition ${mode === "chat" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"} disabled:cursor-default`}>
                <MessageSquare className="h-3.5 w-3.5" /> Chat
              </button>
            </div>
          )}

          {headerAside}
        </header>

      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {voiceActive && voiceSession ? (
            <motion.div
              key="voice-active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(15rem,38%)] lg:grid-cols-[minmax(0,1fr)_clamp(20rem,30vw,30rem)] lg:grid-rows-1"
            >
              <div className="relative min-h-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/30 px-4 py-5 sm:px-8 lg:border-b-0 lg:border-r">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-70"
                  style={{
                    background: `radial-gradient(32rem 22rem at 50% 45%, ${primaryColour}12, transparent 72%)`,
                  }}
                />
                <div className="relative h-full">
                  <ConversationVoiceStage
                    session={voiceSession}
                    micLevels={micLevels ?? []}
                    agentName={assistantName}
                    primaryColour={primaryColour}
                    accentColour={accentColour}
                    avatarUrl={avatarUrl}
                    onEnd={onVoiceEnd}
                    showTranscript={false}
                  />
                </div>
              </div>
              <ConversationRail
                liveOnly
                assistantName={assistantName}
                primaryColour={primaryColour}
                accentColour={accentColour}
                messages={messages}
                citeSources={citeSources}
                lastMessage={lastMessage}
                scrollRef={scrollRef}
                welcomeMessage={welcomeMessage}
                thinking={thinking}
                streaming={true}
                voiceActive
              />
            </motion.div>
          ) : mode === "voice" && voiceAvailable ? (
            <motion.div
              key="voice-lobby"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid h-full min-h-0 grid-cols-1"
            >
              <div className="relative flex min-h-0 h-full flex-col items-center justify-center overflow-hidden border-b border-border/70 bg-gradient-to-br from-background via-background to-muted/30 px-6 py-8 lg:border-b-0 lg:border-r">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(34rem 24rem at 50% 45%, ${primaryColour}16, transparent 70%), radial-gradient(28rem 18rem at 80% 100%, ${accentColour}10, transparent 72%)`,
                  }}
                />
                <div className="relative flex max-w-xl flex-col items-center text-center">
                  <span
                    className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium"
                    style={{ borderColor: `${primaryColour}35`, background: `${primaryColour}0d`, color: primaryColour }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: primaryColour }} />
                    Realtime voice ready
                  </span>
                  <motion.div
                    initial={{ scale: 0.94, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35 }}
                    className="mb-7"
                  >
                    <RealtimeVoiceOrb
                      state="idle"
                      micLevels={[]}
                      agentLevels={[]}
                      primaryColour={primaryColour}
                      accentColour={accentColour}
                      agentName={assistantName}
                      avatarUrl={avatarUrl}
                      size={360}
                    />
                  </motion.div>
                  <h3 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    Talk to {assistantName}
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    Start a realtime conversation and speak naturally. {assistantName} will listen,
                    think, and respond using the same knowledge base as chat.
                  </p>
                  <button
                    type="button"
                    onClick={onVoiceStart}
                    className="mt-7 inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-sm font-semibold text-white shadow-xl transition hover:scale-[1.02] hover:brightness-110 focus:outline-none focus:ring-4"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})`,
                      boxShadow: `0 12px 36px ${primaryColour}35`,
                    }}
                  >
                    <Phone className="h-4 w-4" />
                    Start conversation
                  </button>
                  <p className="mt-3 text-[11px] text-muted-foreground/70">
                    Your microphone will be requested when the session starts.
                  </p>
                  {runtimeError && (
                    <p role="alert" className="mt-3 max-w-md rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {runtimeError}
                    </p>
                  )}
                </div>
              </div>
           </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex h-full min-h-0 flex-col items-center px-3 pb-4 pt-3 sm:px-6 sm:pb-6"
            >
              <div className="flex h-full min-h-0 w-full max-w-4xl min-w-0 flex-col overflow-hidden bg-transparent">
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7" role="log" aria-label={`Conversation with ${assistantName}`} aria-live="polite">
                  <ChatAnnouncer
                    label={assistantName}
                    messages={messages.map((m) => ({ ...m, isStreaming: thinking && m.id === lastMessage?.id }))}
                  />
                  <div className="mx-auto w-full max-w-3xl space-y-4">
                    <WelcomeMessage
                      assistantName={assistantName}
                      primaryColour={primaryColour}
                      accentColour={accentColour}
                      welcomeMessage={welcomeMessage}
                    />
                    {messages.map((message) => (
                      <MessageRow
                        key={message.id}
                        message={message}
                        assistantName={assistantName}
                        primaryColour={primaryColour}
                        accentColour={accentColour}
                        citeSources={citeSources}
                        isLast={message.id === lastMessage?.id}
                        streamingAssistant={streaming && message.id === lastMessage?.id}
                      />
                    ))}
                    {thinking && <ThinkingRow primaryColour={primaryColour} accentColour={accentColour} />}
                    {messages.length === 0 && !welcomeMessage.trim() && (
                      <div className="flex min-h-full items-center justify-center py-12 text-center">
                        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                          Ask anything to start the conversation.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <OrbComposer
                  input={input}
                  onInputChange={onInputChange}
                  onSend={onSend}
                  canSend={canSend}
                  sendDisabled={sendDisabled}
                  placeholder={placeholder}
                  assistantName={assistantName}
                  voiceAvailable={voiceAvailable}
                  voiceUnavailableReason={voiceUnavailableReason}
                  onVoiceStart={onVoiceStart}
                  primaryColour={primaryColour}
                  accentColour={accentColour}
                  thinking={thinking}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function WelcomeMessage({
  assistantName,
  primaryColour,
  accentColour,
  welcomeMessage,
}: {
  assistantName: string;
  primaryColour: string;
  accentColour: string;
  welcomeMessage: string;
}) {
  if (!welcomeMessage.trim()) return null;
  return (
    <div className="flex gap-2.5">
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border/60 bg-muted/35 px-4 py-3 text-sm leading-relaxed text-foreground/90">
        {welcomeMessage}
      </div>
    </div>
  );
}

function ThinkingRow({ primaryColour, accentColour }: { primaryColour: string; accentColour: string }) {
  return (
    <div className="flex gap-2.5">
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border/60 bg-muted/40 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 140}ms` }} />
        ))}
      </div>
    </div>
  );
}

function ConversationRail({
  assistantName,
  primaryColour,
  accentColour,
  messages,
  citeSources,
  lastMessage,
  scrollRef,
  welcomeMessage,
  thinking,
  streaming,
  voiceActive,
  input,
  onInputChange,
  onSend,
  canSend,
  sendDisabled,
  placeholder,
  voiceAvailable,
  onVoiceStart,
  suggestions,
  onSuggestion,
  liveOnly = false,
}: {
  assistantName: string;
  primaryColour: string;
  accentColour: string;
  messages: ConversationMessage[];
  citeSources: boolean;
  lastMessage?: ConversationMessage;
  scrollRef: React.RefObject<HTMLDivElement>;
  welcomeMessage: string;
  thinking: boolean;
  streaming: boolean;
  voiceActive: boolean;
  input?: string;
  onInputChange?: (value: string) => void;
  onSend?: () => void;
  canSend?: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  voiceAvailable?: boolean;
  onVoiceStart?: () => void;
  suggestions?: string[];
  onSuggestion?: (value: string) => void;
  liveOnly?: boolean;
}) {
  return (
    <aside className="flex min-h-0 flex-col bg-background/75">
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/80">Conversation</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {voiceActive ? "Live transcript" : "Continue in chat anytime"}
          </p>
        </div>
        {voiceActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        ) : (
          <MessageSquare className="h-4 w-4 text-muted-foreground/60" />
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 max-h-[calc(100vh-7rem)] flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label={`Conversation with ${assistantName}`} aria-live="polite">
        <WelcomeMessage assistantName={assistantName} primaryColour={primaryColour} accentColour={accentColour} welcomeMessage={welcomeMessage} />
        {(liveOnly ? messages.slice(-2) : messages).map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            assistantName={assistantName}
            primaryColour={primaryColour}
            accentColour={accentColour}
            citeSources={citeSources}
            isLast={message.id === lastMessage?.id}
            streamingAssistant={streaming && message.id === lastMessage?.id}
          />
        ))}
        {thinking && <ThinkingRow primaryColour={primaryColour} accentColour={accentColour} />}
        {messages.length === 0 && !welcomeMessage.trim() && (
          <div className="flex h-full min-h-40 items-center justify-center px-4 text-center">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {voiceActive ? `Speak to ${assistantName} to start the live transcript.` : "Your chat history will appear here."}
              </p>
            </div>
          </div>
        )}
      </div>

      {!voiceActive && input !== undefined && onInputChange && onSend && (
        <div className="shrink-0 border-t border-border/70 bg-muted/20 p-3">
          {suggestions && suggestions.length > 0 && messages.length === 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 3).map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => onSuggestion?.(suggestion)} className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground">
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <Composer
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            canSend={Boolean(canSend)}
            sendDisabled={sendDisabled}
            placeholder={placeholder}
            voiceAvailable={Boolean(voiceAvailable)}
            voiceUnavailableReason={voiceAvailable ? null : "Realtime voice is unavailable for this agent."}
            onVoiceStart={onVoiceStart}
            primaryColour={primaryColour}
            accentColour={accentColour}
            compact
          />
        </div>
      )}
    </aside>
  );
}

function Composer({
  input,
  onInputChange,
  onSend,
  canSend,
  sendDisabled,
  placeholder,
  voiceAvailable,
  voiceUnavailableReason,
  onVoiceStart,
  primaryColour = "var(--primary)",
  accentColour = "var(--accent)",
  compact = false,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  voiceAvailable: boolean;
  voiceUnavailableReason?: string | null;
  onVoiceStart?: () => void;
  primaryColour?: string;
  accentColour?: string;
  compact?: boolean;
}) {
  const submitOnEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className={compact ? "px-0 pb-1 pt-2" : "px-0 pb-2 pt-3 sm:pb-3"}>
      <div
        className={
          compact
            ? "mx-auto w-full"
            : "mx-auto w-full max-w-3xl"
        }
      >
        <div className="relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-none transition-colors focus-within:border-primary/40">
          <textarea
            aria-label="Message the assistant"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={submitOnEnter}
            rows={1}
            disabled={sendDisabled}
            placeholder={sendDisabled ? "Chat unavailable" : (placeholder ?? "Ask anything")}
            className="min-h-[3.25rem] max-h-32 w-full resize-none bg-transparent px-4 pb-2 pt-3.5 pr-4 text-sm leading-6 text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/75 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
            <span className="min-w-0 flex-1 truncate px-1 text-[11px] text-muted-foreground/65">
              {compact ? "Enter to send · Shift+Enter for a new line" : "Enter to send · Shift+Enter for a new line"}
            </span>

            {voiceAvailable && onVoiceStart ? (
              <button
                type="button"
                onClick={onVoiceStart}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/65 transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                title="Start realtime voice"
                aria-label="Start realtime voice"
              >
                <Mic className="h-4 w-4" />
              </button>
            ) : voiceUnavailableReason ? (
              <button
                type="button"
                disabled
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/35"
                title={voiceUnavailableReason}
                aria-label="Voice unavailable"
              >
                <Mic className="h-4 w-4" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ background: canSend ? `linear-gradient(135deg, ${primaryColour}, ${accentColour})` : "var(--muted-foreground)" }}
              aria-label="Send message"
            >
              <CornerDownLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {!compact && (
        <p className="mx-auto mt-1.5 w-full max-w-3xl px-1 text-[11px] text-muted-foreground/60">
          {voiceAvailable ? "Mic starts realtime voice" : "Voice unavailable"}
        </p>
      )}
    </div>
  );
}

// ─── Message row ─────────────────────────────────────────────────────────────

function MessageRow({
  message,
  assistantName,
  primaryColour,
  accentColour,
  citeSources,
  isLast,
  streamingAssistant,
}: {
  message: ConversationMessage;
  assistantName: string;
  primaryColour: string;
  accentColour: string;
  citeSources: boolean;
  isLast: boolean;
  streamingAssistant: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}>
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    );
  }

  const visibleSources = (message.sources ?? []).slice(0, 4);

  return (
    <div className="flex gap-2.5">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
      >
        {(assistantName?.trim()?.charAt(0)?.toUpperCase() ?? "A")}
      </div>
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tl-md border border-border/60 bg-muted/30 px-4 py-2.5 text-sm leading-relaxed text-foreground">
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
          {streamingAssistant && (
            <span
              className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse rounded-sm align-baseline"
              style={{ background: accentColour }}
            />
          )}
        </div>
        {citeSources && visibleSources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
            <span className="text-[11px] font-medium text-muted-foreground/80">Sources:</span>
            {visibleSources.map((source, i) => (
              <span
                key={`${message.id}-s-${i}`}
                title={`${source.title}${source.snippet ? ` — ${source.snippet.slice(0, 160)}` : ""}`}
                className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                <span className="truncate">{source.title}</span>
              </span>
            ))}
            {(message.sources?.length ?? 0) > 4 && (
              <span className="text-[11px] text-muted-foreground/70">
                +{(message.sources?.length ?? 0) - 4} more
              </span>
            )}
          </div>
        )}
        {message.origin === "voice" && isLast && (
          <span className="ml-1 text-[11px] uppercase tracking-wider text-muted-foreground/80">spoken</span>
        )}
      </div>
    </div>
  );
}
