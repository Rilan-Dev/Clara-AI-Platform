import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { getAgentById } from "@/modules/organisations/core/db";
import { queryOne } from "@/lib/db";
import {
  getActiveDeployment,
  getAgentDraftConfig,
  getProductionVersionConfig,
} from "@/modules/agent-versioning/core/db";
import { buildVersionConfigFromLive } from "@/modules/agent-versioning/core/projection";
import type { AgentVersionConfig } from "@/modules/agent-versioning/core/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:agentId/preview?scope=draft|published
 *
 * Serves the dedicated preview page (/preview/agents/:agentId).
 * Session-authenticated for org members — this endpoint NEVER mints, reads or
 * touches the embed (Deploy) API key. That key is reserved for real site
 * deployments; the preview page is a first-class authenticated surface.
 *
 *   scope=published (default) — the immutable published version configuration
 *   scope=draft               — the CURRENT Main-branch DRAFT configuration
 *                                (persona, AI selections, runtime toggles) plus
 *                                the LIVE knowledge base, so members can test
 *                                exactly what they are editing before
 *                                publishing. Drafts are ONLY served here, to
 *                                authenticated project readers — never on any
 *                                public surface.
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

    const scope = req.nextUrl.searchParams.get("scope") === "draft" ? "draft" : "published";
    const draft = scope === "draft" ? await getAgentDraftConfig(agentId) : null;

    const [deployment, version] = await Promise.all([
      getActiveDeployment(agentId),
      getProductionVersionConfig(agentId),
    ]);

    // Draft scope: draft → live projection → published version (deterministic
    // fallbacks — never fabricated). Published scope: published version only.
    let configuration: AgentVersionConfig | null = null;
    let configSource: "draft" | "live" | "published" | null = null;
    if (scope === "draft") {
      if (draft) {
        configuration = draft.configuration;
        configSource = "draft";
      } else {
        const live = await buildVersionConfigFromLive(agentId);
        if (live) {
          configuration = live;
          configSource = "live";
        } else if (version) {
          configuration = version.configuration;
          configSource = "published";
        }
      }
    } else if (version) {
      configuration = version.configuration;
      configSource = "published";
    }

    if (!configuration) {
      return NextResponse.json({
        agent: { id: agent.id, name: agent.name, orgId: agent.orgId },
        scope,
        configSource: null,
        deployment: null,
        draft: null,
        assistant: null,
        ai: null,
        runtime: null,
        kb: null,
      });
    }

    // Knowledge base — always the LIVE collection in draft scope (members test
    // current content); the deployment snapshot is used by the public page.
    const kb = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM knowledge_bases
        WHERE agent_id = $1 AND status = 'active'
        ORDER BY created_at ASC LIMIT 1`,
      [agentId],
    );

    const assistant = configuration.assistant as Record<string, unknown> | null;
    return NextResponse.json({
      agent: { id: agent.id, name: agent.name, orgId: agent.orgId },
      scope,
      configSource,
      deployment: deployment
        ? {
            branchName: deployment.branchName,
            versionNumber: deployment.versionNumber,
            publicAccess: deployment.publicAccess,
            publishedAt: deployment.publishedAt,
            publishedByName: deployment.publishedByName,
            changeSummary: version?.changeSummary ?? null,
          }
        : null,
      draft: draft
        ? {
            branchName: draft.branchName,
            updatedAt: draft.updatedAt,
            parentVersionNumber: draft.parentVersionNumber,
          }
        : null,
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
      ai: configuration.ai ?? null,
      runtime: configuration.runtime ?? null,
      kb: kb ?? null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/agents/:id/preview]", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to load preview" }, { status: 500 });
  }
}
