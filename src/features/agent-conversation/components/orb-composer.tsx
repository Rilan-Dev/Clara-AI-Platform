"use client";

/**
 * src/features/agent-conversation/components/orb-composer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The orb composer — the chat-mode input for Draft Preview and Published
 * agents, built on the "OrbInput" interaction model supplied by the platform
 * owner:
 *
 *   • a living orb docked to the left of the field,
 *   • a typewriter placeholder that types character-by-character, pauses,
 *     then advances to the next prompt phrase,
 *   • a pill-shaped field that gently scales and glows when focused.
 *
 * Production adaptations over the reference snippet (deliberate — owner
 * direction: professional, theme-matched, provider-neutral):
 *
 *   • The orb is rendered in pure CSS from the agent's published brand
 *     colours (rotating conic shimmer ring + breathing glow + gradient core).
 *     The reference mock loaded a GIF from a third-party component CDN — an
 *     external single point of failure for every published agent page that
 *     also cannot inherit per-agent branding. Keyframes are the shared
 *     clara-orb-* engine from globals.css, so reduced-motion users get the
 *     animations disabled automatically.
 *   • The field keeps the textarea semantics of the previous composer:
 *     Enter sends, Shift+Enter adds a line, auto-grows to ~5 lines, and the
 *     pill softens its radius when the message spans multiple lines.
 *   • Voice entry stays first-class: the mic button starts the exact same
 *     realtime session as the voice lobby (identical onVoiceStart contract),
 *     and the send button keeps the previous canSend gating.
 *   • Theme tokens (bg-card / border-border / text-foreground) keep the pill
 *     legible in light and dark mode; the reference mock was dark-only.
 *
 * This component is purely presentational: it never touches the conversation
 * hook, the chat stream, or any provider path, so every AI provider behind
 * /api/embed/chat is unaffected by construction.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Typewriter placeholder ─────────────────────────────────────────────────

/** ms between characters while typing a phrase. */
const CHAR_DELAY = 75;
/** ms to linger on a fully typed phrase before advancing. */
const IDLE_DELAY_AFTER_FINISH = 2200;

/**
 * Character-by-character typewriter over a list of phrases, mirroring the
 * owner-supplied OrbInput example (type → brief pause → next phrase, loop).
 *
 * `enabled === false` (send disabled, or prefers-reduced-motion) collapses to
 * the first phrase rendered statically — no interval, no cycling.
 */
function useTypewriterPlaceholder(phrases: string[], enabled: boolean) {
  const [index, setIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear stale timers first (also guards StrictMode double-invoke in dev).
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!enabled) {
      setDisplayedText(phrases[0] ?? "");
      setIsTyping(false);
      return;
    }

    const current = phrases[index % phrases.length];
    if (!current) {
      setDisplayedText("");
      setIsTyping(false);
      return;
    }

    const chars = Array.from(current);
    setDisplayedText("");
    setIsTyping(true);

    let charIndex = 0;
    intervalRef.current = window.setInterval(() => {
      if (charIndex < chars.length) {
        // Derived slice — never appends partial/undefined state.
        setDisplayedText(chars.slice(0, charIndex + 1).join(""));
        charIndex += 1;
      } else {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsTyping(false);
        timeoutRef.current = window.setTimeout(() => {
          setIndex((prev) => (prev + 1) % phrases.length);
        }, IDLE_DELAY_AFTER_FINISH);
      }
    }, CHAR_DELAY);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [index, phrases, enabled]);

  return { displayedText, isTyping };
}

/** prefers-reduced-motion, resolved post-mount to keep SSR markup identical. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// ─── The orb ────────────────────────────────────────────────────────────────

/**
 * Pure-CSS brand orb — breathing glow, slowly rotating conic shimmer ring and
 * a gradient core, all tinted from the agent's published colours. `active`
 * (assistant is thinking) adds an outward ripple so the orb doubles as a
 * subtle status cue, echoing the realtime voice orb's visual language.
 */
function ComposerOrb({
  primaryColour,
  accentColour,
  active,
}: {
  primaryColour: string;
  accentColour: string;
  active: boolean;
}) {
  return (
    <div aria-hidden className="relative h-11 w-11 shrink-0 select-none sm:h-14 sm:w-14">
      {/* Ambient breathing glow (clara-orb-breathe handles centering). */}
      <div
        className="clara-orb-breathe absolute left-1/2 top-1/2 h-[78%] w-[78%] rounded-full blur-lg"
        style={{
          background: `radial-gradient(circle, ${primaryColour}59, ${accentColour}26 62%, transparent 78%)`,
          opacity: active ? 0.95 : 0.55,
        }}
      />
      {/* Rotating conic shimmer ring. */}
      <div
        className="clara-orb-spin-cw absolute inset-0 rounded-full"
        style={{
          animationDuration: "9s",
          background: `conic-gradient(from 0deg, ${primaryColour}00, ${primaryColour}b3, ${accentColour}b3, ${primaryColour}00)`,
          WebkitMaskImage:
            "radial-gradient(circle, transparent 56%, black 59%, black 78%, transparent 81%)",
          maskImage:
            "radial-gradient(circle, transparent 56%, black 59%, black 78%, transparent 81%)",
        }}
      />
      {/* Gradient core. */}
      <div
        className="absolute inset-[24%] rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${accentColour}, ${primaryColour} 72%)`,
          boxShadow: `inset 0 1px 2px rgba(255,255,255,0.35), 0 2px 10px ${primaryColour}40`,
        }}
      />
      {/* Thinking ripple. */}
      {active && (
        <div
          className="clara-orb-ripple absolute inset-0 rounded-full border-2"
          style={{ borderColor: primaryColour }}
        />
      )}
    </div>
  );
}

