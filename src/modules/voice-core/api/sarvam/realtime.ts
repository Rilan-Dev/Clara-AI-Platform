/**
 * src/modules/voice-core/api/sarvam/realtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * INTERNAL routes backing the V5 Saaras realtime STT relay
 * (scripts/sarvam-relay.mjs).
 *
 *   POST /api/voice/sarvam/realtime-init   — relay bootstrap: resolved STT
 *                                            config + the vendor key (server
 *                                            to server only, never browser)
 *   POST /api/internal/sarvam/realtime-meter — STT metering per
 *                                            transcript.final
 *
 * Both are guarded by the x-sarvam-relay HMAC header (same AUTH_SECRET as
 * the in-process relay) — NOT client-reachable credentials. The browser
 * itself authenticates to the relay with the session-minted HMAC token and
 * can never reach these routes directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { planGuard } from "@/lib/plan-guard";
import {
  getSarvamApiKey,
  getSarvamBaseUrl,
  toSarvamRealtimeSttModel,
  getPlatformDefaultSarvamRealtimeSttModel,
  getPlatformDefaultSarvamRealtimeLlmModel,
  getSarvamRealtimeTuning,
} from "../../model-catalog";
import { logSttUsage, logTtsUsage } from "../../metering";
import { VoiceConfigResolutionError, resolveVoiceConfigCached } from "../../resolve";
import { isSarvamRelayRequest } from "./realtime-auth";

// ─── POST /api/voice/sarvam/realtime-init ────────────────────────────────────

export async function postSarvamRealtimeInit(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    if (!isSarvamRelayRequest(request.headers.get("x-sarvam-relay"))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as {
      kbId?: string;
      orgId?: string;
    };
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : null;
    if (!kbId) {
      return NextResponse.json({ error: "kbId is required." }, { status: 400 });
    }

    const apiKey = getSarvamApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "SARVAM_API_KEY is not configured." }, { status: 503 });
    }

    // Server-side re-resolution — the relay NEVER trusts client-suggested
    // models. planGuard enforces the rolling-24 h STT budget per connection.
    if (body.orgId) {
      const sttGuard = await planGuard(body.orgId, "stt");
      if (!sttGuard.allowed) {
        const blocked = sttGuard as { reason: string };
        return NextResponse.json(
          { error: "plan_limit_exceeded", code: "stt_limit_reached", message: blocked.reason },
          { status: 402 },
        );
      }
    }

    const resolved = await resolveVoiceConfigCached({ kbId, surface: "realtime" });
    if (
      (resolved.voiceProvider !== "sarvam" && resolved.realtimeProvider !== "sarvam") ||
      !resolved.sarvam
    ) {
      return NextResponse.json(
        { error: "Voice provider is not Sarvam for this knowledge base." },
        { status: 409 },
      );
    }

    // Saaras realtime model id — the resolved config stores the BATCH REST id
    // (saaras:v3 | saaras:v4); the vendor realtime WS only accepts
    // 'saaras:v3-realtime' | 'saaras:v4', so translate here (the relay also
    // maps defensively for older callers) and meter with the same id.
    const tuning = getSarvamRealtimeTuning();
    return NextResponse.json({
      apiKey,
      baseUrl: getSarvamBaseUrl(),
      // Platform-configurable endpointing (Settings → AI → Sarvam).
      vad: tuning.vad,
      sttModel: resolved.sarvam.realtimeSttModel || getPlatformDefaultSarvamRealtimeSttModel() || toSarvamRealtimeSttModel(resolved.sarvam.sttModel),
      // Policy-based: "unknown" (auto-detect) for multi-language assistants.
      languageCode: resolved.sarvam.sttLanguage ?? resolved.sarvam.language,
      sampleRate: resolved.sarvam.sampleRate,
      orgId: resolved.brain.orgId ?? body.orgId ?? null,
      agentId: resolved.brain.agentId,
      tts: {
        model: resolved.sarvam.realtimeTtsModel,
        speaker: resolved.sarvam.realtimeSpeaker,
        // Starting language — the relay re-configures per reply language.
        language: resolved.sarvam.language,
        sampleRate: 24_000,
        pace: tuning.ttsPace,
      },
      realtime: {
        sttModel: resolved.sarvam.realtimeSttModel || getPlatformDefaultSarvamRealtimeSttModel(),
        llmModel: resolved.sarvam.realtimeLlmModel || getPlatformDefaultSarvamRealtimeLlmModel(),
        ttsModel: resolved.sarvam.realtimeTtsModel,
      },
    });
  } catch (error) {
    console.error("[sarvam-realtime-init] post:", error);
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /api/internal/sarvam/realtime-meter ─────────────────────────────────

export async function postSarvamRealtimeMeter(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    if (!isSarvamRelayRequest(request.headers.get("x-sarvam-relay"))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as {
      orgId?: string | null;
      kbId?: string | null;
      agentId?: string | null;
      model?: string;
      audioSeconds?: number;
      languageCode?: string | null;
      /** "stt" (default) meters audio seconds; "tts" meters characters once per generation. */
      kind?: "stt" | "tts";
      characters?: number;
    };

    const orgId = typeof body.orgId === "string" ? body.orgId : null;
    const kbId = typeof body.kbId === "string" ? body.kbId : null;
    const agentId = typeof body.agentId === "string" ? body.agentId : null;

    if (body.kind === "tts") {
      // Realtime Bulbul TTS metering — called once per assistant generation
      // by the TTS relay (plan Task 5.3: "meter usage once", never per sentence).
      const characters = Number(body.characters);
      const model = typeof body.model === "string" && body.model ? body.model : "bulbul:v3";
      if (!orgId || !Number.isFinite(characters) || characters <= 0) {
        return NextResponse.json(
          { error: "orgId and characters are required for tts metering." },
          { status: 400 },
        );
      }
      await logTtsUsage({
        orgId,
        kbId,
        agentId,
        model,
        characters: Math.round(characters),
        provider: "sarvam",
      });
      return NextResponse.json({ ok: true });
    }

    const model = typeof body.model === "string" && body.model ? body.model : "saaras:v3-realtime";
    const audioSeconds = Number(body.audioSeconds);

    if (!orgId || !Number.isFinite(audioSeconds) || audioSeconds <= 0) {
      return NextResponse.json({ error: "orgId and audioSeconds are required." }, { status: 400 });
    }

    await logSttUsage({
      orgId,
      kbId,
      agentId,
      model,
      audioSeconds,
      languageCode: typeof body.languageCode === "string" ? body.languageCode : null,
      provider: "sarvam",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sarvam-realtime-meter] post:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
