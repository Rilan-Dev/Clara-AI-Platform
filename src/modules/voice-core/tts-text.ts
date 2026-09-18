/**
 * src/modules/voice-core/tts-text.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure text sanitizer for everything that crosses the text-to-speech boundary.
 *
 * RAG answers arrive as markdown with inline citation tags ([S1], [S2], …)
 * because the chat pipeline prompts the model to cite sources that way.
 * Speaking that syntax aloud wastes vendor characters and sounds wrong
 * ("bullet … S one … S two"). This module strips everything that is meant
 * for the eye, not the ear, BEFORE the text is metered or dispatched.
 *
 * Server-side: tts.ts sanitizes + meters the cleaned text (single source of
 * truth for billing). Client-side: useElevenLabsVoice sanitizes again so
 * sentence splitting and the flush path never fire calls for citation-only
 * fragments (e.g. a trailing "[S2]" tail after the last real sentence).
 *
 * Pure module — no server-only imports — shared by both runtimes.
 */

/**
 * Citation tags emitted by the chat pipeline (chat.ts prompts the model to
 * append [S1]-style source markers; the validity check there is /\[(S\d+)]/g).
 */
const CITATION_TAG = /\[S\d+\]/g;

/** Markdown link [label](url) — keep the label, drop the URL. */
const MARKDOWN_LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/|\/)[^)\s]{0,500}\)/g;

/** Fenced code blocks — code read aloud is noise. */
const CODE_FENCE = /```[\s\S]*?(```|$)/g;

/** Inline code backticks — keep the content. */
const INLINE_CODE = /`([^`\n]{1,200})`/g;

/** Bold / italic emphasis markers (**x**, *x*, __x__, _x_). */
const BOLD = /(\*\*|__)(?=\S)([\s\S]{1,500}?\S)\1/g;
const ITALIC = /(\*|_)(?=\S)([\s\S]{1,500}?\S)\1/g;

/** Line-leading markdown structures: ATX headings, bullets, numbered items, blockquotes. */
const HEADING_LINE = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
const BULLET_LINE = /^[ \t]{0,3}[-*+][ \t]+/gm;
const NUMBERED_LINE = /^[ \t]{0,3}\d{1,3}[.)][ \t]+/gm;
const QUOTE_LINE = /^[ \t]{0,3}>[ \t]?/gm;

/** Leftover emphasis artifacts. */
const STRAY_EMPHASIS = /(\*\*|\*|__|_)(?= )/g;

/**
 * Sanitize answer text for speech synthesis.
 * Returns "" when nothing speakable remains (caller must skip the TTS call).
 */
export function sanitizeTtsText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(CITATION_TAG, " ")
    .replace(MARKDOWN_LINK, "$1")
    .replace(CODE_FENCE, " ")
    .replace(INLINE_CODE, "$1")
    .replace(HEADING_LINE, "")
    .replace(BULLET_LINE, "")
    .replace(NUMBERED_LINE, "")
    .replace(QUOTE_LINE, "")
    .replace(BOLD, "$2")
    .replace(ITALIC, "$2")
    .replace(STRAY_EMPHASIS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when an STT transcript carries no actual speech — Scribe annotates
 * non-speech audio as bracketed sound events ([heartbeat], [wind blowing],
 * [outro jingle]). Dispatching those to the chat pipeline wastes a full
 * RAG + chat + TTS cycle on background noise (observed in production HARs).
 */
const NON_SPEECH_TRANSCRIPT =
  /^(?:\[[^\]\n]{1,60}\][\s.,!?]*)+$/;

export function isNonSpeechTranscript(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return true;
  return NON_SPEECH_TRANSCRIPT.test(trimmed);
}
