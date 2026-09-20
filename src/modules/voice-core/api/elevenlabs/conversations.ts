/**
 * src/modules/voice-core/api/elevenlabs/conversations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mode B conversation history (V5).
 *
 *   GET  /api/voice/elevenlabs/conversations        — org-scoped records
 *   POST /api/voice/elevenlabs/conversations/sync   — admin: pull vendor
 *                                                      history into the table
 *
 * History is visible ORG-SCOPED ONLY (plan §14 V5 acceptance): every query
 * filters on org_id through the (id, org_id) composite-key discipline, and
 * the sync endpoint re-attributes vendor rows through the
 * elevenlabs_agents binding — never through a client-supplied org id alone.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { isConversationalAIEnabled, isElevenLabsEnabled, isValidUuid } from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { isConversationalVoiceService } from "../../types";
import { logConversationUsage } from "../../metering";

export interface ElevenLabsConversationRow {
  id: string;
  orgId: string;
  conversationId: string;
  vendorAgentId: string | null;
  claraAgentId: string | null;
  status: string;
  transcript: Array<Record<string, unknown>>;
  language: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

interface ConversationDbRow {
  id: string;
  org_id: string;
  conversation_id: string;
  agent_id: string | null;
  status: string;
  transcript: unknown;
  language: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: string | number | null;
  created_at: string;
  clara_agent_id: string | null;
}

function mapConversationRow(row: ConversationDbRow): ElevenLabsConversationRow {
  const transcript = Array.isArray(row.transcript)
    ? (row.transcript as Array<Record<string, unknown>>)
    : [];
  const duration =
    row.duration_seconds == null
      ? null
      : typeof row.duration_seconds === "number"
        ? row.duration_seconds
        : Number(row.duration_seconds);
  return {
    id: String(row.id),
    orgId: row.org_id,
    conversationId: row.conversation_id,
    vendorAgentId: row.agent_id,
    claraAgentId: row.clara_agent_id,
    status: row.status,
    transcript,
    language: row.language,
    startedAt: row.started_at ? String(row.started_at) : null,
    endedAt: row.ended_at ? String(row.ended_at) : null,
    durationSeconds: duration != null && Number.isFinite(duration) ? duration : null,
    createdAt: String(row.created_at),
  };
}

// ─── GET: org-scoped history ─────────────────────────────────────────────────

export async function getElevenLabsConversations(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await requireAuth(request);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;
    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.round(limitRaw), 1), 200) : 50;

    if (!orgId || !isValidUuid(orgId)) {
      return NextResponse.json({ conversations: [] });
    }

    // Org-scoped join through the binding — the composite-key discipline
    // keeps history attribution tied to tenant ownership.
    const rows = await dbQuery<ConversationDbRow>(
      `SELECT c.*, ea.agent_id AS clara_agent_id
         FROM elevenlabs_conversations c
         JOIN elevenlabs_agents ea ON ea.id = c.agent_mapping_id
        WHERE c.org_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2`,
      [orgId, limit],
    );

    return NextResponse.json({ conversations: rows.map(mapConversationRow) });
  } catch (error) {
    console.error("[elevenlabs-conversations] get:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /sync: pull vendor history into the org table ──────────────────────

export async function postElevenLabsConversationsSync(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
    if (!orgId || !isValidUuid(orgId)) {
      return NextResponse.json({ error: "A valid orgId is required." }, { status: 400 });
    }

    if (!isElevenLabsEnabled() || !isConversationalAIEnabled()) {
      return NextResponse.json(
        { error: "Conversational AI (Mode B) is not enabled on this platform." },
        { status: 503 },
      );
    }

    // The org's active bindings — history is synced per binding so every
    // vendor row lands with tenant attribution.
    const bindings = await dbQuery<{
      id: string;
      elevenlabs_agent_id: string;
      agent_id: string;
      config_snapshot: unknown;
    }>(
      `SELECT id, elevenlabs_agent_id, agent_id, config_snapshot
         FROM elevenlabs_agents
        WHERE org_id = $1 AND mode = 'conversational' AND enabled = TRUE`,
      [orgId],
    );
    if (bindings.length === 0) {
      return NextResponse.json({ synced: 0 });
    }

    const service = VoiceProviderFactory.getVoiceService();
    if (!isConversationalVoiceService(service)) {
      return NextResponse.json({ error: "Voice provider does not support Conversational AI." }, { status: 501 });
    }

    let synced = 0;
    for (const binding of bindings) {
      const history = await service.listConversations({ agentId: binding.elevenlabs_agent_id });
      const snapshot: Record<string, unknown> =
        binding.config_snapshot && typeof binding.config_snapshot === "object" && !Array.isArray(binding.config_snapshot)
          ? (binding.config_snapshot as Record<string, unknown>)
          : {};
      const kbId = typeof snapshot.kbId === "string" ? snapshot.kbId : null;

      for (const item of history) {
        if (!item.conversationId) continue;
        const durationSeconds =
          item.startedAtUnix != null && item.endedAtUnix != null && item.endedAtUnix > item.startedAtUnix
            ? Math.round(item.endedAtUnix - item.startedAtUnix)
            : null;

        const rows = await dbQuery<{ inserted: boolean }>(
          `INSERT INTO elevenlabs_conversations
             (org_id, agent_mapping_id, conversation_id, agent_id, status,
              started_at, ended_at, duration_seconds, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
           ON CONFLICT (org_id, conversation_id) DO NOTHING
           RETURNING TRUE AS inserted`,
          [
            orgId,
            binding.id,
            item.conversationId,
            binding.elevenlabs_agent_id,
            item.status === "processing" || item.status === "failed" ? item.status : "done",
            item.startedAtUnix != null ? new Date(item.startedAtUnix * 1000).toISOString() : null,
            item.endedAtUnix != null ? new Date(item.endedAtUnix * 1000).toISOString() : null,
            durationSeconds,
            JSON.stringify({ source: "history_sync" }),
          ],
        );
        if (rows.length === 0) continue; // already recorded (webhook beat us)
        synced++;

        // Vendor history rows carry no transcript here (fetched per
        // conversation on demand); meter duration when the vendor reported it.
        if (durationSeconds != null && durationSeconds > 0) {
          await logConversationUsage({
            orgId,
            kbId,
            agentId: binding.agent_id,
            model: "conversational",
            durationSeconds,
          });
        }
      }

      await dbQuery(
        `UPDATE elevenlabs_agents SET last_conversation_sync_at = now(), updated_at = now() WHERE id = $1`,
        [binding.id],
      );
    }

    return NextResponse.json({ synced });
  } catch (error) {
    console.error("[elevenlabs-conversations] sync:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
