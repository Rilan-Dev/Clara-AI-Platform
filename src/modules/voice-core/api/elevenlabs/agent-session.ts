/**
 * src/modules/voice-core/api/elevenlabs/agent-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/elevenlabs/agent-session — Mode B (Conversational AI)
 * signed-URL bootstrap.
 *
 * Guard discipline mirrors session.ts (Mode A) exactly, plus the Mode-B
 * opt-in ladder (plan §6, §14 V4 acceptance):
 *   1. resolve org from kbId
 *   2. REALTIME_SESSION_RATE (10 / hour / org) — the SAME bucket as every
 *      other session endpoint
 *   3. planGuard("voice") — 402 voice_not_enabled on free plans
 *   4. resolveVoiceConfig — surface flags + allow-lists + kill switch
 *   5. Mode-B gates: platform flag on → binding exists + enabled +
 *      org_acknowledged_data_flow TRUE → else 403/404 with a clear reason
 *
 * Mode B is NEVER exposed on public embeds (plan §8.3 attack-surface
 * minimisation): the embed surface resolves through the pipeline session,
 * never through this handler — enforced below by rejecting embed API-key
 * callers outright.
 *
 * Returns the short-lived signed URL + capability descriptors ONLY.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import { isConversationalAIEnabled, isElevenLabsEnabled, isValidUuid } from "../../model-catalog";
import { VoiceConfigResolutionError, resolveVoiceConfig } from "../../resolve";
import { AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { isConversationalVoiceService } from "../../types";

export async function postElevenLabsAgentSession(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 0. Mode-B platform gates (cheapest checks first) ────────────────────
    if (!isElevenLabsEnabled() || !isConversationalAIEnabled()) {
      return NextResponse.json(
        {
          error:
            "Conversational AI (Mode B) is not available on this platform. " +
            "The hybrid pipeline (Mode A) remains available for voice conversations.",
        },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;

    if (!kbId || !isValidUuid(kbId)) {
      return NextResponse.json(
        { error: "A valid kbId is required for Mode-B voice sessions." },
        { status: 400 },
      );
    }

    await ensureMigrated();

    // ── Public embeds never get Mode B (plan §8.3) ──────────────────────────
    // Embed sessions authenticate with an API key header; platform users
    // carry a Bearer JWT. Reject the embed credential shape before any
    // further work happens.
    const embedApiKey = request.headers.get("x-api-key") ?? request.headers.get("x-embed-api-key");
    if (embedApiKey) {
      return NextResponse.json(
        {
          error:
            "Conversational AI sessions are not available on embed surfaces. " +
            "Use the hybrid pipeline session endpoint instead.",
        },
        { status: 403 },
      );
    }

    // ── 1. Org resolution from the KB ────────────────────────────────────────
    const orgRows = await dbQuery<{ org_id: string; agent_id: string }>(
      `SELECT a.org_id, a.id AS agent_id
         FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id
        WHERE kb.id = $1`,
      [kbId],
    );
    const orgId = orgRows[0]?.org_id ?? null;
    const claraAgentId = orgRows[0]?.agent_id ?? null;

    if (!orgId || !claraAgentId) {
      return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
    }

    // ── 2. Same session bucket as every other provider ──────────────────────
    {
      const gate = hit(
        `realtime:org:${orgId}`,
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

    // ── 3. Plan gate ────────────────────────────────────────────────────────
    const voiceGuard = await planGuard(orgId, "voice");
    if (!voiceGuard.allowed) {
      const blocked = voiceGuard as { reason: string };
      return NextResponse.json(
        { error: "plan_limit_exceeded", code: "voice_not_enabled", message: blocked.reason },
        { status: 402 },
      );
    }

    // ── 4. Voice-provider resolution (allow-lists + kill switch) ─────────────
    // Mode B is a REALTIME-purpose session (true streaming duplex), so the
    // realtime axis selects it — either directly (realtime_voice_provider =
    // 'elevenlabs') or by inheriting the voice-chat axis.
    const resolved = await resolveVoiceConfig({ kbId, surface: "realtime" });
    if (resolved.realtimeProvider !== "elevenlabs") {
      return NextResponse.json(
        {
          error: "Voice provider resolved to a non-ElevenLabs provider for this knowledge base.",
          provider: resolved.realtimeProvider,
        },
        { status: 409 },
      );
    }

    // ── 5. Mode-B binding gates (acknowledgement ladder) ─────────────────────
    const bindings = await dbQuery<{
      id: string;
      elevenlabs_agent_id: string;
      enabled: boolean;
      org_acknowledged_data_flow: boolean;
    }>(
      `SELECT id, elevenlabs_agent_id, enabled, org_acknowledged_data_flow
         FROM elevenlabs_agents
        WHERE org_id = $1 AND agent_id = $2 AND mode = 'conversational'`,
      [orgId, claraAgentId],
    );
    const binding = bindings[0];
    if (!binding) {
      return NextResponse.json(
        {
          error:
            "No Conversational AI agent is bound to this assistant. " +
            "An organisation admin must create one in Settings → AI Providers & Models.",
        },
        { status: 404 },
      );
    }
    if (!binding.enabled) {
      return NextResponse.json(
        { error: "The Conversational AI agent binding is disabled." },
        { status: 403 },
      );
    }
    if (!binding.org_acknowledged_data_flow) {
      return NextResponse.json(
        {
          error:
            "Mode B requires the organisation to acknowledge the disclosed data flow " +
            "(per-turn answer snippets transit ElevenLabs; documents never leave Clara). " +
            "An organisation admin must accept the disclosure before sessions can start.",
          code: "mode_b_acknowledgement_required",
        },
        { status: 403 },
      );
    }

    // ── 6. Mint the signed URL (short TTL, server-side only) ────────────────
    const service = VoiceProviderFactory.getVoiceService();
    if (!isConversationalVoiceService(service)) {
      return NextResponse.json(
        { error: "Voice provider does not support Conversational AI." },
        { status: 501 },
      );
    }
    const signed = await service.getAgentSignedUrl(binding.elevenlabs_agent_id);

    return NextResponse.json({
      mode: "conversational",
      provider: "elevenlabs",
      signedUrl: signed.signedUrl,
      expiresAt: signed.expiresAt,
      agentId: binding.elevenlabs_agent_id,
      kbId,
      ragMode: typeof body?.ragMode === "string" ? body.ragMode : "hybrid",
    });
  } catch (error) {
    console.error("[elevenlabs-agent-session] post:", error);
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
