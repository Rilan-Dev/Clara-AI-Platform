/**
 * src/modules/voice-core/api/elevenlabs/session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/elevenlabs/session — Mode A pipeline bootstrap.
 *
 * Guard discipline mirrors src/modules/assistant/api/realtime.ts exactly:
 *   1. resolve org from kbId
 *   2. REALTIME_SESSION_RATE (10 / hour / org) — same bucket as the other
 *      providers, so switching providers does not multiply session budgets
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
 * talks exclusively to platform endpoints; CSP is unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import {
  STT_MAX_AUDIO_SECONDS,
  TTS_OUTPUT_FORMAT,
  getElevenLabsRealtimeSttModel,
  isValidUuid,
} from "../../model-catalog";
import { VoiceConfigResolutionError, resolveVoiceConfig } from "../../resolve";
import { AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { mintElevenLabsRealtimeToken } from "./realtime-auth";
import { embedVoiceGuard } from "./embed-auth";
import type { ElevenLabsSessionPayload } from "../../config-types";

export async function postElevenLabsSession(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const ragMode = typeof body?.ragMode === "string" ? body.ragMode : "hybrid";

    if (!kbId || !isValidUuid(kbId)) {
      return NextResponse.json(
        { error: "A valid kbId is required for ElevenLabs voice sessions." },
        { status: 400 },
      );
    }

    await ensureMigrated();

    // Embed-authenticated sessions (clr_ API key): the key must be valid and
    // scoped to this KB before anything else runs. Platform JWT / anonymous
    // requests keep the historical path.
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

    const resolved = await resolveVoiceConfig({ kbId, surface: "realtime" });
    // The pipeline serves EITHER voice purpose: the voice-chat axis (Mode A
    // as the chat-window voice-chat experience) or the realtime axis (Mode A
    // as the fallback when a realtime=elevenlabs config has no Mode-B
    // binding, and the embed surfaces where Mode B is refused by design).
    const pipelineSelected =
      resolved.voiceProvider === "elevenlabs" || resolved.realtimeProvider === "elevenlabs";
    if (!pipelineSelected || !resolved.elevenlabs) {
      // Config raced (provider switched mid-flight) — tell the client to
      // re-resolve rather than silently using the wrong provider.
      return NextResponse.json(
        {
          error: "Voice provider resolved to a non-ElevenLabs provider for this knowledge base.",
          provider: resolved.realtimeProvider,
        },
        { status: 409 },
      );
    }

    const payload: ElevenLabsSessionPayload = {
      mode: "pipeline",
      stt: {
        endpoint: "/api/voice/elevenlabs/transcribe",
        model: resolved.elevenlabs.sttModel,
        language: resolved.elevenlabs.language,
        sampleRate: 16_000,
        maxAudioSeconds: STT_MAX_AUDIO_SECONDS,
        // Mode C (Clara realtime, plan Task 6.2): the Scribe realtime relay
        // descriptor — same HMAC token discipline as the Sarvam V5 relay.
        // Embed sessions get it too: the token is capability-scoped (kb+org),
        // never a vendor credential.
        ...((await isElevenLabsRealtimeEnabled()) && orgId
          ? {
              realtime: {
                endpoint: "/api/voice/elevenlabs/realtime",
                token: mintElevenLabsRealtimeToken({ kbId, orgId }),
                ttsEndpoint: "/api/voice/elevenlabs/tts-realtime",
                sampleRate: 16_000,
                encoding: "linear16",
                model: getElevenLabsRealtimeSttModel(),
              },
            }
          : {}),
      },
      tts: {
        endpoint: "/api/voice/elevenlabs/tts",
        model: resolved.elevenlabs.ttsModel,
        voiceId: resolved.elevenlabs.voiceId,
        outputFormat: TTS_OUTPUT_FORMAT,
        voiceSettings: resolved.elevenlabs.voiceSettings,
      },
      chat: {
        // Embed sessions run the whole pipeline on the clr_ credential — the
        // public chat endpoint carries the org's embed rate/quota accounting.
        endpoint: isEmbedSession ? "/api/embed/chat" : "/api/chat",
        kbId,
        ragMode,
      },
      provider: "elevenlabs",
      kbId,
      ragMode,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[elevenlabs-session] post:", error);
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
