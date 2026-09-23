/**
 * src/modules/voice-core/api/sarvam/transcribe.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/sarvam/transcribe — Saaras STT (Mode A speech-in).
 *
 * The ONLY data that crosses the Sarvam boundary here is the user's spoken
 * audio for this utterance (8 kHz-telephony-tuned Saaras also takes browser
 * webm/opus fine). No document, chunk, embedding, or KB metadata is ever
 * attached. The platform persists no raw audio; only the transcript (via the
 * normal chat pipeline) and a usage event.
 *
 * Guards: SARVAM_STT_RATE (30/min/org) + audio size caps + vendor 30 s /
 * platform 120 s duration caps + server-side re-resolution (never trust the
 * client). Utterance windows stay ≤ 25 s client-side (same discipline as
 * ElevenLabs); the V5 realtime relay removes the cap entirely.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, SARVAM_STT_RATE } from "@/lib/rate-limit";
import {
  SARVAM_STT_MAX_AUDIO_SECONDS,
  SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
  STT_MAX_AUDIO_BYTES,
  isValidUuid,
} from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { SarvamVoiceError } from "../../providers/sarvam";
import { logSttUsage } from "../../metering";
import { VoiceConfigResolutionError, resolveVoiceConfigCached } from "../../resolve";
import { embedVoiceGuard } from "../elevenlabs/embed-auth";

export async function postSarvamTranscribe(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "multipart/form-data body required." }, { status: 400 });
    }

    const kbId = typeof form.get("kbId") === "string" ? String(form.get("kbId")).trim() : null;
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio file is required." }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "audio file is empty." }, { status: 400 });
    }
    if (audio.size > STT_MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio too large (${audio.size} bytes). Maximum is ${STT_MAX_AUDIO_BYTES} bytes.` },
        { status: 413 },
      );
    }

    if (!kbId || !isValidUuid(kbId)) {
      return NextResponse.json({ error: "A valid kbId is required." }, { status: 400 });
    }

    // Embed-authenticated callers (clr_ API key from the public voice
    // surfaces): validate the key/KB pairing. No hourly-increment — this
    // route fires per utterance and the dedicated STT bucket already
    // throttles per org.
    const embedDenied = await embedVoiceGuard(request, kbId);
    if (embedDenied) return embedDenied;

    const orgRows = await dbQuery<{ org_id: string; agent_id: string }>(
      `SELECT a.org_id, a.id AS agent_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
      [kbId],
    );
    const orgId = orgRows[0]?.org_id ?? null;
    const agentId = orgRows[0]?.agent_id ?? null;

    {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip") ?? "unknown";
      const gate = hit(
        `sv-stt:${orgId ? `org:${orgId}` : `ip:${ip}`}`,
        SARVAM_STT_RATE.limit,
        SARVAM_STT_RATE.windowMs,
      );
      if (!gate.allowed) {
        const rl = rateLimitResponse(gate.retryAfterSec, "Speech-to-text rate limit reached. Please slow down.");
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }

    if (orgId) {
      // Rolling-24 h voice budget shared with ElevenLabs (provider-agnostic
      // max_stt_audio_sec_day column — one pool per org).
      const sttGuard = await planGuard(orgId, "stt");
      if (!sttGuard.allowed) {
        const blocked = sttGuard as { reason: string };
        return NextResponse.json(
          { error: "plan_limit_exceeded", code: "stt_limit_reached", message: blocked.reason },
          { status: 402 },
        );
      }
    }

    // Server-side re-resolution — the client-suggested model/language is
    // advisory only. Cached for 5 s (hot path fires per utterance). Realtime
    // axis to match the session bootstrap (see session.ts).
    const resolved = await resolveVoiceConfigCached({ kbId, surface: "realtime" });
    if (
      (resolved.voiceProvider !== "sarvam" && resolved.realtimeProvider !== "sarvam") ||
      !resolved.sarvam
    ) {
      return NextResponse.json(
        { error: "Voice provider is not Sarvam for this knowledge base.", provider: resolved.realtimeProvider },
        { status: 409 },
      );
    }

    const clientLanguage = typeof form.get("language") === "string" ? String(form.get("language")) : null;
    // Saaras auto-detects when language_code is omitted — only forward a
    // client hint when one was explicitly provided.
    const language = clientLanguage || null;

    const voiceService = VoiceProviderFactory.getVoiceService({ provider: "sarvam" });

    const startedAt = Date.now();
    const result = await voiceService.transcribeAudio({
      file: audio,
      modelId: resolved.sarvam.sttModel,
      languageCode: language,
    });
    const latencyMs = Date.now() - startedAt;

    // Meter from measured facts. WebM/Opus blobs carry no reliable duration
    // header, so estimate from byte size at 24 kbps Opus (conservative upper
    // bound for billing), clamped to the VENDOR cap — Saaras bills per
    // audio-second and rejects > 30 s anyway.
    const estimatedSeconds = Math.min(
      SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
      Math.max(1, Math.round((audio.size * 8) / 24_000)),
    );
    const audioSeconds = Math.min(
      SARVAM_STT_MAX_AUDIO_SECONDS,
      result.durationSeconds ?? estimatedSeconds,
    );
    await logSttUsage({
      orgId,
      kbId,
      agentId,
      model: resolved.sarvam.sttModel,
      latencyMs,
      audioSeconds,
      languageCode: result.languageCode ?? language,
      provider: "sarvam",
    });

    return NextResponse.json({
      text: result.text,
      language: result.languageCode ?? language ?? resolved.sarvam.language,
      audioSeconds,
      model: resolved.sarvam.sttModel,
      provider: "sarvam",
    });
  } catch (error) {
    console.error("[sarvam-transcribe] post:", error);
    if (error instanceof SarvamVoiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
