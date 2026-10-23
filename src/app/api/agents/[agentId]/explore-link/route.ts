import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { queryOne, withTransaction } from "@/lib/db";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { createApiKey } from "@/modules/embed/core/api-keys-db";
import { getAgentById } from "@/modules/organisations/core/db";

export const dynamic = "force-dynamic";

const EXPLORE_KEY_NAME = "Published explore link";

/**
 * POST /api/agents/:agentId/explore-link
 *
 * Generates a clickable URL pair (chat widget + voice embed) for exploring a
 * PUBLISHED agent. Embed keys are stored hashed and can never be read back —
 * so this mints (or re-mints) one key named "Published explore link" for the
 * agent's primary knowledge base and returns the raw key ONCE, exactly like
 * the key-creation UI. Re-generating revokes the previous explore key, so at
 * most one is active per KB.
 *
 * Permission: project:update on the agent (same as the other publish-area
 * mutations). The links only actually serve traffic when the active
 * deployment is published with public access ON.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    await ensureMigrated();
    const { agentId } = await params;
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");

    // Defense in depth: middleware also rejects this feature-owned API, but
    // direct route invocation must never mint keys on a disabled deployment.
    if (!isPlatformFeatureEnabled("embeddableWidget")) {
      return NextResponse.json(
        { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
        { status: 404 },
      );
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const kb = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM knowledge_bases
        WHERE agent_id = $1 AND status = 'active'
        ORDER BY created_at ASC LIMIT 1`,
      [agentId],
    );
    if (!kb) {
      return NextResponse.json(
        { error: "This agent has no active knowledge base yet — create one first." },
        { status: 404 },
      );
    }

    // Lock the owning KB row to serialise simultaneous rotations. Revoke and
    // mint on the SAME PostgreSQL connection so a failed INSERT rolls back
    // the revocation instead of permanently invalidating the last working URL.
    // Do not reuse createApiKey's default pool connection inside this scope.
    const created = await withTransaction(async (client) => {
      const ownedKb = await client.query<{ id: string }>(
        `SELECT id FROM knowledge_bases
          WHERE id = $1 AND agent_id = $2 AND status = 'active'
          FOR UPDATE`,
        [kb.id, agentId],
      );
      if (!ownedKb.rows[0]) return null;
      await client.query(
        `UPDATE api_keys SET is_active = FALSE
          WHERE kb_id = $1 AND name = $2 AND is_active`,
        [kb.id, EXPLORE_KEY_NAME],
      );
      return createApiKey({
        kbId: kb.id,
        orgId: agent.orgId,
        name: EXPLORE_KEY_NAME,
        createdBy: auth.user.id,
      }, client);
    });
    if (!created) {
      return NextResponse.json(
        { error: "The knowledge base is not active or no longer belongs to this agent." },
        { status: 404 },
      );
    }

    // Prefer the configured public origin (NEXT_PUBLIC_APP_URL — set behind
    // reverse proxies) over req.nextUrl.origin, which can surface the bind
    // host (e.g. http://0.0.0.0:3000) when the app listens on 0.0.0.0.
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
    const origin = configuredOrigin || req.nextUrl.origin;
    return NextResponse.json({
      kbId: kb.id,
      kbName: kb.name,
      key: created.rawKey,
      widgetUrl: `${origin}/embed/widget?key=${encodeURIComponent(created.rawKey)}`,
      voiceUrl: `${origin}/embed/voice?key=${encodeURIComponent(created.rawKey)}`,
      previewUrl: `${origin}/embed/preview?key=${encodeURIComponent(created.rawKey)}`,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/agents/:id/explore-link]", err);
    return NextResponse.json({ error: "Failed to generate explore link" }, { status: 500 });
  }
}
