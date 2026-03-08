/**
 * @deprecated
 *
 * This file is no longer used and is kept only for historical reference.
 *
 * WHAT WAS WRONG:
 *   This adapter class contained a placeholder implementation of the OpenAI
 *   Realtime voice connection.  It had the following critical bugs:
 *
 *   1. Wrong event names — used `type.includes("response.start")` and
 *      `type.includes("response.end")`, which never matched the real API
 *      events ("response.created" / "response.done").  isSpeaking was
 *      therefore NEVER set to true/false.
 *
 *   2. Duplicate transceiver — called BOTH addTrack() AND addTransceiver(),
 *      producing two audio lines in the SDP offer.
 *
 *   3. No ICE gathering race-condition fix.
 *
 *   4. No connection timeout guard.
 *
 *   5. No DOMException-specific getUserMedia error messages.
 *
 *   6. Hardcoded model / voice strings instead of reading from session response.
 *
 *   7. All Phase 3 performance and correctness fixes in useOpenAIRealtime.ts
 *      were bypassed because useVoiceClient routed OpenAI through this class.
 *
 * CURRENT ARCHITECTURE:
 *   useVoiceClient now delegates directly to useOpenAIRealtime (fully fixed hook)
 *   for OpenAI and to useGeminiLive for Gemini.  The adapter class layer has
 *   been removed from the active call path.
 *
 * DO NOT import or instantiate this class in new code.
 */
export class OpenAIVoiceAdapter {
  connect(): Promise<void> {
    throw new Error(
      "OpenAIVoiceAdapter is deprecated. Use useOpenAIRealtime hook instead."
    );
  }
  disconnect(): void {}
  interrupt(): void {}
  sendText(): void {}
}
