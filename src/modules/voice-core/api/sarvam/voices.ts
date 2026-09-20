/**
 * src/modules/voice-core/api/sarvam/voices.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voice catalog endpoints for the Sarvam axis.
 *
 *   GET  /api/voice/sarvam/voices           — STATIC Bulbul speaker catalogue
 *   POST /api/voice/sarvam/voices/preview   — TTS preview (capped, metered)
 *
 * Deliberately NO sync endpoint and NO per-org rows: Bulbul speakers are
 * enumerable string ids from a fixed vendor list (SARVAM_SPEAKERS in
 * model-catalog.ts) — there is no workspace to sync and no DB table
 * (an explicit simplification vs elevenlabs_voices/033, plan §3.2).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { requireAuth } from "@/modules/auth/core/rbac";
import { hit, rateLimitResponse, SARVAM_PREVIEW_RATE } from "@/lib/rate-limit";
import {
  SARVAM_PREVIEW_MAX_CHARS,
  SARVAM_TTS_SAMPLE_RATE_HZ,
  SARVAM_TTS_LANGUAGES,
  SARVAM_STT_LANGUAGES,
  SARVAM_TTS_MODELS,
  SARVAM_STT_MODELS,
  SARVAM_SPEAKERS,
  isSupportedSarvamSpeaker,
  isSupportedSarvamTTSModel,
  isValidUuid,
} from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { SarvamVoiceError } from "../../providers/sarvam";
import { logTtsUsage } from "../../metering";
import { VoiceConfigResolutionError, resolveVoiceConfigCached } from "../../resolve";
import { sanitizeTtsText } from "../../tts-text";
import { embedVoiceGuard } from "../elevenlabs/embed-auth";

// ─── GET: static catalogue ───────────────────────────────────────────────────

export async function getSarvamVoices(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await requireAuth(request);

    // Static catalogue — no vendor call, no DB round-trip, no sync button in
    // the settings UI (contrast the ElevenLabs flow).
    return NextResponse.json({
      provider: "sarvam",
      speakers: SARVAM_SPEAKERS,
      ttsModels: SARVAM_TTS_MODELS,
      sttModels: SARVAM_STT_MODELS,
      ttsLanguages: SARVAM_TTS_LANGUAGES,
      sttLanguages: SARVAM_STT_LANGUAGES,
      defaultSpeaker: SARVAM_SPEAKERS.find((speaker) => speaker.isDefault)?.id ?? "shubh",
    });
  } catch (error) {
    console.error("[sarvam-voices] get:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST: studio preview (capped + metered) ─────────────────────────────────

export async function postSarvamVoicePreview(request: NextRequest): Promise<NextResponse | Response> {
  try {
    await ensureMigrated();

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "JSON body required." }, { status: 400 });
    }

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : null;
    const text = typeof body.text === "string" ? body.text : "";

    if (!text.trim()) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }

    const speakableText = sanitizeTtsText(text);
    if (!speakableText) {
      return NextResponse.json(
        { error: "text contains nothing speakable after removing citations and markdown." },
        { status: 400 },
      );
    }
    if (speakableText.length > SARVAM_PREVIEW_MAX_CHARS) {
      return NextResponse.json(
        { error: `Preview text too long (${speakableText.length} chars). Maximum is ${SARVAM_PREVIEW_MAX_CHARS}.` },
        { status: 413 },
      );
    }

    if (!kbId || !isValidUuid(kbId)) {
      return NextResponse.json({ error: "A valid kbId is required." }, { status: 400 });
    }

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
        `sv-tts-preview:${orgId ? `org:${orgId}` : `ip:${ip}`}`,
        SARVAM_PREVIEW_RATE.limit,
        SARVAM_PREVIEW_RATE.windowMs,
      );
      if (!gate.allowed) {
        const rl = rateLimitResponse(gate.retryAfterSec, "Preview rate limit reached. Please slow down.");
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }

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

    const model = typeof body.model === "string" && isSupportedSarvamTTSModel(body.model)
      ? body.model
      : resolved.sarvam.voiceChatTtsModel;
    const speaker = typeof body.speaker === "string" && isSupportedSarvamSpeaker(body.speaker)
      ? body.speaker.trim().toLowerCase()
      : resolved.sarvam.voiceChatSpeaker;
    const language =
      typeof body.language === "string" && body.language ? body.language : resolved.sarvam.language;

    const voiceService = VoiceProviderFactory.getVoiceService({ provider: "sarvam" });

    const startedAt = Date.now();
    const audioResponse = await voiceService.speak({
      text: speakableText,
      voiceId: speaker,
      modelId: model,
      outputFormat: `pcm_${SARVAM_TTS_SAMPLE_RATE_HZ}`,
      languageCode: language,
    });
    const latencyMs = Date.now() - startedAt;

    await logTtsUsage({
      orgId,
      kbId,
      agentId,
      model,
      latencyMs,
      characters: speakableText.length,
      preview: true,
      provider: "sarvam",
    });

    const contentType = audioResponse.headers.get("Content-Type") ?? "application/octet-stream";
    return new Response(audioResponse.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Sarvam-Model": model,
        "X-Sarvam-Speaker": speaker,
      },
    });
  } catch (error) {
    console.error("[sarvam-preview] post:", error);
    if (error instanceof SarvamVoiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
