import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getAgentById } from "@/modules/organisations/core/db";
import { queryOne } from "@/lib/db";
import {
  getActiveDeployment,
  getProductionVersionConfig,
} from "@/modules/agent-versioning/core/db";
import { mintPublicSessionToken } from "@/modules/embed/core/public-token";
import { hit, rateLimitResponse } from "@/lib/rate-limit";
import { resolveVoiceConfigCached } from "@/modules/voice-core/resolve";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/agents/:agentId/config
 *
 * Public configuration for the PUBLISHED agent page (/agents/:agentId).
 *
 * Serves ONLY the immutable published state: the active deployment must exist
 * AND have public access ON. No draft data ever crosses this boundary — the
 * configuration comes from the production version, and downstream chat/voice
 * requests resolve to the deployment's frozen KB snapshot collection.
 *
 * Alongside the public-safe branding payload, the response mints a short-lived
 * (2 h) HMAC-signed public session token that the existing embed validation
 * layer accepts as an embed-equivalent credential (plan quotas, hourly rate
 * limits and the publication re-check apply on every use). Tokens are not
 * persistent credentials: reloading the page simply mints a fresh one.
 *
 * Light per-IP rate limit guards the endpoint from scraping. Security headers
 * are applied by the Edge middleware's public-prefix branch.
 */

const CONFIG_RATE = { limit: 60, windowMs: 5 * 60 * 1000 } as const; // 60 / 5 min / IP

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    // Per-IP guard — cheap in-memory bucket (page-load scoped endpoint).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const gate = hit(`public-config:${ip}`, CONFIG_RATE.limit, CONFIG_RATE.windowMs);
    if (!gate.allowed) {
      const rl = rateLimitResponse(gate.retryAfterSec);
      return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
    }

    await ensureMigrated();
    const { agentId } = await params;

    const agent = await getAgentById(agentId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const [deployment, version] = await Promise.all([
      getActiveDeployment(agentId),
      getProductionVersionConfig(agentId),
    ]);

    if (!deployment || !version || !deployment.publicAccess) {
      // Deliberately indistinguishable from "not found" — private/unpublished
      // agents are not enumerable from the public surface.
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const configuration = version.configuration;
    const assistant = configuration.assistant as Record<string, unknown> | null;

    // Primary active knowledge base — its LIVE id is the routing handle; the
    // embed/AI resolution layer maps it onto the deployment's frozen snapshot
    // collection (pub_*) so the public page only ever sees published content.
    const kb = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM knowledge_bases
        WHERE agent_id = $1 AND status = 'active'
        ORDER BY created_at ASC LIMIT 1`,
      [agentId],
    );
    if (!kb) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const sessionToken = mintPublicSessionToken({
      agentId,
      kbId: kb.id,
      orgId: agent.orgId,
      deploymentId: deployment.id,
    });

    const ai = configuration.ai ?? null;
    const runtime = configuration.runtime ?? null;

    // Voice Chat provider (chat-window dictate / listen) — resolved through
    // the same inheritance as every voice route (agent → org → platform).
    let voiceChatProvider: string | null = ai?.voiceProvider ?? null;
    try {
      voiceChatProvider = (await resolveVoiceConfigCached({ kbId: kb.id, surface: "voice_chat" })).voiceProvider;
    } catch {
      // Unresolvable voice config: the chat window simply shows no Voice Chat controls.
    }

    return NextResponse.json(
      {
        agent: { id: agent.id, name: agent.name },
        published: {
          versionNumber: deployment.versionNumber,
          branchName: deployment.branchName,
          publishedAt: deployment.publishedAt,
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
              strictMode: (assistant.strictMode as boolean) ?? true,
              citeSources: (assistant.citeSources as boolean) ?? true,
            }
          : null,
        voice: {
          // Runtime toggles from the PUBLISHED version config (org-level
          // legacy fallbacks match the resolver semantics).
          enabled: runtime ? runtime.enableVoice !== false : true,
          realtime: runtime ? runtime.enableRealtime !== false : true,
          provider: ai?.realtimeVoiceProvider ?? ai?.voiceProvider ?? null,
          voiceChatProvider,
        },
        kb: { id: kb.id, name: kb.name },
        sessionToken,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    console.error("[GET /api/public/agents/:id/config]", err);
    return NextResponse.json({ error: "Failed to load agent" }, { status: 500 });
  }
}
