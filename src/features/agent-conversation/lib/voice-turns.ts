/**
 * Voice turn classification for the agent conversation surfaces.
 *
 * Realtime provider hooks seed their history with a GREETING turn so the
 * session can speak the configured welcome message on connect. Two
 * conventions exist in the codebase:
 *
 *   • OpenAI Realtime / Gemini Live  → question: "Welcome message" (literal
 *     placeholder), answer filled by the model as it speaks the greeting.
 *   • ElevenLabs (all modes) / Sarvam → question: "" (empty), answer set to
 *     the greeting text up-front (spoken directly via TTS).
 *
 * The greeting turn is a SYSTEM announcement, not a conversational turn:
 * the user never said anything. Displaying it leaks a fake "You: Welcome
 * message" bubble onto the voice stage transcript and re-injects the
 * welcome text into the chat rail (on top of the static welcome message),
 * which is exactly the duplication the owner reported.
 *
 * The chat transcript and the stage transcript therefore only render turns
 * where the user actually spoke. The spoken greeting itself is unaffected —
 * audio playback is owned by the provider hooks, not by these consumers.
 */

/**
 * The literal placeholder the OpenAI Realtime and Gemini Live hooks stamp
 * on the greeting turn's question field. Kept in sync with:
 *   src/modules/assistant/core/hooks/useOpenAIRealtime.ts
 *   src/modules/assistant/core/hooks/useGeminiLive.ts
 */
export const GREETING_QUESTION_PLACEHOLDER = "Welcome message";

/** Minimal structural shape shared by every provider's VoiceTurn. */
export type TurnLike = {
  question?: string | null;
  answer?: string | null;
};

/**
 * True when a history turn is the session's greeting/system announcement
 * rather than a real conversational turn:
 *   • empty question (ElevenLabs / Sarvam convention), or
 *   • the literal "Welcome message" placeholder (OpenAI / Gemini convention).
 *
 * Partial STT turns (question still empty mid-stream) transiently match too,
 * which is harmless: they fold into the chat the moment the question
 * commits.
 */
export function isGreetingTurn(turn: TurnLike): boolean {
  const question = (turn.question ?? "").trim();
  return question === "" || question === GREETING_QUESTION_PLACEHOLDER;
}
