/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session
 *
 * Public embed voice-session endpoint. The API key identifies the KB; all
 * provider, model, language, voice, and limits come from the effective
 * project -> organisation -> platform configuration chain.
 *
 * Provider routing follows the VOICE axis (resolveVoiceConfig), not just the
 * brain axis: an organisation whose voice provider is ElevenLabs gets the
 * Mode A pipeline descriptors (STT/TTS/chat endpoints) here — the same
 * pipeline the in-app floating assistant uses — so embedded demos consume
 * the SAME provider the platform admin configured instead of silently
 * falling through to OpenAI Realtime. Mode B (Agents) is never minted for
 * embed keys by design (data-flow gates); embeds run Mode A.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { ensureMigrated } from "@/lib/db/migrate";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
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
import {
  STT_MAX_AUDIO_SECONDS,
  TTS_OUTPUT_FORMAT,
} from "@/modules/voice-core/model-catalog";

const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfigByKb(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json(
        { error: "Knowledge-base configuration not found", kbId: ctx.kbId },
        { status: 404, headers: corsHeaders },
      );
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const provider = resolved.provider;

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
      return NextResponse.json(
        {
          provider: voiceResolution.brain.provider,
          voiceProvider: "elevenlabs",
          // Embed keys never resolve a conversational (Mode B) session — the
          // client hook forces pipeline mode and re-bootstraps through
          // /api/voice/elevenlabs/session with the SAME clr_ credential.
          mode: "pipeline",
          kbId: ctx.kbId,
          orgId: voiceResolution.brain.orgId ?? ctx.orgId,
          projectId: voiceResolution.brain.agentId,
          stt: {
            endpoint: "/api/voice/elevenlabs/transcribe",
            model: el.sttModel,
            language: el.language,
            sampleRate: 16_000,
            maxAudioSeconds: STT_MAX_AUDIO_SECONDS,
          },
          tts: {
            endpoint: "/api/voice/elevenlabs/tts",
            model: el.ttsModel,
            voiceId: el.voiceId,
            outputFormat: TTS_OUTPUT_FORMAT,
            voiceSettings: el.voiceSettings,
          },
          chat: {
            endpoint: "/api/embed/chat",
            kbId: ctx.kbId,
          },
          welcomeMessage: config.welcomeMessage ?? "",
          config: {
            orgId: voiceResolution.brain.orgId ?? ctx.orgId,
            projectId: voiceResolution.brain.agentId,
            provider: voiceResolution.brain.provider,
            voiceProvider: "elevenlabs",
            realtimeModel: null,
            voiceId: el.voiceId,
            transcriptionModel: el.sttModel,
            allowedLanguages: resolved.allowedLanguages,
            defaultLanguage: resolved.defaultLanguage,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            temperature: resolved.temperature ?? config.temperature,
            sources: resolved.sources,
            flags: resolved.flags,
          },
        },
        { headers: corsHeaders },
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
          welcomeMessage: config.welcomeMessage ?? "",
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
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            temperature: resolved.temperature ?? config.temperature,
            sources: resolved.sources,
            flags: resolved.flags,
          },
        },
        { headers: corsHeaders },
      );
    }

    const realtimeModel = resolved.realtimeModel;
    const voiceId = resolved.voiceId;
    const transcriptionModel = resolved.transcriptionModel;
    const allowedLanguages = resolved.allowedLanguages;
    const defaultLanguage = resolved.defaultLanguage;
    const maxTokens = resolved.maxTokens ?? config.maxTokens;
    const temperature = resolved.temperature ?? config.temperature;
    const apiKey = getProviderApiKey(provider);
    const audioPolicy = getRealtimeAudioPolicy();

    if (!apiKey) {
      const envName =
        provider === "openai" ? "OPENAI_API_KEY"
        : provider === "gemini" ? "GEMINI_API_KEY"
        : "SARVAM_API_KEY";
      return NextResponse.json(
        { error: `${provider} is selected for this tenant, but ${envName} is not configured on the server.` },
        { status: 503, headers: corsHeaders },
      );
    }

    console.info("[embed/session] runtime configuration", {
      orgId: resolved.orgId ?? ctx.orgId,
      projectId: resolved.agentId,
      kbId: ctx.kbId,
      provider,
      realtimeModel,
      transcriptionModel,
      voiceId,
      allowedLanguages,
      defaultLanguage,
      sources: resolved.sources,
    });

    if (provider === "gemini") {
      if (!realtimeModel) {
        return NextResponse.json(
          { error: "Gemini realtime model is not configured for this tenant." },
          { status: 503, headers: corsHeaders },
        );
      }

      const model = realtimeModel.startsWith("models/") ? realtimeModel : `models/${realtimeModel}`;
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
          voice: voiceId,
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
          welcomeMessage: config.welcomeMessage ?? "",
          audioPolicy,
          config: {
            orgId: resolved.orgId ?? ctx.orgId,
            projectId: resolved.agentId,
            provider,
            realtimeModel,
            voiceId,
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

    if (!realtimeModel) {
      return NextResponse.json(
        { error: "OpenAI realtime model is not configured for this tenant." },
        { status: 503, headers: corsHeaders },
      );
    }
    if (!voiceId) {
      return NextResponse.json(
        { error: "OpenAI realtime voice is not configured for this tenant." },
        { status: 503, headers: corsHeaders },
      );
    }

    const instructions = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "realtime",
      allowedLanguages,
    });

    const turnDetection = {
      type: "server_vad" as const,
      threshold: audioPolicy.vadThreshold,
      prefix_padding_ms: audioPolicy.prefixPaddingMs,
      silence_duration_ms: audioPolicy.silenceDurationMs,
      create_response: false,
      interrupt_response: false,
    };

    const transcription = transcriptionModel
      ? {
          model: transcriptionModel,
          language: defaultLanguage ?? undefined,
        }
      : undefined;

    const realtimeSession = buildOpenAIRealtimeSession({
      model: realtimeModel,
      voice: voiceId,
      instructions,
      maxOutputTokens: maxTokens ?? undefined,
      turnDetection,
      transcription,
      tools: [],
      toolChoice: "none",
    });

    const result = await createOpenAIRealtimeClientSecret({ apiKey, session: realtimeSession });

    if (!result.ok) {
      console.error("[embed/session] OpenAI Realtime session creation failed", {
        status: result.status,
        provider,
        model: realtimeModel,
      });
      return NextResponse.json(
        {
          error: `OpenAI Realtime session creation failed (${result.status})`,
          details: result.errorText,
          model: realtimeModel,
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
        model: realtimeModel,
        voice: voiceId,
        max_output_tokens: maxTokens,
        turn_detection: turnDetection,
        input_audio_transcription: transcription,
        audio_policy: audioPolicy,
        kbId: ctx.kbId,
        orgId: resolved.orgId ?? ctx.orgId,
        projectId: resolved.agentId,
        provider,
        voiceProvider: voiceResolution.realtimeProvider,
        welcomeMessage: config.welcomeMessage ?? "",
        config: {
          orgId: resolved.orgId ?? ctx.orgId,
          projectId: resolved.agentId,
          provider,
          realtimeModel,
          voiceId,
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
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/session]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
