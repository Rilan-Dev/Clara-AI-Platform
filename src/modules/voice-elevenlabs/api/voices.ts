/**
 * src/modules/voice-elevenlabs/api/voices.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voice catalog endpoints.
 *
 *   GET  /api/voice/elevenlabs/voices            — org's synced catalog (DB)
 *   POST /api/voice/elevenlabs/voices/sync       — admin: sync workspace
 *                                                   voices into elevenlabs_voices
 *   POST /api/voice/elevenlabs/voices/preview    — TTS preview (capped, metered)
 *
 * Org catalog rows hold voice IDs + labels only — voice definitions and
 * audio stay at ElevenLabs. The sync endpoint is the ONLY path that reads
 * the workspace list, and it requires an admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { ElevenLabsError, listWorkspaceVoices } from "@/modules/voice-elevenlabs/core/client";
import { isElevenLabsEnabled } from "@/modules/voice-elevenlabs/core/config";

export interface ElevenLabsVoiceRow {
  id: string;
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  cloned: boolean;
  createdAt: string;
}

// ─── GET: org catalog ────────────────────────────────────────────────────────

export async function getElevenLabsVoices(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await requireAuth(request);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;

    // Platform admins may query any org; org users are scoped by middleware
    // role checks upstream — this endpoint is admin-console only.
    if (!orgId) {
      return NextResponse.json({ voices: [], models: [] });
    }

    const rows = await dbQuery<{
      id: string; voice_id: string; name: string; category: string | null;
      labels: unknown; description: string | null; cloned: boolean; created_at: string;
    }>(
      `SELECT id, voice_id, name, category, labels, description, cloned, created_at
         FROM elevenlabs_voices
        WHERE org_id = $1
        ORDER BY name`,
      [orgId],
    );

    const voices: ElevenLabsVoiceRow[] = rows.map((row) => {
      const labels: Record<string, string> = {};
      if (row.labels && typeof row.labels === "object" && !Array.isArray(row.labels)) {
        for (const [key, value] of Object.entries(row.labels as Record<string, unknown>)) {
          if (typeof value === "string") labels[key] = value;
        }
      }
      return {
        id: String(row.id),
        voiceId: row.voice_id,
        name: row.name,
        category: row.category,
        labels,
        description: row.description,
        cloned: Boolean(row.cloned),
        createdAt: String(row.created_at),
      };
    });

    return NextResponse.json({
      voices,
      enabled: isElevenLabsEnabled(),
    });
  } catch (error) {
    console.error("[elevenlabs-voices] get:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /sync: pull the ElevenLabs workspace voice list into the org catalog ─

export async function postElevenLabsVoicesSync(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    }

    if (!isElevenLabsEnabled()) {
      return NextResponse.json(
        { error: "ElevenLabs is not enabled on this platform (missing API key or kill switch off)." },
        { status: 503 },
      );
    }

    const workspaceVoices = await listWorkspaceVoices();
    if (workspaceVoices.length === 0) {
      return NextResponse.json({ synced: 0, voices: [] });
    }

    // Upsert each voice. Voice definitions stay at ElevenLabs — only ids,
    // names, labels are catalogued here (data minimisation).
    for (const voice of workspaceVoices) {
      if (!voice.voiceId) continue;
      await dbQuery(
        `INSERT INTO elevenlabs_voices (org_id, voice_id, name, category, labels, description, added_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (org_id, voice_id)
         DO UPDATE SET name = EXCLUDED.name,
                       category = EXCLUDED.category,
                       labels = EXCLUDED.labels,
                       description = EXCLUDED.description,
                       updated_at = now()`,
        [
          orgId,
          voice.voiceId,
          voice.name,
          voice.category,
          JSON.stringify(voice.labels ?? {}),
          voice.description,
          auth.user.id,
        ],
      );
    }

    return NextResponse.json({ synced: workspaceVoices.length });
  } catch (error) {
    console.error("[elevenlabs-voices] sync:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
