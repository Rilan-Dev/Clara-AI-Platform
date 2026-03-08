import { NextRequest, NextResponse } from "next/server";
import { resolveLanguagePreferences } from "@/modules/assistant/core/config";

// ─── Gemini Live session configuration ────────────────────────────────────────
//
// All values are SERVER-SIDE ONLY. The API key never appears in the browser JS
// bundle. The client calls POST /api/gemini/session, receives the WebSocket URL
// (with the key embedded) over an encrypted HTTPS connection at runtime, and
// connects to the WebSocket directly.
//
// This mirrors the OpenAI ephemeral-token pattern: no API key in NEXT_PUBLIC_*
// env vars, no API key visible in source maps or network inspector (the only
// exposure is the HTTPS response body, which is encrypted in transit).
//
// For maximum security, add authentication middleware so only logged-in users
// can call this endpoint.

/** Gemini Multimodal Live API — bidi WebSocket endpoint (v1alpha). */
const GEMINI_LIVE_WSS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

const DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const DEFAULT_VOICE = "Aoede";

// Audio sample rates — fixed by Gemini Live API requirements.
const LIVE_INPUT_SAMPLE_RATE = 16_000;   // Hz
const LIVE_OUTPUT_SAMPLE_RATE = 24_000;  // Hz

export async function postGeminiSession(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not set on the server. " +
            "Add it to your .env file and restart the dev server.",
        },
        { status: 500 }
      );
    }

    // Parse optional language preferences from the request body.
    const body = await request.json().catch(() => null);
    const languagePreferences = resolveLanguagePreferences({
      assistant:
        typeof body?.language === "string" ? body.language : undefined,
      customer: Array.isArray(body?.languages) ? body.languages : undefined,
    });

    // Model name — normalise to include "models/" prefix if absent.
    const rawModel = process.env.GEMINI_LIVE_MODEL ?? DEFAULT_MODEL;
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;

    const voice = process.env.GEMINI_LIVE_VOICE ?? DEFAULT_VOICE;

    // Build the WebSocket URL server-side so the API key is never in the
    // browser JS bundle (no NEXT_PUBLIC_GEMINI_API_KEY required).
    const wsUrl = `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`;

    return NextResponse.json({
      wsUrl,
      model,
      voice,
      language: languagePreferences,
      inputSampleRate: LIVE_INPUT_SAMPLE_RATE,
      outputSampleRate: LIVE_OUTPUT_SAMPLE_RATE,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
