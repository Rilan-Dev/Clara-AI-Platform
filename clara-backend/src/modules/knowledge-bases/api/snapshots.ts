/**
 * src/modules/knowledge-bases/api/snapshots.ts
 * Config snapshot API handlers.
 *
 * GET  /api/kbs/[kbId]/config/snapshots                         → list last 5
 * POST /api/kbs/[kbId]/config/snapshots                         → manual save
 * POST /api/kbs/[kbId]/config/snapshots/[snapshotId]/restore    → restore
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById, getAssistantConfig, putAssistantConfig } from "../core/db";
import {
  listSnapshots,
  getSnapshot,
  snapshotConfig,
} from "../core/snapshots-db";
import type { PutAssistantConfigInput } from "../core/models";

// ── GET /api/kbs/[kbId]/config/snapshots ─────────────────────────────────────

export async function listSnapshotsHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:read");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

    const snapshots = await listSnapshots(kbId);
    return NextResponse.json(snapshots);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/kbs/[kbId]/config/snapshots (manual save) ──────────────────────

export async function createSnapshotHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:update");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

    const config = await getAssistantConfig(kbId);
    if (!config) {
      return NextResponse.json({ error: "AssistantConfig not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({})) as { label?: string };
    const snapshot = await snapshotConfig(config, auth.user.id, body.label?.trim());
    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/kbs/[kbId]/config/snapshots/[snapshotId]/restore ───────────────

export async function restoreSnapshotHandler(
  req: NextRequest,
  kbId: string,
  snapshotId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:update");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

    const snap = await getSnapshot(snapshotId, kbId);
    if (!snap) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    // Snapshot the current config BEFORE restoring (so you can undo the restore)
    const current = await getAssistantConfig(kbId);
    if (current) {
      await snapshotConfig(current, auth.user.id, "Pre-restore backup");
    }

    // Restore: write the snapshot's config as the live config
    const s = snap.snapshot;
    const input: PutAssistantConfigInput = {
      assistantName:    s.assistantName,
      avatarUrl:        s.avatarUrl,
      systemPrompt:     s.systemPrompt,
      welcomeMessage:   s.welcomeMessage,
      outOfScopeReply:  s.outOfScopeReply,
      rules:            s.rules,
      defaultLanguage:  s.defaultLanguage,
      allowedLanguages: s.allowedLanguages,
      alwaysRespondIn:  s.alwaysRespondIn,
      voiceId:          s.voiceId,
      speed:            s.speed,
      temperature:      s.temperature,
      maxTokens:        s.maxTokens,
      citeSources:      s.citeSources,
      strictMode:       s.strictMode,
      primaryColour:    s.primaryColour,
      accentColour:     s.accentColour,
    };

    const restoredConfig = await putAssistantConfig(kbId, input);
    return NextResponse.json({ restored: true, config: restoredConfig });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[snapshots] restore:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
