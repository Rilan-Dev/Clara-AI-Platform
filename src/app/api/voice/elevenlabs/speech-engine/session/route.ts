import { NextRequest, NextResponse } from "next/server";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { ensureMigrated } from "@/lib/db/migrate";
import { resolveVoiceConfig, VoiceConfigResolutionError } from "@/modules/voice-core/resolve";
import { registerElevenLabsSpeechEngineConversation } from "../../../../../../../../scripts/elevenlabs-speech-engine.mjs";

export async function OPTIONS(req: NextRequest) {
  return handlePreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;

    const { ctx } = validation;
    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const resolved = await resolveVoiceConfig({ kbId: ctx.kbId, surface: "embed" });

    if (resolved.realtimeProvider !== "elevenlabs") {
      return NextResponse.json(
        { error: "ElevenLabs is not the configured realtime voice provider." },
        { status: 409, headers: corsHeaders },
      );
    }

    const engineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!engineId || !apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs Speech Engine is not configured on the server." },
        { status: 503, headers: corsHeaders },
      );
    }

    const auth = req.headers.get("authorization");
    if (!auth) {
      return NextResponse.json({ error: "Authorization required." }, { status: 401, headers: corsHeaders });
    }

    const tokenUrl = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
    tokenUrl.searchParams.set("agent_id", engineId);
    tokenUrl.searchParams.set("participant_name", "clara-embed");

    const tokenResponse = await fetch(tokenUrl, {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });

    const tokenBody = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || typeof tokenBody.token !== "string" || typeof tokenBody.conversation_id !== "string") {
      console.error("[elevenlabs-speech-engine/session] token request failed", {
        status: tokenResponse.status,
      });
      return NextResponse.json(
        { error: "Could not create ElevenLabs realtime session." },
        { status: 502, headers: corsHeaders },
      );
    }

    await registerElevenLabsSpeechEngineConversation(tokenBody.conversation_id, {
      kbId: ctx.kbId,
      orgId: resolved.brain.orgId ?? ctx.orgId,
      authorization: auth,
      surface: "embed",
      baseUrl: req.nextUrl.origin,
    });

    return NextResponse.json(
      {
        mode: "speech-engine",
        provider: "elevenlabs",
        voiceProvider: "elevenlabs",
        brainProvider: resolved.brain.provider,
        chatModel: resolved.brain.chatModel,
        realtimeModel: "elevenlabs-speech-engine",
        kbId: ctx.kbId,
        orgId: resolved.brain.orgId ?? ctx.orgId,
        projectId: resolved.brain.agentId,
        conversationToken: tokenBody.token,
        conversationId: tokenBody.conversation_id,
        language: resolved.elevenlabs?.language ?? "en",
        voiceId: resolved.elevenlabs?.voiceId ?? null,
        flags: {
          realtimeEnabled: true,
          voiceEnabled: true,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[elevenlabs-speech-engine/session]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
