/**
 * @deprecated
 *
 * This file is no longer used and is kept only for historical reference.
 *
 * WHAT WAS WRONG IN THE ORIGINAL:
 *   1. NEXT_PUBLIC_GEMINI_API_KEY baked the API key into the browser JS bundle.
 *   2. No RAG integration — rag_search tool was never declared or handled.
 *   3. onHistoryChange never called — turns panel was always empty.
 *   4. status: "connected" set on ws.onopen, before Gemini's setupComplete event
 *      fired — audio sent during this window was silently discarded.
 *   5. AudioContext created inside ws.onopen (async, not a user gesture) —
 *      contexts started in the "suspended" state on Chrome/Safari.
 *   6. ws.onclose called disconnect() → ws.close() → onclose → infinite loop.
 *   7. Audio capture started immediately, before setupComplete — Gemini
 *      rejected early audio frames.
 *   8. AudioWorklet fired every ~8 ms (per-frame), flooding the WebSocket with
 *      ~125 tiny messages/second instead of batched 100 ms chunks.
 *   9. No transcript accumulation — modelTurn.parts[].text was ignored.
 *  10. No connection timeout guard.
 *
 * CURRENT ARCHITECTURE:
 *   useVoiceClient delegates directly to useGeminiLive (hook) for Gemini, and
 *   useOpenAIRealtime (hook) for OpenAI.  The VoiceAdapter class layer has been
 *   removed from the active call path.  All the fixes above are implemented in
 *   useGeminiLive.ts.
 *
 * DO NOT import or instantiate this class in new code.
 */
export class GeminiVoiceAdapter {
  connect(): Promise<void> {
    throw new Error(
      "GeminiVoiceAdapter is deprecated. Use useGeminiLive hook instead."
    );
  }
  disconnect(): void {}
  interrupt(): void {}
  sendText(): void {}
}
