/**
 * src/modules/voice-core/api/sarvam/status.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/admin/sarvam/status — operator connection test.
 *
 * Sarvam publishes NO credits/subscription REST endpoint (dashboard-only), so
 * the probe is a 1-token chat completion: 200 ⇒ connected; 401/403 ⇒ bad key;
 * 429 ⇒ reachable but throttled. Spend visibility comes from the platform's
 * own usage_events (per-org metering rows), surfaced by the admin dashboards.
 *
 * Returns masked health + the effective kill-switch states. The API key
 * itself never crosses this boundary in any direction.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  getPlatformDefaultSarvamSpeaker,
  getPlatformDefaultSarvamSttModel,
  getPlatformDefaultSarvamTTSModel,
  getSarvamBaseUrl,
} from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { SarvamVoiceError } from "../../providers/sarvam";
import { getPlatformAIRegistry } from "@/modules/ai-governance/core/registry-db";

export async function getSarvamStatus(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const registry = await getPlatformAIRegistry();
    const provider = registry.providers.find((p) => p.providerId === "sarvam");
    const enabled = Boolean(provider?.enabled);

    const flags = {
      enabled,
      defaultTtsModel: getPlatformDefaultSarvamTTSModel(),
      defaultSttModel: getPlatformDefaultSarvamSttModel(),
      defaultSpeaker: getPlatformDefaultSarvamSpeaker(),
      baseUrl: getSarvamBaseUrl(),
      speakers: 37, // static SARVAM_SPEAKERS catalogue size
    };

    if (!enabled) {
      return NextResponse.json({
        connected: false,
        reason: !provider?.enabled
          ? "Sarvam is disabled in Platform AI Settings."
          : "Sarvam API key is not configured.",
        ...flags,
      });
    }

    // 1-token probe (see providers/sarvam.ts getSubscriptionInfo). A 429 maps
    // to "reachable but throttled" — connectivity itself is proven.
    const probe = await VoiceProviderFactory.getVoiceService({
      provider: "sarvam",
    }).getSubscriptionInfo();

    return NextResponse.json({
      connected: true,
      tier: probe.tier, // "api-probe-ok" | "rate-limited"
      voiceLimit: probe.voiceLimit,
      ...flags,
    });
  } catch (error) {
    console.error("[sarvam-status] get:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof SarvamVoiceError) {
      return NextResponse.json(
        { connected: false, reason: error.message },
        { status: 200 }, // still 200 — the panel renders the failure state
      );
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
