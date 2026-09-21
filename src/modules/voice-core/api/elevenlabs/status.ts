/**
 * src/modules/voice-core/api/elevenlabs/status.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/admin/elevenlabs/status — operator connection test.
 *
 * Server-side probe of the vendor subscription endpoint. Returns masked
 * account health (tier, credits burn-down, cloning availability) plus the
 * effective kill-switch states. The API key itself never crosses this
 * boundary in any direction.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  getPlatformDefaultSTTModel,
  getPlatformDefaultTTSModel,
  isConversationalAIEnabled,
  isElevenLabsEnabled,
  isVoiceCloningEnabled,
  isVoiceDesignEnabled,
} from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { evaluateCreditBurn } from "../../credit-alerts";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export async function getElevenLabsStatus(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const enabled = isElevenLabsEnabled();

    // Kill-switch states are always reported so the admin panel can render
    // the full control surface even before a key is configured.
    const speechEngineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID?.trim() || null;
    const speechEngineEnabled = (process.env.ELEVENLABS_SPEECH_ENGINE_ENABLED ?? "false").toLowerCase() === "true";
    let speechEngine: {
      enabled: boolean;
      configured: boolean;
      engineId: string | null;
      wsUrl: string | null;
      ttsModel: string | null;
      voiceId: string | null;
      ready: boolean;
      reason?: string;
    } = {
      enabled: speechEngineEnabled,
      configured: Boolean(speechEngineId && process.env.ELEVENLABS_API_KEY),
      engineId: speechEngineId,
      wsUrl: null,
      ttsModel: null,
      voiceId: null,
      ready: false,
    };

    if (speechEngineId && process.env.ELEVENLABS_API_KEY) {
      try {
        const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
        const engine = await client.speechEngine.get(speechEngineId);
        speechEngine = {
          ...speechEngine,
          engineId: engine.engineId,
          // SpeechEngineResource keeps the API payload on `.config`
          // (Omit<SpeechEngineResponse, "speechEngineId">): the upstream
          // transcript server WebSocket URL lives at
          // config.speechEngine.wsUrl and the TTS voice/model pair at
          // config.tts.{modelId,voiceId} — none of these exist flat on
          // the resource itself.
          wsUrl: engine.config?.speechEngine?.wsUrl ?? null,
          ttsModel: engine.config?.tts?.modelId ?? null,
          voiceId: engine.config?.tts?.voiceId ?? null,
          ready: speechEngineEnabled && engine.engineId === speechEngineId,
          reason:
            speechEngineEnabled && engine.engineId === speechEngineId
              ? undefined
              : "Speech Engine is disabled or the configured ElevenLabs Speech Engine ID could not be verified.",
        };
      } catch (error) {
        speechEngine.reason = error instanceof Error ? error.message : "Speech Engine lookup failed";
      }
    } else {
      speechEngine.reason = "Set ELEVENLABS_SPEECH_ENGINE_ID and ELEVENLABS_API_KEY.";
    }

    const flags = {
      enabled,
      speechEngine,
      conversationalAI: isConversationalAIEnabled(),
      voiceCloning: isVoiceCloningEnabled(),
      voiceDesign: isVoiceDesignEnabled(),
      defaultTtsModel: getPlatformDefaultTTSModel(),
      defaultSttModel: getPlatformDefaultSTTModel(),
    };

    if (!enabled) {
      return NextResponse.json({
        connected: false,
        reason: "ELEVENLABS_ENABLED is off or ELEVENLABS_API_KEY is not configured.",
        ...flags,
      });
    }

    const subscription = await VoiceProviderFactory.getVoiceService().getSubscriptionInfo();
    const usagePct = subscription.characterLimit > 0
      ? Math.round((subscription.characterCount / subscription.characterLimit) * 100)
      : null;

    // V6 credit-burn alerting: evaluate on every operator health probe —
    // records the crossing and queues super-admin notifications once per
    // (threshold, limit) pair. Never throws into the status payload.
    const burn = await evaluateCreditBurn(subscription);

    return NextResponse.json({
      connected: true,
      tier: subscription.tier,
      characterCount: subscription.characterCount,
      characterLimit: subscription.characterLimit,
      characterUsagePercent: usagePct,
      nextCharacterCountResetUnix: subscription.nextCharacterCountResetUnix,
      voiceLimit: subscription.voiceLimit,
      canUseInstantCloning: subscription.canUseInstantCloning,
      creditAlert: {
        thresholdPct: burn.thresholdPct,
        usagePercent: burn.usagePercent,
        crossed: burn.crossed,
        alerted: burn.alerted,
      },
      ...flags,
    });
  } catch (error) {
    console.error("[elevenlabs-status] get:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json(
        { connected: false, reason: error.message },
        { status: 200 }, // still 200 — the panel renders the failure state
      );
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
