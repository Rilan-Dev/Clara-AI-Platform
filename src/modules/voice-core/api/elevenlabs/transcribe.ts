/**
 * src/modules/voice-core/api/elevenlabs/transcribe.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/elevenlabs/transcribe — Scribe STT (Mode A speech-in).
 *
 * The ONLY data that crosses the ElevenLabs boundary here is the user's
 * spoken audio for this utterance. No document, chunk, embedding, or KB
 * metadata is ever attached. The platform persists no raw audio; only the
 * redacted transcript (via the normal chat pipeline) and a usage event.
 *
 * Guards: ELEVENLABS_STT_RATE (30/min/org) + audio size/duration caps +
 * re-resolution of the voice config server-side (never trust the client).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, ELEVENLABS_STT_RATE } from "@/lib/rate-limit";
import { STT_MAX_AUDIO_BYTES, STT_MAX_AUDIO_SECONDS, isValidUuid } from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { logSttUsage } from "../../metering";
import { VoiceConfigResolutionError, resolveVoiceConfigCached } from "../../resolve";
import { embedVoiceGuard } from "./embed-auth";

export async function postElevenLabsTranscribe(request: NextRequest): Promise<NextResponse> {
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
    // throttles per org (see embed-auth.ts for the rationale).
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
        `el-stt:${orgId ? `org:${orgId}` : `ip:${ip}`}`,
        ELEVENLABS_STT_RATE.limit,
        ELEVENLABS_STT_RATE.windowMs,
      );
      if (!gate.allowed) {
        const rl = rateLimitResponse(gate.retryAfterSec, "Speech-to-text rate limit reached. Please slow down.");
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }

    if (orgId) {
      // Rolling-24 h voice budget (dormant until operators set plan values).
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
    // advisory only, exactly like realtime.ts re-validates the voice.
    // Cached for 5 s (hot path fires per utterance). Realtime axis to match
    // the session bootstrap (see session.ts).
        // scope:"draft" — the authenticated agent preview resolves against
    // the CURRENT Main-branch draft instead of the immutable published
    // version (KB overrides apply; the LIVE collection is searched).
    const resolved = await resolveVoiceConfigCached({ kbId, surface: "realtime", ...(form.get("scope") === "draft" ? { preferDraft: true } : {}) });
    // Either voice purpose selects the pipeline (voice-chat axis, or the
    // realtime axis using Mode A as its fallback / embed transport).
    if (
      (resolved.voiceProvider !== "elevenlabs" && resolved.realtimeProvider !== "elevenlabs") ||
      !resolved.elevenlabs
    ) {
      return NextResponse.json(
        { error: "Voice provider is not ElevenLabs for this knowledge base.", provider: resolved.realtimeProvider },
        { status: 409 },
      );
    }

    const clientLanguage = typeof form.get("language") === "string" ? String(form.get("language")) : null;
    const language = clientLanguage || resolved.elevenlabs.language || null;

    const voiceService = VoiceProviderFactory.getVoiceService();

    const startedAt = Date.now();
    const result = await voiceService.transcribeAudio({
      file: audio,
      modelId: resolved.elevenlabs.sttModel,
      languageCode: language,
    });
    const latencyMs = Date.now() - startedAt;

    // Meter from measured facts. WebM/Opus blobs carry no reliable duration
    // header, so estimate from byte size at 24 kbps Opus (a conservative
    // upper bound for billing, erring toward the platform).
    const estimatedSeconds = Math.min(
      STT_MAX_AUDIO_SECONDS,
      Math.max(1, Math.round((audio.size * 8) / 24_000)),
    );
    const audioSeconds = result.durationSeconds ?? estimatedSeconds;
    await logSttUsage({
      orgId,
      kbId,
      agentId,
      model: resolved.elevenlabs.sttModel,
      latencyMs,
      audioSeconds,
      languageCode: language,
    });

    return NextResponse.json({
      text: result.text,
      language: result.languageCode ?? language,
      audioSeconds,
      model: resolved.elevenlabs.sttModel,
      provider: "elevenlabs",
    });
  } catch (error) {
    console.error("[elevenlabs-transcribe] post:", error);
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
