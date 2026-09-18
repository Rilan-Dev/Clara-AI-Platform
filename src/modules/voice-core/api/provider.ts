/**
 * src/modules/voice-core/api/provider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/provider — voice-provider routing lookup for the browser.
 *
 * Returns which provider serves the voice surface for a knowledge base so
 * useVoiceClient can route to the right hook (useOpenAIRealtime /
 * useGeminiLive / useElevenLabsVoice / useElevenLabsConvAI) BEFORE
 * allocating any audio resources. Capability flags only — never keys, never
 * model secrets.
 *
 * The elevenlabs branch additionally reports WHICH mode applies:
 *   • mode "pipeline"        — Mode A hybrid (default): STT + platform chat
 *                              + streaming TTS through platform endpoints.
 *   • mode "conversational"  — Mode B: an elevenlabs_agents binding exists
 *                              for the KB's agent, is enabled AND the org
 *                              has acknowledged the disclosed data flow.
 *                              Sessions are still minted separately by
 *                              /api/voice/elevenlabs/agent-session, which
 *                              re-applies every gate.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getPlatformAIDefaults } from "@/modules/ai-core/resolve";
import { isConversationalAIEnabled, isElevenLabsEnabled } from "../model-catalog";
import { resolveVoiceConfig } from "../resolve";
import { query as dbQuery } from "@/lib/db";

/** Mode-B binding lookup for the routing response (never a mint). */
async function resolveConversationalMode(
  orgId: string | null,
  agentId: string | null,
): Promise<"pipeline" | "conversational"> {
  if (!orgId || !agentId) return "pipeline";
  if (!isElevenLabsEnabled() || !isConversationalAIEnabled()) return "pipeline";
  try {
    const rows = await dbQuery<{ id: string }>(
      `SELECT id FROM elevenlabs_agents
        WHERE org_id = $1 AND agent_id = $2 AND mode = 'conversational'
          AND enabled = TRUE AND org_acknowledged_data_flow = TRUE`,
      [orgId, agentId],
    );
    return rows.length > 0 ? "conversational" : "pipeline";
  } catch {
    // Table not migrated yet — Mode A is the only possible mode.
    return "pipeline";
  }
}

export async function postVoiceProvider(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : null;

    if (!kbId) {
      const defaults = getPlatformAIDefaults();
      return NextResponse.json({
        provider: defaults.provider,
        voiceProvider: defaults.provider,
        mode: "pipeline",
        flags: {
          voiceEnabled: true,
          realtimeEnabled: true,
        },
      });
    }

    await ensureMigrated();
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    // Full voice-surface resolution (kb → agent → org → env, allow-lists,
    // kill switch, surface flags) — same guards the session endpoints apply.
    const resolved = await resolveVoiceConfig({ kbId, surface: "realtime" });

    const mode =
      resolved.voiceProvider === "elevenlabs"
        ? await resolveConversationalMode(resolved.brain.orgId, resolved.brain.agentId ?? kb.agentId)
        : "pipeline";

    return NextResponse.json({
      provider: resolved.brain.provider,
      // Voice-provider axis: 'elevenlabs' routes the browser to the hybrid
      // pipeline; openai/gemini keep their existing realtime paths.
      voiceProvider: resolved.voiceProvider,
      // ElevenLabs mode split: pipeline (Mode A) vs conversational (Mode B).
      mode,
      flags: {
        voiceEnabled: resolved.brain.flags.voiceEnabled,
        realtimeEnabled: resolved.brain.flags.realtimeEnabled,
      },
    });
  } catch (error) {
    console.error("[voice-provider] post:", error);
    // Surface resolution failures (disabled voice, not-allowed provider, kill
    // switch) as a 400 the client can render directly — same contract the
    // realtime session endpoints use.
    const message = (error as Error).message ?? "Voice configuration could not be resolved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
