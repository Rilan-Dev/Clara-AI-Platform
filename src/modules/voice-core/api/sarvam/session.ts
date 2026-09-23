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
 * Returns capability descriptors ONLY — never keys. In Mode A the browser
 * talks exclusively to platform endpoints; CSP is unchanged. When the V5
 * realtime STT relay is enabled the payload carries the relay descriptor
 * (still our own origin — wss: to self is already allowed).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import {
  SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
  SARVAM_TTS_SAMPLE_RATE_HZ,
  isValidUuid,
} from "../../model-catalog";
import { VoiceConfigResolutionError, resolveVoiceConfig } from "../../resolve";
import { AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { embedVoiceGuard } from "../elevenlabs/embed-auth";
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
    const isEmbedSession = (request.headers.get("authorization") ?? "").startsWith("Bearer clr_");

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
    const resolved = await resolveVoiceConfig({ kbId, surface: "realtime" });
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

    const payload: SarvamSessionPayload = {
      mode: "pipeline",
      stt: {
        endpoint: "/api/voice/sarvam/transcribe",
        model: resolved.sarvam.sttModel,
        language: resolved.sarvam.language,
        sampleRate: SARVAM_TTS_SAMPLE_RATE_HZ,
        maxAudioSeconds: SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
        ...(resolved.sarvam.realtimeSttEnabled && orgId
          ? {
              realtime: {
                endpoint: "/api/voice/sarvam/realtime",
                // Session-minted HMAC token — the relay verifies signature +
                // expiry in-process (no key, no DB round-trip per connection).
                token: mintSarvamRealtimeToken({ kbId, orgId }),
                sampleRate: SARVAM_TTS_SAMPLE_RATE_HZ,
                encoding: "linear16",
                vadSilenceMs: 500,
                model: resolved.sarvam.realtimeSttModel,
              },
            }
          : {}),
      },
      tts: {
        endpoint: "/api/voice/sarvam/tts",
        model: resolved.sarvam.voiceChatTtsModel,
        speaker: resolved.sarvam.voiceChatSpeaker,
        outputFormat: `pcm_${SARVAM_TTS_SAMPLE_RATE_HZ}`,
        language: resolved.sarvam.language,
      },
      chat: {
        // Embed sessions run the whole pipeline on the clr_ credential.
        endpoint: isEmbedSession ? "/api/embed/chat" : "/api/chat",
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
