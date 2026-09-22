/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session
 *
 * Public embed voice-session endpoint. The API key identifies the KB; all
 * provider, model, language, voice, and limits come from the effective
 * project -> organisation -> platform configuration chain.
 *
 * Provider routing follows the VOICE axis (resolveVoiceConfig), not just the
 * brain axis. ElevenLabs embeds use the dedicated Speech Engine transport
 * when its platform gate is enabled: browser WebRTC → ElevenLabs → Clara
 * Speech Engine WSS → Clara LLM/RAG → streamed text → ElevenLabs TTS. The
 * existing batch STT/TTS pipeline remains the explicit fallback when Speech
 * Engine is not configured.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { ensureMigrated } from "@/lib/db/migrate";
import { getAssistantConfigByKb, getKnowledgeBaseById, getKnowledgeBaseDocumentTitles } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import {
  AIConfigResolutionError,
  getProviderApiKey,
  resolveAIConfig,
} from "@/modules/ai-core/resolve";
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
} from "@/modules/assistant/api/openai-realtime";
import { getRealtimeAudioPolicy } from "@/modules/assistant/core/voice/realtime-audio-config";
import { mintGeminiRealtimeToken } from "@/modules/voice-core/api/gemini/realtime-auth";
import {
  VoiceConfigResolutionError,
  resolveVoiceConfig,
} from "@/modules/voice-core/resolve";
const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const sessionBody = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const [kb, config, documentTitles] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfigByKb(ctx.kbId),
      getKnowledgeBaseDocumentTitles(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json(
        { error: "Knowledge-base configuration not found", kbId: ctx.kbId },
        { status: 404, headers: corsHeaders },
      );
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const effectiveConfig = resolved.assistantConfig ?? config;
    const requestedLanguage =
      typeof sessionBody.language === "string"
        ? sessionBody.language.trim().toLowerCase()
        : null;
    const requestedLanguageAllowed =
      requestedLanguage && resolved.allowedLanguages.includes(requestedLanguage)
        ? requestedLanguage
        : null;
    const effectiveResponseLanguage =
      effectiveConfig.alwaysRespondIn?.trim().toLowerCase() ??
      requestedLanguageAllowed ??
      resolved.defaultLanguage;


    // ── Voice-axis routing ──────────────────────────────────────────────────
    // The embed voice surfaces are realtime-purpose surfaces; when the
    // resolved voice provider is ElevenLabs, the session answer is the Mode A
    // pipeline descriptor set (STT/TTS/chat endpoints) rather than an
    // OpenAI/Gemini realtime socket. Everything the client needs is
    // capability descriptors — no keys ever cross this response.
    let voiceResolution: Awaited<ReturnType<typeof resolveVoiceConfig>> | null = null;
    try {
      voiceResolution = await resolveVoiceConfig({ kbId: ctx.kbId, surface: "embed" });
    } catch (voiceError) {
      if (voiceError instanceof VoiceConfigResolutionError) {
        return NextResponse.json({ error: voiceError.message }, { status: 400, headers: corsHeaders });
      }
      throw voiceError;
    }

    if (voiceResolution.realtimeProvider === "elevenlabs" && voiceResolution.elevenlabs) {
      const el = voiceResolution.elevenlabs;
      const speechEngineReady =
        process.env.ELEVENLABS_SPEECH_ENGINE_ENABLED !== "false" &&
        Boolean(process.env.ELEVENLABS_SPEECH_ENGINE_ID) &&
        Boolean(process.env.ELEVENLABS_API_KEY);

      if (speechEngineReady) {
        return NextResponse.json(
          {
            provider: voiceResolution.brain.provider,
            voiceProvider: "elevenlabs",
            mode: "speech-engine",
            kbId: ctx.kbId,
            orgId: voiceResolution.brain.orgId ?? ctx.orgId,
            projectId: voiceResolution.brain.agentId,
            realtime: {
              endpoint: "/api/voice/elevenlabs/speech-engine/session",
            },
            chat: {
              endpoint: "/api/embed/chat",
              kbId: ctx.kbId,
            },
            welcomeMessage: effectiveConfig.welcomeMessage ?? "",
            config: {
              orgId: voiceResolution.brain.orgId ?? ctx.orgId,
              projectId: voiceResolution.brain.agentId,
              provider: voiceResolution.brain.provider,
              voiceProvider: "elevenlabs",
              realtimeModel: "elevenlabs-speech-engine",
              voiceId: el.voiceId,
              transcriptionModel: el.sttModel,
              allowedLanguages: resolved.allowedLanguages,
              defaultLanguage: resolved.defaultLanguage,
              maxTokens: resolved.maxTokens ?? effectiveConfig.maxTokens,
              temperature: resolved.temperature ?? effectiveConfig.temperature,
              sources: resolved.sources,
              flags: resolved.flags,
            },
          },
          { headers: corsHeaders },
        );
      }
      // Explicit ElevenLabs realtime selection must use Speech Engine.
      // Never silently downgrade to the legacy STT/chat/TTS pipeline: that
      // would make the UI claim ElevenLabs realtime while using a different
      // transport and defeats the selected realtime provider.
      return NextResponse.json(
        {
          error: "ElevenLabs is selected as the realtime voice provider, but Speech Engine is not configured on the server. Set ELEVENLABS_SPEECH_ENGINE_ID and ELEVENLABS_API_KEY.",
          provider: voiceResolution.brain.provider,
          voiceProvider: "elevenlabs",
          realtimeProvider: "elevenlabs",
          speechEngineRequired: true,
        },
        { status: 503, headers: corsHeaders },
      );
    }

    if (voiceResolution.realtimeProvider === "sarvam" && voiceResolution.sarvam) {
      const sv = voiceResolution.sarvam;
      return NextResponse.json(
        {
          provider: voiceResolution.brain.provider,
          voiceProvider: "sarvam",
          // Sarvam has no Mode B — embeds always run the Mode A pipeline and
          // re-bootstrap through /api/voice/sarvam/session with the SAME clr_
          // credential.
          mode: "pipeline",
          kbId: ctx.kbId,
          orgId: voiceResolution.brain.orgId ?? ctx.orgId,
          projectId: voiceResolution.brain.agentId,
          stt: {
            endpoint: "/api/voice/sarvam/transcribe",
            model: sv.sttModel,
            language: sv.language,
            sampleRate: sv.sampleRate,
            maxAudioSeconds: 30,
          },
          tts: {
            endpoint: "/api/voice/sarvam/tts",
            model: sv.voiceChatTtsModel,
            speaker: sv.voiceChatSpeaker,
            outputFormat: `pcm_${sv.sampleRate}`,
            language: sv.language,
          },
          chat: {
            endpoint: "/api/embed/chat",
            kbId: ctx.kbId,
          },
          welcomeMessage: effectiveConfig.welcomeMessage ?? "",
          config: {
            orgId: voiceResolution.brain.orgId ?? ctx.orgId,
            projectId: voiceResolution.brain.agentId,
            provider: voiceResolution.brain.provider,
            voiceProvider: "sarvam",
            realtimeModel: null,
            voiceId: sv.voiceChatSpeaker,
            transcriptionModel: sv.sttModel,
            allowedLanguages: resolved.allowedLanguages,
            sarvamRealtime: {
              sttModel: sv.realtimeSttModel,
              llmModel: sv.realtimeLlmModel,
              ttsModel: sv.realtimeTtsModel,
              ttsEnabled: sv.realtimeTtsEnabled,
            },
            defaultLanguage: resolved.defaultLanguage,
            maxTokens: resolved.maxTokens ?? effectiveConfig.maxTokens,
            temperature: resolved.temperature ?? effectiveConfig.temperature,
            sources: resolved.sources,
            flags: resolved.flags,
          },
        },
        { headers: corsHeaders },
      );
    }

    // ── Shared brain-resolution values (limits / languages / flags) ─────────
    // These are brain-axis concerns that every transport branch echoes into
    // its config payload. The native realtime transport itself (model /
    // voice / credential) is resolved from the VOICE axis below.
    const voiceId = resolved.voiceId;
    const transcriptionModel = resolved.transcriptionModel;
    const allowedLanguages = resolved.allowedLanguages;
    const defaultLanguage = resolved.defaultLanguage;
    const maxTokens = resolved.maxTokens ?? effectiveConfig.maxTokens;
    const temperature = resolved.temperature ?? effectiveConfig.temperature;
    const audioPolicy = getRealtimeAudioPolicy();

    // ── Native realtime transports (OpenAI Realtime / Gemini Live) ──────────
    // Selected by the VOICE axis (realtimeProvider), NOT the brain provider:
    // the realtime transport is independent of which provider serves
    // chat/RAG. A Sarvam or Gemini brain with an OpenAI realtime voice
    // selection must still mint an OpenAI Realtime session with the OPENAI
    // credential and a valid OpenAI voice — previously this branch sourced
    // voice/model/key from the brain resolution, which is structurally null
    // for a non-OpenAI brain (production incident 2026-09-21: 503 "OpenAI
    // realtime voice is not configured for this tenant" with a Sarvam brain).
    if (
      voiceResolution.realtimeProvider === "openai" &&
      voiceResolution.openai
    ) {
      const oa = voiceResolution.openai;
      const openaiApiKey = getProviderApiKey("openai");
      if (!openaiApiKey) {
        return NextResponse.json(
          { error: "OpenAI is selected for realtime voice, but OPENAI_API_KEY is not configured on the server." },
          { status: 503, headers: corsHeaders },
        );
      }

      const instructions = buildSystemPrompt(config, {
        kbName: kb.name,
        surface: "realtime",
        allowedLanguages: resolved.allowedLanguages,
        responseLanguage: effectiveResponseLanguage,
        documentCount: documentTitles.length,
        documentTitles,
      });

      const turnDetection = {
        type: "server_vad" as const,
        threshold: audioPolicy.vadThreshold,
        prefix_padding_ms: audioPolicy.prefixPaddingMs,
        silence_duration_ms: audioPolicy.silenceDurationMs,
        create_response: false,
        interrupt_response: false,
      };

      const transcription = {
        model: oa.transcriptionModel,
        language: requestedLanguageAllowed ?? effectiveResponseLanguage ?? undefined,
      };

      const realtimeSession = buildOpenAIRealtimeSession({
        model: oa.realtimeModel,
        voice: oa.voiceId,
        instructions,
        maxOutputTokens: maxTokens ?? undefined,
        turnDetection,
        transcription,
        tools: [],
        toolChoice: "none",
      });

      const result = await createOpenAIRealtimeClientSecret({
        apiKey: openaiApiKey,
        session: realtimeSession,
      });

      if (!result.ok) {
        console.error("[embed/session] OpenAI Realtime session creation failed", {
          status: result.status,
          provider: resolved.provider,
          model: oa.realtimeModel,
        });
        return NextResponse.json(
          {
            error: `OpenAI Realtime session creation failed (${result.status})`,
            details: result.errorText,
            model: oa.realtimeModel,
            orgId: resolved.orgId ?? ctx.orgId,
            projectId: resolved.agentId,
            kbId: ctx.kbId,
          },
          {
            status: result.status >= 400 && result.status < 600 ? result.status : 502,
            headers: corsHeaders,
          },
        );
      }

      return NextResponse.json(
        {
          ...result.data,
          model: oa.realtimeModel,
          voice: oa.voiceId,
          max_output_tokens: maxTokens,
          turn_detection: turnDetection,
          input_audio_transcription: transcription,
          audio_policy: audioPolicy,
          kbId: ctx.kbId,
          orgId: resolved.orgId ?? ctx.orgId,
          projectId: resolved.agentId,
          provider: resolved.provider,
          voiceProvider: voiceResolution.realtimeProvider,
          welcomeMessage: effectiveConfig.welcomeMessage ?? "",
          config: {
            orgId: resolved.orgId ?? ctx.orgId,
            projectId: resolved.agentId,
            provider: resolved.provider,
            realtimeModel: oa.realtimeModel,
            voiceId: oa.voiceId,
            transcriptionModel: oa.transcriptionModel,
            maxTokens,
            temperature,
            allowedLanguages,
            defaultLanguage,
            sources: resolved.sources,
            flags: resolved.flags,
          },
        },
        { headers: corsHeaders },
      );
    }

    if (voiceResolution.realtimeProvider === "gemini") {
      // Gemini Live remains the vendor-native lifecycle (gap-closure Phase D:
      // same-origin relay + short-lived HMAC token; the vendor key stays
      // server-side). Model/voice fall back to the platform environment when
      // the brain chain has no Gemini-realtime values (e.g. a Sarvam brain
      // with a Gemini realtime voice selection).
      const geminiModel =
        resolved.realtimeModel && /gemini/i.test(resolved.realtimeModel)
          ? resolved.realtimeModel
          : process.env.GEMINI_REALTIME_MODEL?.trim() ||
            process.env.GEMINI_LIVE_MODEL?.trim() ||
            "gemini-2.5-flash-native-audio-preview-12-2025";
      // Only trust the brain-resolved voice when the brain itself is Gemini —
      // an OpenAI brain's voice id ("alloy") is not a Gemini voice name.
      const geminiVoice =
        resolved.provider === "gemini" && voiceId
          ? voiceId
          : process.env.GEMINI_LIVE_VOICE?.trim() || "Aoede";
      const model = geminiModel.startsWith("models/") ? geminiModel : `models/${geminiModel}`;
      const instructions = buildSystemPrompt(config, {
        kbName: kb.name,
        surface: "realtime",
        allowedLanguages,
      });

      return NextResponse.json(
        {
          provider: "gemini",
          // Voice axis resolved to a non-ElevenLabs provider: report it so the
          // client (and hosts reading the config) see the real voice provider.
          voiceProvider: voiceResolution.realtimeProvider,
          kbId: ctx.kbId,
          orgId: resolved.orgId ?? ctx.orgId,
          projectId: resolved.agentId,
          // Gap-closure Phase D: the long-lived GEMINI_API_KEY never crosses
          // this response. The browser gets a same-origin relay descriptor +
          // short-lived HMAC capability token; the relay
          // (scripts/gemini-relay.mjs) holds the vendor key server-side.
          realtime: {
            endpoint: "/api/voice/gemini/realtime",
            token: mintGeminiRealtimeToken({
              kbId: ctx.kbId,
              orgId: resolved.orgId ?? ctx.orgId,
            }),
          },
          model,
          voice: geminiVoice,
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
          welcomeMessage: effectiveConfig.welcomeMessage ?? "",
          audioPolicy,
          config: {
            orgId: resolved.orgId ?? ctx.orgId,
            projectId: resolved.agentId,
            provider: resolved.provider,
            realtimeModel: geminiModel,
            voiceId: geminiVoice,
            transcriptionModel,
            maxTokens,
            temperature,
            allowedLanguages,
            defaultLanguage,
            sources: resolved.sources,
            flags: resolved.flags,
          },
        },
        { headers: corsHeaders },
      );
    }

    // Non-native transport without a pipeline descriptor (defensive — the
    // resolver degrades unavailable providers to an inherited value, so this
    // arm is unreachable for the four supported providers).
    console.error("[embed/session] no realtime transport for voice axis", {
      realtimeProvider: voiceResolution.realtimeProvider,
      brainProvider: resolved.provider,
      kbId: ctx.kbId,
    });
    return NextResponse.json(
      { error: "Voice configuration could not be resolved for this knowledge base." },
      { status: 503, headers: corsHeaders },
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/session]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
