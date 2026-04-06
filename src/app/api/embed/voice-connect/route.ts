/**
 * POST /api/embed/voice-connect
 * OPTIONS /api/embed/voice-connect
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure WebRTC SDP proxy for voice sessions.
 *
 * WHY THIS EXISTS — security model:
 *   The old flow had the browser calling OpenAI directly:
 *     browser → /api/embed/session → gets (ephemeralKey + model + provider)
 *     browser → https://api.openai.com/v1/realtime?model=X  ← all visible in DevTools
 *
 *   This means any user can:
 *     • See which AI provider and model is being used
 *     • Change the model by modifying the request
 *     • Use the ephemeral key to open their own sessions
 *     • Break the integration if the platform admin switches provider (OpenAI→Gemini)
 *
 *   NEW SECURE FLOW:
 *     browser creates RTCPeerConnection, gathers ICE, creates SDP offer
 *     browser → POST /api/embed/voice-connect  { sdpOffer: "..." }
 *     server:
 *       1. validates embed API key (rate limit, voice gate, origin)
 *       2. loads KB config from DB — provider, model, voice, temperature, instructions
 *       3. creates OpenAI Realtime session server-side (ephemeral key NEVER leaves server)
 *       4. exchanges SDP with OpenAI using the ephemeral key
 *       5. returns ONLY { sdpAnswer, welcomeMessage }
 *     browser sets remote description — audio connects
 *
 *   What the browser NEVER sees:
 *     • Which provider is used (OpenAI, Gemini, future)
 *     • Model name (gpt-realtime-mini, gpt-4o-realtime, etc.)
 *     • Ephemeral key
 *     • API keys of any kind
 *     • KB configuration details
 *     • Voice ID, temperature, system prompt
 *
 *   Admin can switch provider from OpenAI → Gemini in the platform admin panel
 *   and the client code requires ZERO changes — it just sends an SDP offer and
 *   receives an SDP answer regardless of what's behind it.
 *
 * Request:  { sdpOffer: string }
 * Response: { sdpAnswer: string, welcomeMessage: string }
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
    // We only need model/voice/temperature params here — the session itself is
    // what gates access, not the surface assertion.
    const resolved     = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name });
    const model        = resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    const voice        = resolved.voiceId       ?? config.voiceId    ?? "alloy";
    const temperature  = resolved.temperature   ?? config.temperature ?? 0.8;
    const maxTokens    = resolved.maxTokens     ?? config.maxTokens   ?? 1024;
    const transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    const language     = config.alwaysRespondIn ?? config.defaultLanguage ?? "en";
    const welcomeMsg   = config.welcomeMessage?.trim() ?? "";

    // ── 5. Create ephemeral session server-side ───────────────────────────────
    // The ephemeral key is created and consumed HERE — it never leaves the server.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Voice not configured on server" }, { status: 500, headers: corsHeaders });
    }

    const sessRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta":  "realtime=v1",
      },
      body: JSON.stringify({
        model,
        voice,
        modalities:                 ["audio", "text"],
        instructions,
        temperature,
        max_response_output_tokens: maxTokens,
        // create_response:false so the AI waits for our RAG context injection
        turn_detection: {
          type:                "server_vad",
          threshold:           0.5,
          prefix_padding_ms:   300,
          silence_duration_ms: 600,
          create_response:     false,
        },
        input_audio_transcription: {
          model:    transcriptionModel,
          language,
        },
        // rag_search tool registered but client handles it via context injection
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
      }),
    });

    if (!sessRes.ok) {
      const errText = await sessRes.text();
      console.error("[voice-connect] OpenAI session failed:", errText);
      return NextResponse.json(
        { error: "Voice session creation failed. Check server configuration." },
        { status: 500, headers: corsHeaders }
      );
    }

    const session    = await sessRes.json() as Record<string, unknown>;
    const ephemeral  =
      ((session?.client_secret as Record<string, unknown>)?.value as string) ??
      (session?.client_secret as string);

    if (!ephemeral) {
      return NextResponse.json({ error: "No ephemeral key in session response" }, { status: 500, headers: corsHeaders });
    }

    // ── 6. Exchange SDP server-side ───────────────────────────────────────────
    // The browser sent us its SDP offer. We forward it to OpenAI using the
    // ephemeral key. The SDP answer comes back here and we return it to the
    // browser. The browser never touches OpenAI directly.
    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${ephemeral}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta":  "realtime=v1",
        },
        body: body.sdpOffer,
      }
    );

    if (!sdpRes.ok) {
      const errText = await sdpRes.text();
      console.error("[voice-connect] SDP exchange failed:", errText);
      return NextResponse.json(
        { error: `SDP exchange failed (${sdpRes.status})` },
        { status: 500, headers: corsHeaders }
      );
    }

    const sdpAnswer = await sdpRes.text();

    // ── 7. Return ONLY what the browser legitimately needs ────────────────────
    // sdpAnswer:      browser sets this as the WebRTC remote description
    // welcomeMessage: optional greeting the assistant speaks on connect
    //
    // Nothing else. No provider. No model. No ephemeral key. No kbId.
    // The browser is completely blind to the infrastructure behind this.
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
