"use client";

/**
 * src/features/agent-conversation/components/conversation-chat-window.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The chat window shared by the draft preview and the published page.
 *
 * VOICE CHAT LIVES INSIDE THIS WINDOW (not in a separate modal): the composer
 * carries a mic button that starts the realtime voice session, and while the
 * session is active the message area is replaced — with a cross-fade — by the
 * ConversationVoiceStage. Ending the session folds the spoken turns back into
 * the message list so the conversation continues seamlessly as text.
 *
 * The window is transport-agnostic: the parent screen owns the message state,
 * the chat streaming call and the voice session hook; this component only
 * renders them and reports user intents.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CornerDownLeft, Mic, Sparkles } from "lucide-react";
import { ConversationVoiceStage } from "./conversation-voice-stage";
import type { ConversationMessage, VoiceClientSession } from "../types";
import { ChatAnnouncer } from "@/components/ui/chat-announcer";

interface ConversationChatWindowProps {
  assistantName: string;
  avatarUrl?: string | null;
  primaryColour: string;
  accentColour: string;
  /** Chip rendered in the header (e.g. "Draft · Live KB" / "Published v3"). */
  headerBadge?: React.ReactNode;
  /** Extra header content (right side). */
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
  /** Voice integration. */
  voiceAvailable: boolean;
  voiceUnavailableReason?: string | null;
  onVoiceStart: () => void;
  voiceActive: boolean;
  voiceSession: VoiceClientSession | null;
  micLevels?: number[];
  onVoiceEnd: () => void;
}

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
}: ConversationChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messages[messages.length - 1];
  const streaming = thinking || lastMessage?.role === "assistant";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom || thinking) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, thinking, voiceActive]);

  const canSend = !sendDisabled && input.trim().length > 0 && !thinking;

  return (
    <section className="flex h-full min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl shadow-black/[0.04]">
      {/* ── Window header ──────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-muted/40 to-transparent px-4 py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            (assistantName?.trim()?.charAt(0)?.toUpperCase() ?? "A")
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{assistantName}</h2>
            {headerBadge}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {voiceActive
              ? "Realtime voice session in progress"
              : thinking
                ? "Searching the knowledge base…"
                : "Answers grounded in your knowledge base"}
          </p>
        </div>
        {headerAside}
      </header>

      {/* ── Body: chat messages OR the in-window voice stage ───────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {voiceActive && voiceSession ? (
            <motion.div
              key="voice-stage"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,30rem)]"
            >
              <div className="min-h-0 border-b border-border/70 bg-gradient-to-br from-background via-background to-muted/30 px-4 py-3 sm:px-6 lg:border-b-0 lg:border-r">
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
              <aside className="flex min-h-0 flex-col bg-muted/10">
                <div className="border-b border-border/70 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Conversation</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      Live
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Your realtime conversation appears here.</p>
                </div>
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label={`Realtime conversation with ${assistantName}`} aria-live="polite">
                  {messages.length > 0 ? messages.map((message) => (
                    <MessageRow
                      key={message.id}
                      message={message}
                      assistantName={assistantName}
                      primaryColour={primaryColour}
                      accentColour={accentColour}
                      citeSources={citeSources}
                      isLast={message.id === lastMessage?.id}
                      streamingAssistant={false}
                    />
                  )) : (
                    <div className="flex h-full items-center justify-center text-center">
                      <div>
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Speak to {assistantName} to start the live transcript.</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-border/70 bg-background/60 px-4 py-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Voice is live. Use the controls on the main stage to mute, interrupt, or end the session.
                  </p>
                </div>
              </aside>
            </motion.div>
          ) : (
            <motion.div
              key="chat-stage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Message list */}
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6" role="log" aria-label={`Conversation with ${assistantName}`} aria-live="off">
                <ChatAnnouncer
                  label={assistantName}
                  messages={messages.map((m) => ({ ...m, isStreaming: thinking && m.id === lastMessage?.id }))}
                />
                {/* Welcome bubble */}
                {welcomeMessage.trim() && (
                  <div className="flex gap-2.5">
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border/60 bg-muted/40 px-4 py-2.5 text-sm leading-relaxed text-foreground/90">
                      {welcomeMessage}
                    </div>
                  </div>
                )}

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

                {thinking && (
                  <div className="flex gap-2.5">
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
                    >
                      {(assistantName?.trim()?.charAt(0)?.toUpperCase() ?? "A")}
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border/60 bg-muted/40 px-4 py-3">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                          style={{ animationDelay: `${i * 140}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {messages.length === 0 && !welcomeMessage.trim() && (
                  <p className="pt-10 text-center text-sm text-muted-foreground">
                    Start the conversation — ask anything covered by the knowledge base.
                  </p>
                )}
              </div>

              {/* Chat error */}
              {chatError && (
                <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:mx-6">
                  {chatError}
                </div>
              )}

              {/* Suggestions */}
              {suggestions && suggestions.length > 0 && messages.length === 0 && (
                <div className="flex flex-wrap gap-2 px-4 pb-2 sm:px-6">
                  {suggestions.slice(0, 4).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => onSuggestion?.(suggestion)}
                      className="rounded-full border border-border/70 bg-muted/30 px-3.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* ── Composer: text + voice ──────────────────────────────── */}
              <div className="border-t border-border/70 bg-muted/20 px-3 py-3 sm:px-4">
                <div className="flex items-end gap-2">
                  <div className="relative flex-1">
                    <textarea
                      aria-label={`Message ${assistantName}`}
                      value={input}
                      onChange={(e) => onInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (canSend) onSend();
                        }
                      }}
                      rows={1}
                      disabled={sendDisabled}
                      placeholder={sendDisabled ? "Chat unavailable" : (placeholder ?? `Message ${assistantName}…`)}
                      className="max-h-32 min-h-[2.75rem] w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 pr-11 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {canSend && (
                      <button
                        type="button"
                        onClick={onSend}
                        className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-white shadow transition hover:brightness-110"
                        style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
                        aria-label="Send message"
                      >
                        <CornerDownLeft className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Mic — starts the realtime voice session INSIDE this window. */}
                  {voiceAvailable ? (
                    <button
                      type="button"
                      onClick={onVoiceStart}
                      className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/40"
                      style={{ background: `linear-gradient(135deg, ${primaryColour}, ${accentColour})` }}
                      title="Start realtime voice session in this chat window"
                      aria-label="Start realtime voice session"
                    >
                      <Mic className="h-5 w-5" />
                      <span
                        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition group-hover:opacity-100"
                        style={{ boxShadow: `0 0 0 4px ${accentColour}33` }}
                      />
                    </button>
                  ) : voiceUnavailableReason ? (
                    <span
                      className="flex h-11 items-center justify-center rounded-xl border border-dashed border-border px-3 text-xs text-muted-foreground"
                      title={voiceUnavailableReason}
                    >
                      <Mic className="mr-1.5 h-4 w-4 opacity-50" />
                      Voice off
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 px-1 text-[11px] text-muted-foreground/70">
                  {voiceAvailable
                    ? "Enter to send · Shift+Enter for a new line · Mic for realtime voice"
                    : "Enter to send · Shift+Enter for a new line"}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
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
