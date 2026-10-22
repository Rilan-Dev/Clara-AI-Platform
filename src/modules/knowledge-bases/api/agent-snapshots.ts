/**
 * src/modules/knowledge-bases/api/agent-snapshots.ts
 * Config snapshot API handlers (agent-owned config).
 *
 * GET  /api/agents/[agentId]/config/snapshots                         → list last 5
 * POST /api/agents/[agentId]/config/snapshots                         → manual save
 * POST /api/agents/[agentId]/config/snapshots/[snapshotId]/restore    → restore
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { getAgentById } from "@/modules/organisations/core/db";
import { getAssistantConfigByAgent, putAssistantConfig } from "../core/db";
import {
  listSnapshots,
  getSnapshot,
  snapshotConfig,
} from "../core/snapshots-db";
import type { AssistantConfig, PutAssistantConfigInput } from "../core/models";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { preserveDisabledWidgetFieldsOnPut } from "../core/widget-config-policy";

// ── GET /api/agents/[agentId]/config/snapshots ───────────────────────────────

export async function listSnapshotsHandler(
  req: NextRequest,
  agentId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");

    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const snapshots = await listSnapshots(agentId);
    return NextResponse.json(snapshots);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/agents/[agentId]/config/snapshots (manual save) ────────────────

export async function createSnapshotHandler(
  req: NextRequest,
  agentId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");

    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const config = await getAssistantConfigByAgent(agentId);
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

// ── POST /api/agents/[agentId]/config/snapshots/[snapshotId]/restore ─────────

export async function restoreSnapshotHandler(
  req: NextRequest,
  agentId: string,
  snapshotId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");

    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const snap = await getSnapshot(snapshotId, agentId);
    if (!snap) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    // Read the live config before applying any saved snapshot. The current
    // widget design must not change through this shared restore path when the
    // widget feature has been switched off for this environment.
    const current = await getAssistantConfigByAgent(agentId);

    // Restore: write the snapshot's config as the live config
    const s = snap.snapshot as Partial<AssistantConfig>;
    const input = {
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
      launcherColour:   s.launcherColour ?? s.primaryColour,
      widgetTheme:        s.widgetTheme        ?? "light",
      widgetPosition:     s.widgetPosition     ?? "bottom-right",
      widgetButtonSize:   s.widgetButtonSize   ?? 56,
      widgetBorderRadius: s.widgetBorderRadius ?? 20,
      widgetFontFamily:   s.widgetFontFamily   ?? "system-ui,sans-serif",
      widgetChatHeight:   s.widgetChatHeight   ?? 580,
      widgetShowBranding: s.widgetShowBranding ?? true,
      widgetLauncherLabel: s.widgetLauncherLabel ?? null,
      widgetMode:         s.widgetMode         ?? "floating",
      customCss:          s.customCss          ?? null,
      customLauncherSvg:  s.customLauncherSvg  ?? null,
      customHeaderHtml:   s.customHeaderHtml   ?? null,
      customPoweredBy:    s.customPoweredBy    ?? null,
      ...s
    } as PutAssistantConfigInput;

    if (!isPlatformFeatureEnabled("embeddableWidget")) {
      // Restoring a snapshot is not an explicit widget-edit action. Preserve
      // all existing widget values while still restoring the persona, voice
      // and language fields. No current config means there is no safe widget
      // baseline to retain, so fail closed rather than revive stale styling.
      if (!current) {
        return NextResponse.json(
          { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
          { status: 404 },
        );
      }
      preserveDisabledWidgetFieldsOnPut(input, {}, current);
    }

    // Backup after all validations, so a denied restore does not consume a
    // snapshot slot or evict one of the last five versions.
    if (current) {
      await snapshotConfig(current, auth.user.id, "Pre-restore backup");
    }

    const restoredConfig = await putAssistantConfig(agentId, input);
    return NextResponse.json({ restored: true, config: restoredConfig });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agent-snapshots] restore:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
