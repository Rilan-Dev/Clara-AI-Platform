/**
 * Test helper exposing the same sentence-splitting algorithm the
 * useElevenLabsVoice hook uses, so the logic is unit-testable without a
 * browser audio stack.
 */

const TTS_SENTENCE_MIN_CHARS = 12;

export function splitSentencesLike(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const pattern = /[^.!?…।\n]+[.!?…।\n]+["'"’)\]]*\s*/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(buffer)) !== null) {
    const sentence = match[0].trim();
    consumed = match.index + match[0].length;
    if (sentence.length >= TTS_SENTENCE_MIN_CHARS) sentences.push(sentence);
  }
  return { sentences, rest: buffer.slice(consumed) };
}
