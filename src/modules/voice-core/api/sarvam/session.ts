/**
 * src/modules/voice-core/api/sarvam/session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/sarvam/session — Sarvam Mode A pipeline bootstrap.
 *
 * Guard discipline mirrors elevenlabs/session.ts exactly:
 *   1. resolve org from kbId
 *   2. REALTIME_SESSION_RATE (10 / hour / org) — the SAME bucket as every
 *      other provider, so switching providers does not multiply budgets
 *   3. planGuard("voice") — 402 voice_not_enabled on free plans
 *   4. resolveVoiceConfig — surface flags + org allow-lists + kill switch
 *
 * Two callers:
 *   • platform sessions (floating assistant / workspace voice modal) — JWT
 *   • embed sessions (/embed/voice screen, /embed/widget mic) — clr_ API key;
 *     validated via embedVoiceGuard, and the returned chat descriptor points
 *     at /api/embed/chat so the whole pipeline runs on the embed credential.
 *
 * Returns capability descriptors ONLY — never keys. The browser talks
 * exclusively to platform endpoints; CSP is unchanged.
 *
 * The REALTIME voice agent always streams, end to end:
 *   mic ─► /api/voice/sarvam/realtime      (Saaras realtime STT relay)
 *   text ─► /api/chat | /api/embed/chat    (RAG + LLM, token stream)
 *   tokens ─► /api/voice/sarvam/tts-realtime (Bulbul streaming TTS relay)
 * The one-shot REST STT/TTS routes (transcribe / tts) serve the chat
 * window's turn-based Voice Chat instead — they are not part of this session.
 */

import { NextRequest, NextResponse } from "next/server";
import { localizeText } from "@/modules/rag/cross-lingual";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import {
  SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
  SARVAM_TTS_SAMPLE_RATE_HZ,
  getSarvamRealtimeTuning,
  isValidUuid,
} from "../../model-catalog";
import { VoiceConfigResolutionError, resolveVoiceConfig } from "../../resolve";
import { AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { embedVoiceGuard } from "../elevenlabs/embed-auth";
import { classifyVoicePipelineSession } from "../pipeline-chat-audience";
import { mintSarvamRealtimeToken } from "./realtime-auth";
import type { SarvamSessionPayload } from "../../config-types";

export async function postSarvamSession(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const ragMode = typeof body?.ragMode === "string" ? body.ragMode : "hybrid";

    if (!kbId || !isValidUuid(kbId)) {
      return NextResponse.json(
        { error: "A valid kbId is required for Sarvam voice sessions." },
        { status: 400 },
      );
    }

    await ensureMigrated();

    // Embed-authenticated sessions (clr_ API key): the key must be valid and
    // scoped to this KB before anything else runs.
    const embedDenied = await embedVoiceGuard(request, kbId);
    if (embedDenied) return embedDenied;
    const audience = classifyVoicePipelineSession(request.headers.get("authorization"));

    const orgRows = await dbQuery<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
      [kbId],
    );
    const orgId = orgRows[0]?.org_id ?? null;

    // ── Same bucket as the other realtime providers ──
    {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip") ?? "unknown";
      const gate = hit(
        `realtime:${orgId ? `org:${orgId}` : `ip:${ip}`}`,
        REALTIME_SESSION_RATE.limit,
        REALTIME_SESSION_RATE.windowMs,
      );
      if (!gate.allowed) {
        const rl = rateLimitResponse(
          gate.retryAfterSec,
          "Voice session limit reached for this organisation. Please try again later.",
        );
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }

    if (orgId) {
      const voiceGuard = await planGuard(orgId, "voice");
      if (!voiceGuard.allowed) {
        const blocked = voiceGuard as { reason: string };
        return NextResponse.json(
          { error: "plan_limit_exceeded", code: "voice_not_enabled", message: blocked.reason },
          { status: 402 },
        );
      }
    }

    // Realtime-axis resolution: every consumer of this pipeline (the voice
    // modal via /api/voice/provider, embed surfaces via /api/embed/session)
    // routes on the REALTIME purpose axis, so the session must resolve on the
    // same axis. Resolving on "voice_chat" starved the Sarvam arm for orgs
    // that pin realtime=sarvam while voice-chat runs another provider.
        // scope:"draft" — the authenticated agent preview resolves against
    // the CURRENT Main-branch draft instead of the immutable published
    // version (KB overrides apply; the LIVE collection is searched).
    const resolved = await resolveVoiceConfig({ kbId, surface: "realtime", ...(body.scope === "draft" ? { preferDraft: true } : {}) });
    const pipelineSelected =
      resolved.voiceProvider === "sarvam" || resolved.realtimeProvider === "sarvam";
    if (!pipelineSelected || !resolved.sarvam) {
      return NextResponse.json(
        {
          error: "Voice provider resolved to a non-Sarvam provider for this knowledge base.",
          provider: resolved.realtimeProvider,
          voiceChatProvider: resolved.voiceProvider,
        },
        { status: 409 },
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "This knowledge base is not linked to an organisation, so a realtime voice session cannot start." },
        { status: 409 },
      );
    }

    const payload: SarvamSessionPayload = {
      mode: "clara-stream",
      stt: {
        endpoint: "/api/voice/sarvam/transcribe",
        model: resolved.sarvam.sttModel,
        // Policy-based: "unknown" (auto-detect) for multi-language assistants.
        language: resolved.sarvam.sttLanguage ?? resolved.sarvam.language,
        sampleRate: SARVAM_TTS_SAMPLE_RATE_HZ,
        maxAudioSeconds: SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
        realtime: {
          endpoint: "/api/voice/sarvam/realtime",
          ttsEndpoint: "/api/voice/sarvam/tts-realtime",
          // Session-minted HMAC token — the relays verify signature + expiry
          // in-process (no key, no DB round-trip per connection).
          token: mintSarvamRealtimeToken({ kbId, orgId }),
          sampleRate: SARVAM_TTS_SAMPLE_RATE_HZ,
          encoding: "linear16",
          vadSilenceMs: getSarvamRealtimeTuning().vad.silenceMs,
          model: resolved.sarvam.realtimeSttModel,
        },
      },
      tts: {
        endpoint: "/api/voice/sarvam/tts-realtime",
        model: resolved.sarvam.realtimeTtsModel,
        speaker: resolved.sarvam.realtimeSpeaker,
        outputFormat: "pcm_24000",
        // Starting language — each reply is voiced in its own language.
        language: resolved.sarvam.language,
      },
      chat: {
        // Public visitors use /api/public/chat; widget users use /api/embed/chat; authenticated Preview keeps /api/chat.
        endpoint: audience.chatEndpoint,
        kbId,
        ragMode,
      },
      provider: "sarvam",
      kbId,
      ragMode,
      languages: resolved.brain.allowedLanguages,
      realtime: {
        sttModel: resolved.sarvam.realtimeSttModel,
        llmModel: resolved.sarvam.realtimeLlmModel,
        ttsModel: resolved.sarvam.realtimeTtsModel,
        ttsEnabled: resolved.sarvam.realtimeTtsEnabled,
      },
    };

    // The conversation starts in the assistant's DEFAULT language: these
    // voices speak the welcome verbatim, so localise it when the admin wrote
    // it in another language (cached; falls back to the original text).
    const welcome = resolved.brain.assistantConfig?.welcomeMessage?.trim();
    if (welcome) {
      const startLanguage =
        resolved.brain.assistantConfig?.alwaysRespondIn?.trim() || resolved.brain.defaultLanguage || "en";
      payload.greeting = await localizeText(welcome, startLanguage);
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[sarvam-session] post:", error);
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
