import { isElevenLabsEnabled, isElevenLabsRealtimeEnabled } from "@/modules/voice-core/server-provider-availability";
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
 *   • mode "pipeline"         — Mode A hybrid (default): STT + platform chat
 *                              + streaming TTS through platform endpoints.
 *   • mode "conversational"   — Mode B: an elevenlabs_agents binding exists
 *                              for the KB's agent, is enabled AND the org
 *                              has acknowledged the disclosed data flow.
 *                              Sessions are still minted separately by
 *                              /api/voice/elevenlabs/agent-session, which
 *                              re-applies every gate.
 *   • mode "clara-stream"     — Mode C: Clara-controlled realtime — Scribe
 *                              realtime STT relay → Clara turn (RAG+LLM) →
 *                              streaming TTS WebSocket relay, all behind
 *                              ELEVENLABS_REALTIME_ENABLED (plan Phase 6/13).
 *
 * Precedence: an existing Mode-B binding always wins (no behavior change for
 * deployed orgs); Mode C activates only when the realtime flag is on and no
 * binding exists; otherwise Mode A — which is unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getPlatformAIDefaults } from "@/modules/ai-core/resolve";
import {
  isConversationalAIEnabled,
} from "../model-catalog";
import { resolveVoiceConfigCached } from "../resolve";
import { query as dbQuery } from "@/lib/db";

export type ElevenLabsMode = "pipeline" | "conversational" | "clara-stream";

/** Mode-B binding lookup for the routing response (never a mint). */
async function resolveConversationalMode(
  orgId: string | null,
  agentId: string | null,
): Promise<"pipeline" | "conversational"> {
  if (!orgId || !agentId) return "pipeline";
  if (!(await isElevenLabsEnabled()) || !isConversationalAIEnabled()) return "pipeline";
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

/**
 * The tri-mode selector (plan Task 6.1): existing Mode-B binding wins,
 * then the flag-gated Clara realtime path, else the unchanged Mode A.
 */
async function resolveElevenLabsMode(
  orgId: string | null,
  agentId: string | null,
): Promise<ElevenLabsMode> {
  if ((await resolveConversationalMode(orgId, agentId)) === "conversational") {
    return "conversational";
  }
  if (await isElevenLabsRealtimeEnabled()) return "clara-stream";
  return "pipeline";
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
        // scope:"draft" — the authenticated agent preview resolves against
    // the CURRENT Main-branch draft instead of the immutable published
    // version (KB overrides apply; the LIVE collection is searched).
    const resolved = await resolveVoiceConfigCached({ kbId, surface: "realtime", ...(body.scope === "draft" ? { preferDraft: true } : {}) });

    // The voice modal IS the real-time voice assistant surface, so it routes
    // on the REALTIME purpose axis. That axis inherits the voice-chat axis
    // (which inherits the brain provider) when no explicit override exists —
    // so a single provider pick keeps every surface native to it.
    const mode: ElevenLabsMode =
      resolved.realtimeProvider === "elevenlabs"
        ? (
            // An explicit Realtime Voice selection means the operator chose
            // the Clara-controlled realtime agent, not the separate
            // ElevenLabs Conversational AI product. Keep legacy Mode-B
            // bindings only for inherited realtime selections.
            resolved.realtimeSource !== "voice_chat"
              ? "clara-stream"
              : await resolveElevenLabsMode(
                  resolved.brain.orgId,
                  resolved.brain.agentId ?? kb.agentId,
                )
          )
        : "pipeline";

    return NextResponse.json({
      provider: resolved.brain.provider,
      // Realtime-assistant purpose: 'elevenlabs' routes the browser to the
      // hybrid pipeline (Mode A) or Agents session (Mode B); openai/gemini
      // keep their existing realtime paths.
      voiceProvider: resolved.realtimeProvider,
      // Voice-chat purpose (chat-window voice-chat / Mode A) — same value as
      // voiceProvider unless the admin pinned a realtime override.
      voiceChatProvider: resolved.voiceProvider,
      // ElevenLabs mode split (plan Task 6.1): pipeline (Mode A) vs
      // conversational (Mode B) vs clara-stream (Mode C, flag-gated).
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
