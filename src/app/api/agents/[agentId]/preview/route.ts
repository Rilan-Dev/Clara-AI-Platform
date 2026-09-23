import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { getAgentById } from "@/modules/organisations/core/db";
import { queryOne } from "@/lib/db";
import {
  getActiveDeployment,
  getProductionVersionConfig,
} from "@/modules/agent-versioning/core/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:agentId/preview
 *
 * Serves the CURRENTLY PUBLISHED agent state for the DEDICATED preview page
 * (/orgs/:orgId/agents/:agentId/preview). Session-authenticated for org
 * members — this endpoint NEVER mints, reads or touches the embed (Deploy)
 * API key. That key is reserved for real site deployments; the preview page
 * is a first-class authenticated surface instead of an embed.
 *
 * Returns exactly what the published version's immutable configuration says
 * — drafts are never leaked here.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    await ensureMigrated();
    const { agentId } = await params;
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");

    const agent = await getAgentById(agentId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const [deployment, version] = await Promise.all([
      getActiveDeployment(agentId),
      getProductionVersionConfig(agentId),
    ]);

    if (!deployment || !version) {
      return NextResponse.json({
        agent: { id: agent.id, name: agent.name, orgId: agent.orgId },
        deployment: null,
        assistant: null,
        ai: null,
        runtime: null,
        kb: null,
      });
    }

    // Primary active knowledge base — powers the functional chat preview via
    // the internal authenticated /api/chat endpoint (again: no embed key).
    const kb = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM knowledge_bases
        WHERE agent_id = $1 AND status = 'active'
        ORDER BY created_at ASC LIMIT 1`,
      [agentId],
    );

    const assistant = version.configuration.assistant as Record<string, unknown> | null;
    return NextResponse.json({
      agent: { id: agent.id, name: agent.name, orgId: agent.orgId },
      deployment: {
        branchName: deployment.branchName,
        versionNumber: deployment.versionNumber,
        publicAccess: deployment.publicAccess,
        publishedAt: deployment.publishedAt,
        publishedByName: deployment.publishedByName,
        changeSummary: version.changeSummary ?? null,
      },
      assistant: assistant
        ? {
            assistantName: (assistant.assistantName as string) ?? agent.name,
            avatarUrl: (assistant.avatarUrl as string | null) ?? null,
            welcomeMessage: (assistant.welcomeMessage as string) ?? "",
            primaryColour: (assistant.primaryColour as string) ?? "#6366f1",
            accentColour: (assistant.accentColour as string) ?? "#a5b4fc",
            defaultLanguage: (assistant.defaultLanguage as string) ?? "en",
            allowedLanguages: (assistant.allowedLanguages as string[]) ?? ["en"],
            alwaysRespondIn: (assistant.alwaysRespondIn as string | null) ?? null,
            voiceId: (assistant.voiceId as string | null) ?? null,
            strictMode: (assistant.strictMode as boolean) ?? true,
            citeSources: (assistant.citeSources as boolean) ?? true,
          }
        : null,
      ai: version.configuration.ai ?? null,
      runtime: version.configuration.runtime ?? null,
      kb: kb ?? null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/agents/:id/preview]", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to load preview" }, { status: 500 });
  }
}
