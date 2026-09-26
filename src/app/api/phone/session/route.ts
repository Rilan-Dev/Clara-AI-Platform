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
import { policyFromResolvedConfig, speechRecognitionLanguage } from "@/modules/assistant/core/language-policy";
import { ensureMigrated }            from "@/lib/db/migrate";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt }         from "@/modules/knowledge-bases/core/config-builder";
import { resolveAIConfig }           from "@/modules/ai-core/resolve";
import { getPhoneConfigsByKb }       from "@/modules/phone/core/db";
import { resolveVoiceConfig } from "@/modules/voice-core/resolve";
import {
  getSarvamApiKey,
  getSarvamBaseUrl,
  toSarvamRealtimeSttModel,
  getPlatformDefaultSarvamRealtimeLlmModel,
  getSarvamRealtimeTuning,
} from "@/modules/voice-core/model-catalog";
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
  extractOpenAIRealtimeClientSecret,
} from "@/modules/assistant/api/openai-realtime";

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
      getAssistantConfigByKb(kbId),
      getPhoneConfigsByKb(kbId),
    ]);

    if (!kb || !assistantConfig) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }

    const activeConfig = configs.find(c => c.enabled) ?? configs[0];
    const resolved     = await resolveAIConfig({ kbId, surface: "embed" });
    const voiceResolved = await resolveVoiceConfig({ kbId, surface: "realtime" });
    const sarvamSelected = voiceResolved.realtimeProvider === "sarvam" || voiceResolved.voiceProvider === "sarvam";

    if (sarvamSelected && voiceResolved.sarvam) {
      const sarvamApiKey = getSarvamApiKey();
      if (!sarvamApiKey) {
        return NextResponse.json({ error: "SARVAM_API_KEY not configured for Sarvam phone calls" }, { status: 500 });
      }
      const callLanguage = assistantConfig.alwaysRespondIn ?? assistantConfig.defaultLanguage ?? "en";
      const languageCode = /^[a-z]{2}(?:[-_][A-Z]{2})?$/i.test(callLanguage)
        ? `${callLanguage.toLowerCase().slice(0, 2)}-IN`
        : (callLanguage || "en-IN");
      return NextResponse.json({
        provider: "sarvam",
        sarvam: {
          apiKey: sarvamApiKey,
          baseUrl: getSarvamBaseUrl(),
          sttModel: voiceResolved.sarvam.realtimeSttModel || toSarvamRealtimeSttModel(voiceResolved.sarvam.sttModel),
          realtimeSttModel: voiceResolved.sarvam.realtimeSttModel,
          realtimeLlmModel: voiceResolved.sarvam.realtimeLlmModel || getPlatformDefaultSarvamRealtimeLlmModel(),
          realtimeTtsEnabled: voiceResolved.sarvam.realtimeTtsEnabled,
          ttsModel: voiceResolved.sarvam.realtimeTtsModel,
          speaker: voiceResolved.sarvam.realtimeSpeaker,
          language: languageCode,
          // Speech recognition: "unknown" = Sarvam auto-detect for
          // multi-language assistants (the reply language follows the caller).
          sttLanguage: voiceResolved.sarvam.sttLanguage ?? languageCode,
          // Platform-configurable endpointing + speaking pace.
          vad: getSarvamRealtimeTuning().vad,
          ttsPace: getSarvamRealtimeTuning().ttsPace,
          greetingMessage: activeConfig?.greetingMessage ?? assistantConfig.welcomeMessage ?? "Hello! How can I help you today?",
          maxCallDurationSec: activeConfig?.maxCallDurationSec ?? 300,
          kbName: kb.name,
          kbId,
          // The tenant's own assistant prompt and reply length, instead of a
          // hardcoded phone prompt and a fixed 180-token cap.
          systemPrompt: buildSystemPrompt(assistantConfig, {
            kbName: kb.name,
            kbDescription: kb.description,
            surface: "voice",
            allowedLanguages: resolved.allowedLanguages,
          }),
          maxTokens: resolved.maxTokens ?? assistantConfig.maxTokens ?? null,
        },
      });
    }


    // Build phone-optimised system prompt
    const basePrompt   = buildSystemPrompt(assistantConfig, { kbName: kb.name });
    const instructions = `${basePrompt}\n\nYou are answering a live phone call. Be concise, natural, and conversational. Keep responses under 3 sentences. Do not use markdown, bullet points, or formatting of any kind.`;

    // Voice-axis OpenAI transport values (validated against the OpenAI
    // Realtime contract — a Sarvam-brain voiceId like a Bulbul speaker id
    // must never be sent to OpenAI as an output voice).
    const model              = voiceResolved.openai?.realtimeModel ?? resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    const voice              = voiceResolved.openai?.voiceId ?? "alloy";
    const temperature        = resolved.temperature     ?? assistantConfig.temperature ?? 0.8;
    const transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    // Recognition language under the language policy (undefined = auto-detect).
    const language           = speechRecognitionLanguage(policyFromResolvedConfig({
      defaultLanguage: assistantConfig.defaultLanguage,
      allowedLanguages: resolved.allowedLanguages ?? assistantConfig.allowedLanguages,
      assistantConfig: { alwaysRespondIn: assistantConfig.alwaysRespondIn },
    })) ?? undefined;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      // Spoken audio counts against this; a fixed 500 cut phone answers off.
      maxOutputTokens: resolved.realtimeMaxOutputTokens ?? "inf",
      turnDetection: {
        type:                "server_vad",
        threshold:           0.5,
        prefix_padding_ms:   300,
        silence_duration_ms: 700,
        create_response:     false, // wait for RAG inject
      },
      transcription: { model: transcriptionModel, language },
      tools: [{
        type: "function",
        name: "rag_search",
        description: `Search the "${kb.name}" knowledge base.`,
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      }],
      toolChoice: "auto",
    });

    // Create ephemeral session — key stays server-side
    const sessionResult = await createOpenAIRealtimeClientSecret({
      apiKey,
      session: realtimeSession,
    });

    if (!sessionResult.ok) {
      console.error("[phone/session] OpenAI session failed:", sessionResult.errorText);
      return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
    }

    const ephemeral = extractOpenAIRealtimeClientSecret(sessionResult.data);
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
