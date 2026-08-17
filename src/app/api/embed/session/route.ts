/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session  (CORS preflight)
 * ─────────────────────────────────────────────────────────────────────────────
 * Public voice session endpoint — authenticated by API key.
 * Creates an OpenAI Realtime or Gemini Live session configured from the KB.
 *
 * Demo mode uses the OpenAI credential configured by the platform administrator
 * in Platform Admin → Demo. The credential stays server-side; the browser only
 * receives OpenAI's short-lived client secret.
 *
 * Phase 3: voice access is now gated by the org's subscription plan flag
 * (voice_enabled). Plans without voice receive a 403 with a clear upgrade
 * message before any upstream API call is made.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
} from "@/modules/assistant/api/openai-realtime";

const GEMINI_LIVE_WSS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
const GEMINI_INPUT_SAMPLE_RATE  = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // ── 1. Standard embed validation (key + origin + daily quota + hourly limit) ──
    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin      = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);

    // ── 2. Voice access gate (Phase 3) ────────────────────────────────────────
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    // ── 3. Load KB config ─────────────────────────────────────────────────────
    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json(
        { error: "KB configuration not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const resolved     = await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name });

    // ── 4. Provider branch ────────────────────────────────────────────────────

    if (resolved.provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Gemini voice is not configured on the server" },
          { status: 500, headers: corsHeaders }
        );
      }

      const rawModel = resolved.realtimeModel ?? process.env.GEMINI_LIVE_MODEL ?? "gemini-2.5-flash-native-audio-preview-12-2025";
      const model    = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
      const wsUrl    = `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`;

      return NextResponse.json(
        {
          provider:        "gemini",
          kbId:             ctx.kbId,
          wsUrl,
          model,
          voice:           resolved.voiceId ?? process.env.GEMINI_LIVE_VOICE ?? "Aoede",
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
        },
        { headers: corsHeaders }
      );
    }

    // Default: OpenAI Realtime.
    // Demo requests are identified by validateEmbedRequest() returning the
    // special demo context. Use the admin-managed demo credential in that case.
    const isDemo = ctx.keyId === "demo-key";
    let apiKey: string | undefined;

    if (isDemo) {
      // Read the setting directly so an admin change takes effect immediately,
      // even if the process was started before the setting was configured.
      const settings = await getPlatformEnvSettings();
      apiKey = settings.find(s => s.key === "DEMO_OPENAI_API_KEY")?.value?.trim();

      // Do not fall back to OPENAI_API_KEY for demo traffic. This keeps the demo
      // explicitly isolated from the platform's normal OpenAI credential.
      if (!apiKey) {
        return NextResponse.json(
          { error: "Demo OpenAI API key is not configured. Set it in Platform Admin → Demo." },
          { status: 503, headers: corsHeaders }
        );
      }
    } else {
      apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json(
          { error: "Voice not configured on the server" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    const model = resolved.realtimeModel ?? (process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini");
    const voice = resolved.voiceId ?? config.voiceId;
    const turnDetection = {
      type:                "server_vad" as const,
      threshold:           0.5,
      prefix_padding_ms:   300,
      silence_duration_ms: 700,
      create_response:     false,
    };
    const transcription = {
      model:    resolved.transcriptionModel ?? "gpt-4o-mini-transcribe",
      language: config.alwaysRespondIn ?? config.defaultLanguage,
    };
    const tools = [
      {
        type:        "function" as const,
        name:        "rag_search",
        description: `Search the "${kb.name}" knowledge base for relevant information.`,
        parameters: {
          type:       "object",
          properties: { query: { type: "string", description: "User question in natural language" } },
          required:   ["query"],
        },
      },
    ];

    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      maxOutputTokens: resolved.maxTokens ?? config.maxTokens,
      turnDetection,
      transcription,
      tools,
      toolChoice: "auto",
    });

    const result = await createOpenAIRealtimeClientSecret({
      apiKey,
      session: realtimeSession,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.errorText }, { status: 500, headers: corsHeaders });
    }

    const session = result.data;
    return NextResponse.json(
      {
        ...session,
        model,
        voice,
        turn_detection: turnDetection,
        input_audio_transcription: transcription,
        kbId: ctx.kbId,
        provider: "openai",
        welcomeMessage: config.welcomeMessage ?? "",
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/session]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
