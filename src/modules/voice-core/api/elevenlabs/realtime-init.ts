/**
 * src/modules/voice-core/api/elevenlabs/realtime-init.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/elevenlabs/realtime-init — relay-only bootstrap for the
 * ElevenLabs Clara-realtime legs (Mode C, plan Tasks 6.2 + 6.3).
 *
 * Called IN-PROCESS by scripts/elevenlabs-relay.mjs with the
 * `x-elevenlabs-relay` HMAC header. Returns everything the relay needs to
 * open the two vendor WebSockets:
 *
 *   STT: wss://api.elevenlabs.io/v1/speech-to-text/realtime
 *        (scribe_v2_realtime, input_audio_chunk → partial/committed)
 *   TTS: wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input
 *        (eleven_flash_v2_5, incremental text + flush → base64 audio)
 *
 * Server-side re-resolution — the relay NEVER trusts client-suggested
 * models or voices. The vendor API key crosses to the relay only (never the
 * browser). Mirrors the Sarvam realtime-init contract.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { planGuard } from "@/lib/plan-guard";
import {
  getElevenLabsApiKey,
  getElevenLabsBaseUrl,
  getElevenLabsRealtimeSttModel,
  getPlatformDefaultTTSModel,
} from "../../model-catalog";
import { logSttUsage, logTtsUsage } from "../../metering";
import { VoiceConfigResolutionError, resolveVoiceConfigCached } from "../../resolve";
import { isElevenLabsRelayRequest } from "./realtime-auth";

// ─── POST /api/voice/elevenlabs/realtime-init ────────────────────────────────

export async function postElevenLabsRealtimeInit(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    if (!isElevenLabsRelayRequest(request.headers.get("x-elevenlabs-relay"))) {
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

    if (!(await isElevenLabsRealtimeEnabled())) {
      return NextResponse.json(
        { error: "ElevenLabs realtime is not enabled on this platform." },
        { status: 503 },
      );
    }

    const apiKey = getElevenLabsApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 503 });
    }

    // Rolling-24h STT budget per connection (mirrors the Sarvam relay gate).
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

    // Server-side re-resolution — the relay never trusts client suggestions.
    const resolved = await resolveVoiceConfigCached({ kbId, surface: "realtime" });
    if (
      (resolved.voiceProvider !== "elevenlabs" && resolved.realtimeProvider !== "elevenlabs") ||
      !resolved.elevenlabs
    ) {
      return NextResponse.json(
        { error: "Voice provider is not ElevenLabs for this knowledge base." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      apiKey,
      baseUrl: getElevenLabsBaseUrl(),
      sttModel: getElevenLabsRealtimeSttModel(),
      languageCode: resolved.elevenlabs.language ?? null,
      audioFormat: "pcm_16000",
      sampleRate: 16_000,
      orgId: resolved.brain.orgId ?? body.orgId ?? null,
      agentId: resolved.brain.agentId,
      tts: {
        model: resolved.elevenlabs.ttsModel ?? getPlatformDefaultTTSModel(),
        voiceId: resolved.elevenlabs.voiceId ?? null,
        outputFormat: "pcm_16000",
        sampleRate: 16_000,
      },
    });
  } catch (error) {
    console.error("[elevenlabs-realtime-init] post:", error);
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /api/internal/elevenlabs/realtime-meter ────────────────────────────

export async function postElevenLabsRealtimeMeter(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    if (!isElevenLabsRelayRequest(request.headers.get("x-elevenlabs-relay"))) {
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
      // Streaming TTS WebSocket metering — once per assistant generation
      // (plan Task 6.3: "Do not call TTS once per sentence" — same for billing).
      const characters = Number(body.characters);
      const model =
        typeof body.model === "string" && body.model ? body.model : "eleven_flash_v2_5";
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
        provider: "elevenlabs",
      });
      return NextResponse.json({ ok: true });
    }

    // STT: meter per committed transcript (audio seconds actually streamed).
    const model =
      typeof body.model === "string" && body.model ? body.model : "scribe_v2_realtime";
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
      provider: "elevenlabs",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[elevenlabs-realtime-meter] post:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
