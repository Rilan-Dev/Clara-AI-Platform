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
} from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";

export async function getElevenLabsStatus(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const enabled = isElevenLabsEnabled();

    // Kill-switch states are always reported so the admin panel can render
    // the full control surface even before a key is configured.
    const flags = {
      enabled,
      conversationalAI: isConversationalAIEnabled(),
      voiceCloning: isVoiceCloningEnabled(),
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

    return NextResponse.json({
      connected: true,
      tier: subscription.tier,
      characterCount: subscription.characterCount,
      characterLimit: subscription.characterLimit,
      characterUsagePercent: usagePct,
      nextCharacterCountResetUnix: subscription.nextCharacterCountResetUnix,
      voiceLimit: subscription.voiceLimit,
      canUseInstantCloning: subscription.canUseInstantCloning,
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
