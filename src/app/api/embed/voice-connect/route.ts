/**
 * POST /api/embed/voice-connect
 * OPTIONS /api/embed/voice-connect
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure WebRTC SDP proxy for voice sessions.
 *
 * The browser never receives an OpenAI API key. The server creates the Realtime
 * session and returns only the SDP answer and welcome message.
 *
 * Demo requests use DEMO_OPENAI_API_KEY from Platform Admin → Demo.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated }            from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt }         from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import {
  buildOpenAIRealtimeSession,
  exchangeOpenAIRealtimeSdp,
} from "@/modules/assistant/api/openai-realtime";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // ── 1. Full embed validation (key + origin + quota + rate limit) ──────────
    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin      = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);

    // ── 2. Voice access gate ──────────────────────────────────────────────────
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    // ── 3. Parse request body ─────────────────────────────────────────────────
    const body = (await req.json()) as { sdpOffer?: string };
    if (!body.sdpOffer?.trim()) {
      return NextResponse.json({ error: "sdpOffer is required" }, { status: 400, headers: corsHeaders });
    }

    // ── 4. Load KB config (provider, model, voice, system prompt — all server-side) ──
    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    // Use surface:"chat" so resolveAIConfig doesn't throw on voice/embed flags.
    const resolved     = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name });
    const model        = resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    const voice        = resolved.voiceId       ?? config.voiceId    ?? "alloy";
    const maxTokens    = resolved.maxTokens     ?? config.maxTokens   ?? 1024;
    const transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    const language     = config.alwaysRespondIn ?? config.defaultLanguage ?? "en";
    const welcomeMsg   = config.welcomeMessage?.trim() ?? "";

    // ── 5. Select server-side OpenAI credential ───────────────────────────────
    // Demo traffic is explicitly isolated from the platform credential.
    let apiKey: string | undefined;
    if (ctx.keyId === "demo-key") {
      const settings = await getPlatformEnvSettings();
      apiKey = settings.find(s => s.key === "DEMO_OPENAI_API_KEY")?.value?.trim();
      if (!apiKey) {
        return NextResponse.json(
          { error: "Demo OpenAI API key is not configured. Set it in Platform Admin → Demo." },
          { status: 503, headers: corsHeaders },
        );
      }
    } else {
      apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json({ error: "Voice not configured on server" }, { status: 500, headers: corsHeaders });
      }
    }

    // ── 6. Exchange SDP server-side via the Realtime GA /calls API ───────────
    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      maxOutputTokens: maxTokens,
      // create_response:false so the AI waits for our RAG context injection
      turnDetection: {
        type:                "server_vad",
        threshold:           0.5,
        prefix_padding_ms:   300,
        silence_duration_ms: 600,
        create_response:     false,
      },
      transcription: {
        model: transcriptionModel,
        language,
      },
      tools: [{
        type:        "function",
        name:        "rag_search",
        description: `Search the "${kb.name}" knowledge base for relevant information.`,
        parameters: {
          type:       "object",
          properties: { query: { type: "string" } },
          required:   ["query"],
        },
      }],
      toolChoice: "auto",
    });

    const sdpResult = await exchangeOpenAIRealtimeSdp({
      apiKey,
      sdpOffer: body.sdpOffer,
      session: realtimeSession,
    });

    if (!sdpResult.ok) {
      const errText = sdpResult.errorText;
      console.error("[voice-connect] SDP exchange failed:", errText);
      return NextResponse.json(
        { error: `SDP exchange failed (${sdpResult.status})` },
        { status: 500, headers: corsHeaders }
      );
    }

    const sdpAnswer = String(sdpResult.data.sdpAnswer ?? "");

    // Return only what the browser needs. Never return any API credential.
    return NextResponse.json(
      { sdpAnswer, welcomeMessage: welcomeMsg },
      { headers: corsHeaders }
    );

  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/voice-connect]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
