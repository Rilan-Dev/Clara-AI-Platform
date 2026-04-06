/**
 * POST /api/phone/session
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal-only route called by phone-stream.mjs (server-to-server, no CORS).
 * Returns an OpenAI ephemeral key + full call config for a given kbId.
 * Never called by the browser — the ephemeral key never leaves the server.
 *
 * Request:  { kbId, provider, callSid, fromNumber }
 * Response: { ephemeralKey, model, voice, temperature, instructions,
 *             transcriptionModel, language, greetingMessage,
 *             maxCallDurationSec, kbName }
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated }            from "@/lib/db/migrate";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt }         from "@/modules/knowledge-bases/core/config-builder";
import { resolveAIConfig }           from "@/modules/ai-core/resolve";
import { getPhoneConfigsByKb }       from "@/modules/phone/core/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Only allow calls from localhost (phone-stream.mjs runs server-side)
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp    = req.headers.get("x-real-ip") ?? "";
  const isInternal = req.headers.get("x-phone-internal") === "1";
  const remoteIp  = forwarded?.split(",")[0]?.trim() ?? realIp;
  const isLocal   = isInternal ||
    remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";

  if (!isLocal) {
    return NextResponse.json({ error: "Internal route only" }, { status: 403 });
  }

  try {
    await ensureMigrated();
    const body = await req.json() as { kbId?: string; provider?: string };
    const { kbId = "" } = body;

    if (!kbId) return NextResponse.json({ error: "kbId required" }, { status: 400 });

    const [kb, assistantConfig, configs] = await Promise.all([
      getKnowledgeBaseById(kbId),
      getAssistantConfig(kbId),
      getPhoneConfigsByKb(kbId),
    ]);

    if (!kb || !assistantConfig) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }

    const activeConfig = configs.find(c => c.enabled) ?? configs[0];
    const resolved     = await resolveAIConfig({ kbId, surface: "embed" });

    // Build phone-optimised system prompt
    const basePrompt   = buildSystemPrompt(assistantConfig, { kbName: kb.name });
    const instructions = `${basePrompt}\n\nYou are answering a live phone call. Be concise, natural, and conversational. Keep responses under 3 sentences. Do not use markdown, bullet points, or formatting of any kind.`;

    const model              = resolved.realtimeModel   ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    const voice              = resolved.voiceId         ?? assistantConfig.voiceId ?? "alloy";
    const temperature        = resolved.temperature     ?? assistantConfig.temperature ?? 0.8;
    const transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    const language           = assistantConfig.alwaysRespondIn ?? assistantConfig.defaultLanguage ?? "en";

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

    // Create ephemeral session — key stays server-side
    const sessRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta":  "realtime=v1",
      },
      body: JSON.stringify({
        model, voice, modalities: ["audio", "text"], instructions, temperature,
        max_response_output_tokens: Math.min(resolved.maxTokens ?? 500, 500),
        turn_detection: {
          type:                "server_vad",
          threshold:           0.5,
          prefix_padding_ms:   300,
          silence_duration_ms: 700,
          create_response:     false, // wait for RAG inject
        },
        input_audio_transcription: { model: transcriptionModel, language },
        tools: [{
          type: "function", name: "rag_search",
          description: `Search the "${kb.name}" knowledge base.`,
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        }],
      }),
    });

    if (!sessRes.ok) {
      const txt = await sessRes.text();
      console.error("[phone/session] OpenAI session failed:", txt);
      return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
    }

    const sess      = await sessRes.json() as Record<string, unknown>;
    const ephemeral =
      ((sess?.client_secret as Record<string, unknown>)?.value as string) ??
      (sess?.client_secret as string);
    if (!ephemeral) return NextResponse.json({ error: "No ephemeral key" }, { status: 500 });

    return NextResponse.json({
      ephemeralKey:       ephemeral,
      model,
      voice,
      temperature,
      instructions,
      transcriptionModel,
      language,
      greetingMessage:    activeConfig?.greetingMessage ?? assistantConfig.welcomeMessage ?? "Hello! How can I help you today?",
      maxCallDurationSec: activeConfig?.maxCallDurationSec ?? 300,
      kbName:             kb.name,
      kbId,
    });
  } catch (err) {
    console.error("[phone/session]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
