"use client";

import { useEffect, useRef, useState } from "react";

import { useAudioVisualizer } from "@/modules/assistant/core";
import { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";
import type { LanguagePreferences } from "@/modules/assistant/core/config";
import type { VoiceTurn, VoiceStatus } from "@/modules/assistant/core/voice/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─── Shared prop types ─────────────────────────────────────────────────────────

type Props = {
  documentId?: string | null;
  kbId?: string | null;
  overviewContext?: string;
  voiceGreeting?: string;
  language?: LanguagePreferences;
  suggestedPrompts?: string[];
  embedApiKey?: string;
  onClose: () => void;
};

// The normalised interface both inner hooks conform to after our updates.
type VoiceSessionState = {
  provider: "openai" | "gemini" | "elevenlabs" | "sarvam";
  status: VoiceStatus;
  error: string | null;
  isSpeaking: boolean;
  history: VoiceTurn[];
  connect: () => void | Promise<void>;
  disconnect: () => void;
  interrupt: () => void;
  sendText: (text: string) => void;
  remoteAudioStream: MediaStream | null;
  outputAnalyserNode: AnalyserNode | null;
};

export default function VoiceChatModal(props: Props) {
  const { documentId, kbId, overviewContext, voiceGreeting, language, suggestedPrompts,
    embedApiKey,
    onClose } = props;

  const session = useVoiceClient({
    documentId,
    kbId,
    documentOverview: overviewContext,
    voiceGreeting,
    language,
    embedApiKey,
  });

  return (
    <VoiceModalShell
      {...props}
      session={session}
      suggestedPrompts={suggestedPrompts}
      onClose={onClose}
    />
  );
}

// ─── Shared UI shell ──────────────────────────────────────────────────────────
//
// Both OpenAIVoiceModal and GeminiVoiceModal render this identical UI.
// It receives a normalised VoiceSessionState so it has no knowledge of which
// provider is active.

type ShellProps = Props & {
  session: VoiceSessionState;
};

function VoiceModalShell({
  documentId,
  kbId,
  overviewContext,
  suggestedPrompts,
  onClose,
  session,
}: ShellProps) {
  const { status, error, isSpeaking, history, connect, disconnect, interrupt, sendText, remoteAudioStream, outputAnalyserNode } = session;

  // ── Stable refs for connect / disconnect ─────────────────────────────────
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  useEffect(() => { connectRef.current = connect; }, [connect]);
  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  const sessionReadyRef = useRef(false);
  // Voice mode works with either a KB (preferred) or a single document (legacy)
  const hasSession = Boolean(kbId) || Boolean(documentId);

  // Audio visualizer:
  //  • OpenAI:  reads from remoteAudioStream (WebRTC MediaStream)
  //  • Gemini:  reads from outputAnalyserNode (real playback-chain AnalyserNode)
  // The hook's AnalyserNode fast-path is used for Gemini, avoiding the
  // cross-AudioContext connection error that the old approach caused.
  const visualizerInput = hasSession
    ? (outputAnalyserNode ?? remoteAudioStream)
    : null;
  const levels = useAudioVisualizer(visualizerInput);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  // ── Auto-connect on mount (StrictMode-safe) ───────────────────────────────
  useEffect(() => {
    if (!hasSession) {
      if (sessionReadyRef.current) {
        sessionReadyRef.current = false;
        disconnectRef.current?.();
      }
      return;
    }

    if (sessionReadyRef.current) return;

    let cancelled = false;
    sessionReadyRef.current = true;

    void (async () => {
      try {
        await connectRef.current?.();
      } catch (err) {
        if (!cancelled) {
          console.error("[VoiceChatModal] connect error:", err);
          sessionReadyRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (sessionReadyRef.current) {
        sessionReadyRef.current = false;
        disconnectRef.current?.();
      }
    };
  }, [hasSession]);

  // ── Remote audio playback (OpenAI only — Gemini plays via WebAudio) ───────
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    if (!remoteAudioStream) {
      if (element.srcObject) {
        try { element.pause(); } catch {}
        element.srcObject = null;
      }
      setAutoplayBlocked(false);
      return;
    }

    if (element.srcObject === remoteAudioStream) return;

    try { element.pause(); } catch {}
    element.srcObject = remoteAudioStream;
    element.muted = false;

    void element.play().catch((err: unknown) => {
      if ((err as DOMException)?.name === "NotAllowedError") {
        setAutoplayBlocked(true);
      }
    });
  }, [remoteAudioStream]);

  useEffect(() => {
    if (history.length === 0) {
      setExpandedAnswers({});
      setExpandedCitations({});
    }
  }, [history.length]);

  const toggleAnswer = (id: string) =>
    setExpandedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleCitations = (id: string) =>
    setExpandedCitations((prev) => ({ ...prev, [id]: !prev[id] }));

  const connected = status === "connected";
  const isError = status === "error";
  const statusLabel =
    connected ? "Connected"
    : status === "connecting" ? "Connecting..."
    : isError ? "Error"
    : "Idle";

  const overviewSnippetRaw = overviewContext?.trim();
  const overviewSnippet =
    overviewSnippetRaw && overviewSnippetRaw.length > 220
      ? `${overviewSnippetRaw.slice(0, 220)}...`
      : overviewSnippetRaw;

  const isGemini = session.provider === "gemini";
  // Real analyser data is now available for both providers — use levels directly.
  const displayLevels = levels;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[color:var(--color-foreground)]">
            Clara Voice
          </span>
          <span className="text-[11px] uppercase tracking-[0.25em] text-[color:var(--color-muted-foreground)]">
            {isGemini ? "Gemini Live" : "OpenAI Live"} · RAG
          </span>
        </div>
      }
    >
      <div className={`grid gap-6 ${hasSession ? "md:grid-cols-2" : ""}`}>
        {hasSession ? (
          <>
            {/* ── Left card — status + controls ─────────────────────────── */}
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[color:var(--color-foreground)]">Session</span>
                  <span className="relative ml-2 inline-flex h-2 w-2">
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        connected
                          ? "animate-ping bg-emerald-400/40"
                          : status === "connecting"
                          ? "animate-ping bg-amber-400/40"
                          : "bg-rose-400/40"
                      }`}
                    />
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        connected
                          ? "bg-emerald-400"
                          : status === "connecting"
                          ? "bg-amber-400"
                          : "bg-rose-400"
                      }`}
                    />
                  </span>
                  <span className="text-[11px] text-[color:var(--color-muted-foreground)]">
                    {statusLabel}
                  </span>
                </div>
                {overviewSnippet && (
                  <CardDescription className="line-clamp-3 text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
                    {overviewSnippet}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Error banner */}
                {error && (
                  <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-200">
                    {error}
                  </p>
                )}

                {/* Autoplay-blocked banner (OpenAI only — Gemini uses WebAudio) */}
                {autoplayBlocked && !isGemini && (
                  <button
                    type="button"
                    onClick={() => {
                      const el = audioRef.current;
                      if (!el) return;
                      void el
                        .play()
                        .then(() => setAutoplayBlocked(false))
                        .catch(() => {});
                    }}
                    className={[
                      "flex w-full items-center justify-center gap-2 rounded-xl",
                      "border border-amber-400/40 bg-amber-400/10 px-4 py-3",
                      "text-sm font-semibold text-amber-700 dark:text-amber-300",
                      "hover:bg-amber-400/20 transition-colors cursor-pointer",
                    ].join(" ")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905H6.44l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zm5.457 3.463a.75.75 0 011.06 1.06 7.5 7.5 0 010 10.598.75.75 0 11-1.06-1.06 6 6 0 000-8.478.75.75 0 010-1.06zm-2.122 2.122a.75.75 0 011.061 1.06 4.5 4.5 0 010 6.364.75.75 0 01-1.06-1.06 3 3 0 000-4.243.75.75 0 010-1.061z" />
                    </svg>
                    Tap to enable audio
                  </button>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant={connected ? "outline" : "secondary"}
                    onClick={connected ? disconnect : connect}
                  >
                    {connected ? "Disconnect" : "Connect"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={interrupt}
                    disabled={!isSpeaking}
                    title="Interrupt speaking"
                  >
                    Interrupt
                  </Button>
                </div>

                {suggestedPrompts && suggestedPrompts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-muted-foreground)]">
                      Suggested starters
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {suggestedPrompts.slice(0, 6).map((prompt) => (
                        <Button
                          key={prompt}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto w-full min-w-0 justify-start whitespace-normal break-words hyphens-auto text-left text-sm leading-snug py-2"
                          disabled={!connected}
                          onClick={() => connected && sendText(prompt)}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Right card — audio visualizer ─────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xs uppercase tracking-[0.35em] text-[color:var(--color-muted-foreground)]">
                  Audio visualizer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 w-full items-end justify-center gap-1 rounded-xl bg-gradient-to-b from-[color:var(--color-muted)]/60 to-[color:var(--color-card)] p-3">
                  {displayLevels.map((value, index) => (
                    <div
                      key={index}
                      className="w-2 rounded-t bg-gradient-to-t from-cyan-500/70 via-sky-400/70 to-blue-400/80 shadow-[0_0_12px_rgba(14,165,233,0.35)] transition-all duration-150"
                      style={{ height: `${Math.max(6, value * 100)}%` }}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-[color:var(--color-muted-foreground)]">
                  {isSpeaking
                    ? "Clara is speaking..."
                    : connected
                    ? "Waiting for the next turn..."
                    : ""}
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="border border-[color:var(--color-border)] bg-[color:var(--color-card)]/70">
            <CardHeader className="space-y-2">
              <CardTitle className="text-base font-semibold text-[color:var(--color-foreground)]">
                Select a knowledge base to start voice mode
              </CardTitle>
              <CardDescription className="text-sm text-[color:var(--color-muted-foreground)]">
                Voice mode needs an active knowledge base so every answer can be
                cited. Use the <strong>Choose KB…</strong> dropdown in the
                assistant panel and reopen voice mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[color:var(--color-muted-foreground)]">
              <p>
                Tip: select any knowledge base that has ready documents — the AI
                will automatically search across all documents in that KB when
                you speak.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Conversation turns ─────────────────────────────────────────────── */}
      {hasSession && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-[0.35em] text-[color:var(--color-muted-foreground)]">
                Turns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 overflow-y-auto pr-1">
                {history.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-muted-foreground)]">
                    {connected
                      ? "Ask a question to get started."
                      : "Waiting for connection..."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((turn, index) => {
                      const isAnswerOpen = !!expandedAnswers[turn.id];
                      const isCitationOpen = !!expandedCitations[turn.id];
                      const label =
                        turn.status === "speaking"
                          ? "Speaking"
                          : turn.status === "pending"
                          ? "Composing"
                          : "Complete";
                      const badgeClasses =
                        turn.status === "speaking"
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                          : turn.status === "pending"
                          ? "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                          : "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
                      const answerText =
                        turn.answer.trim() ||
                        (turn.status === "speaking"
                          ? "Streaming response..."
                          : turn.status === "pending"
                          ? "Preparing answer..."
                          : "No answer generated.");

                      return (
                        <div
                          key={turn.id}
                          className="space-y-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3"
                        >
                          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-muted-foreground)]">
                            <span>Turn {index + 1}</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClasses}`}
                            >
                              {label}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-muted-foreground)]">
                                Question
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--color-foreground)]">
                                {turn.question || (
                                  <span className="italic text-[color:var(--color-muted-foreground)]">
                                    Transcribing…
                                  </span>
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-muted-foreground)]">
                                Response
                              </p>
                              <div
                                className={`mt-1 w-full text-sm text-[color:var(--color-foreground)] ${
                                  isAnswerOpen ? "whitespace-pre-wrap" : "truncate"
                                } ${turn.status === "speaking" ? "animate-pulse" : ""}`}
                                title={isAnswerOpen ? undefined : answerText}
                              >
                                {answerText}
                              </div>
                              {turn.answer.trim().length > 120 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => toggleAnswer(turn.id)}
                                >
                                  {isAnswerOpen ? "Collapse answer" : "Expand answer"}
                                </Button>
                              )}
                            </div>

                            {turn.sources.length > 0 && (
                              <div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleCitations(turn.id)}
                                >
                                  {isCitationOpen
                                    ? "Hide citations"
                                    : `Show citations (${turn.sources.length})`}
                                </Button>
                                {isCitationOpen ? (
                                  <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1">
                                    {turn.sources.map((source, sourceIndex) => (
                                      <div
                                        key={source.id}
                                        className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-2 text-xs text-[color:var(--color-foreground)]"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-medium text-sky-600 dark:text-sky-300">
                                            [S{sourceIndex + 1}] {source.title}
                                          </span>
                                          {source.url && (
                                            <a
                                              href={source.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-[10px] text-sky-600 hover:underline dark:text-sky-300"
                                            >
                                              View
                                            </a>
                                          )}
                                        </div>
                                        <p className="mt-1 text-[11px] text-[color:var(--color-muted-foreground)]">
                                          {source.snippet}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-1 text-[11px] text-[color:var(--color-muted-foreground)]">
                                    {turn.sources
                                      .map((_, idx) => `[S${idx + 1}]`)
                                      .join(" ")}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-[color:var(--color-muted-foreground)]">
                <p>
                  {connected
                    ? "Speak to add a new turn. Clara cites sources from the active knowledge base."
                    : "Connect to begin."}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={interrupt}
                  disabled={!isSpeaking}
                  title="Interrupt speaking"
                >
                  Interrupt
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hidden audio element — used by OpenAI path only (srcObject = MediaStream).
          Gemini plays audio internally via the WebAudio API; this element stays
          empty for Gemini sessions. */}
      <audio ref={audioRef} className="hidden" />
    </Modal>
  );
}
