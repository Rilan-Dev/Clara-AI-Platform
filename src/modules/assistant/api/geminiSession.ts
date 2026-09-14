import { NextRequest, NextResponse } from "next/server";
import { resolveLanguagePreferences } from "@/modules/assistant/core/config";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";

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
    // Parse optional language preferences from the request body.
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const languagePreferences = resolveLanguagePreferences({
      assistant:
        typeof body?.language === "string" ? body.language : undefined,
      customer: Array.isArray(body?.languages) ? body.languages : undefined,
    });

    let rawModel = process.env.GEMINI_LIVE_MODEL ?? DEFAULT_MODEL;
    let voice = process.env.GEMINI_LIVE_VOICE ?? DEFAULT_VOICE;
    let instructions: string | null = null;

    if (kbId) {
      await ensureMigrated();
      const kb = await getKnowledgeBaseById(kbId);
      if (!kb) {
        return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      }

      // ── Plan limit: voice must be enabled on the org's plan ──────────────
      const orgRows = await dbQuery<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
        [kbId]
      );
      const orgId = orgRows[0]?.org_id ?? null;
      if (orgId) {
        const voiceGuard = await planGuard(orgId, "voice");
        if (!voiceGuard.allowed) {
          const blocked = voiceGuard as { reason: string };
          return NextResponse.json(
            { error: "plan_limit_exceeded", code: "voice_not_enabled", message: blocked.reason },
            { status: 402 }
          );
        }
      }

      const resolved = await resolveAIConfig({ kbId, surface: "realtime" });
      if (resolved.provider !== "gemini") {
        return NextResponse.json(
          {
            error: "Resolved voice provider is OpenAI for this knowledge base.",
            provider: resolved.provider,
          },
          { status: 409 },
        );
      }

      if (!resolved.assistantConfig) {
        return NextResponse.json(
          { error: "Assistant configuration not found for this knowledge base" },
          { status: 500 },
        );
      }

      rawModel = resolved.realtimeModel ?? rawModel;
      voice = resolved.voiceId ?? voice;
      instructions = buildSystemPrompt(resolved.assistantConfig, { kbName: kb.name });
    }

    // Model name — normalise to include "models/" prefix if absent.
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;

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

    // Build the WebSocket URL server-side so the API key is never in the
    // browser JS bundle (no NEXT_PUBLIC_GEMINI_API_KEY required).
    const wsUrl = `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`;

    return NextResponse.json({
      provider: "gemini",
      wsUrl,
      model,
      voice,
      kbId,
      instructions,
      language: languagePreferences,
      inputSampleRate: LIVE_INPUT_SAMPLE_RATE,
      outputSampleRate: LIVE_OUTPUT_SAMPLE_RATE,
    });
  } catch (error) {
    if (error instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