// ─── Composer ───────────────────────────────────────────────────────────────

interface OrbComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  assistantName: string;
  voiceAvailable: boolean;
  voiceUnavailableReason?: string | null;
  onVoiceStart?: () => void;
  primaryColour?: string;
  accentColour?: string;
  /** Assistant is generating — drives the orb's thinking ripple. */
  thinking?: boolean;
}

export function OrbComposer({
  input,
  onInputChange,
  onSend,
  canSend,
  sendDisabled = false,
  placeholder,
  assistantName,
  voiceAvailable,
  voiceUnavailableReason,
  onVoiceStart,
  primaryColour = "var(--primary)",
  accentColour = "var(--accent)",
  thinking = false,
}: OrbComposerProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reducedMotion = usePrefersReducedMotion();

  // Prompt phrases rotate the owner-supplied OrbInput prompts around the
  // agent's own baseline placeholder.
  const phrases = useMemo(() => {
    const base = (placeholder ?? "Ask anything").trim() || "Ask anything";
    return [
      base,
      "What's on your mind?",
      `How can ${assistantName} help you?`,
      "What would you like to know?",
    ];
  }, [placeholder, assistantName]);

  const typewriterEnabled = !sendDisabled && !reducedMotion;
  const { displayedText, isTyping } = useTypewriterPlaceholder(phrases, typewriterEnabled);

  const staticPlaceholder = sendDisabled ? "Chat unavailable" : (placeholder ?? "Ask anything");
  const livePlaceholder = `${displayedText}${isTyping ? "|" : ""}` || staticPlaceholder;

  // Auto-grow the textarea and relax the pill radius for multi-line drafts.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const natural = el.scrollHeight;
    el.style.height = `${Math.min(natural, 132)}px`;
    setIsMultiLine(natural > 48 || input.includes("\n"));
  }, [input]);

  const submitOnEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="px-0 pb-2 pt-3 sm:pb-3">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={cn(
            "relative flex w-full items-center gap-2.5 border bg-card px-2.5 py-2 shadow-lg transition-all duration-300 ease-out sm:gap-4 sm:px-4 sm:py-2.5",
            isMultiLine ? "rounded-[1.75rem]" : "rounded-full",
            isFocused
              ? "scale-[1.01] border-primary/45 shadow-xl"
              : "border-border/70 shadow-black/[0.04] dark:shadow-black/20",
          )}
          style={
            isFocused
              ? { boxShadow: `0 10px 34px ${primaryColour}30` }
              : undefined
          }
        >
          <ComposerOrb
            primaryColour={primaryColour}
            accentColour={accentColour}
            active={thinking}
          />

          <div className="h-9 w-px shrink-0 bg-border/80 sm:h-11" />

          <textarea
            ref={textareaRef}
            data-testid="orb-input"
            aria-label={`Message ${assistantName}`}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={submitOnEnter}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            rows={1}
            disabled={sendDisabled}
            placeholder={livePlaceholder}
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-11 max-h-32 w-full flex-1 resize-none self-center bg-transparent px-1.5 text-base leading-6 text-foreground outline-none placeholder:font-light placeholder:text-muted-foreground/75 disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg"
          />

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {voiceAvailable && onVoiceStart ? (
              <button
                type="button"
                onClick={onVoiceStart}
                className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/65 transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-11 sm:w-11"
                title="Start realtime voice"
                aria-label="Start realtime voice"
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>
            ) : voiceUnavailableReason ? (
              <button
                type="button"
                disabled
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/35 sm:h-11 sm:w-11"
                title={voiceUnavailableReason}
                aria-label="Voice unavailable"
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-30 sm:h-11 sm:w-11"
              style={{
                background: canSend
                  ? `linear-gradient(135deg, ${primaryColour}, ${accentColour})`
                  : "var(--muted-foreground)",
              }}
              aria-label="Send message"
            >
              <CornerDownLeft className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <p className="mx-auto mt-1.5 w-full max-w-3xl px-2 text-center text-[11px] text-muted-foreground/60">
          {voiceAvailable
            ? "Enter to send · Shift+Enter for a new line · Mic starts realtime voice"
            : "Enter to send · Shift+Enter for a new line"}
        </p>
      </div>
    </div>
  );
}
