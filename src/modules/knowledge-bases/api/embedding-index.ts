/**
 * src/modules/knowledge-bases/api/embedding-index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  /api/kbs/:kbId/embedding-index   index status (+ advances a running job)
 * POST /api/kbs/:kbId/embedding-index   { action: "start", index }
 *                                       { action: "retry" | "cancel" | "delete-retired" }
 *                                       { action: "org-default", index }
 *
 * Organisation members with kb:update run re-indexes for their KBs; the org
 * default for new knowledge bases needs org:update. The multilingual index is
 * offered only when the platform admin enabled it AND the plan includes it.
 */

import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireAuth, requireKbPermission, requireOrgPermission } from "@/modules/auth/core/rbac";
import {
  getCollectionEmbedding,
  getMultilingualAvailability,
  getKbIndexContext,
  isEmbeddingIndexKind,
  targetForIndex,
  toJob,
} from "@/modules/knowledge-bases/core/embedding-index";
import {
  ReindexError,
  advanceReindexJob,
  cancelReindex,
  deleteRetiredIndexes,
  retryReindexJob,
  startReindex,
} from "@/modules/knowledge-bases/core/reindex";
import { findMultilingualModel, getMultilingualSettings } from "@/modules/ai-core/multilingual-embeddings";

/** How long a status poll may spend advancing a running job. */
const POLL_BUDGET_MS = 6_000;

async function statusFor(kbId: string, orgId: string, canWrite: boolean) {
  const context = await getKbIndexContext(kbId);
  if (!context) return null;

  let latest = await queryOne<Record<string, unknown>>(
    "SELECT * FROM kb_reindex_jobs WHERE kb_id = $1 ORDER BY created_at DESC LIMIT 1",
    [kbId],
  );
  // Poll-driven progress: on serverless there is no long-lived worker, so an
  // open status panel moves the job forward (lease-protected).
  if (canWrite && latest && (latest.status === "queued" || latest.status === "running")) {
    const advanced = await advanceReindexJob(String(latest.id), POLL_BUDGET_MS).catch(() => null);
    if (advanced) {
      latest = await queryOne<Record<string, unknown>>("SELECT * FROM kb_reindex_jobs WHERE id = $1", [advanced.id]);
    }
  }
  const fresh = (await getKbIndexContext(kbId)) ?? context;
  const [entry, availability, retired, orgDefault] = await Promise.all([
    getCollectionEmbedding(fresh.collection),
    getMultilingualAvailability(orgId),
    query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM kb_vector_collections WHERE kb_id = $1 AND role = 'retired'",
      [kbId],
    ),
    queryOne<{ default_embedding_index: string | null }>(
      "SELECT default_embedding_index FROM org_ai_settings WHERE org_id = $1",
      [orgId],
    ),
  ]);
  // Today's standard model for this KB (platform default + org/KB overrides).
  const standardTarget = await targetForIndex(kbId, "standard")
    .then((t) => ({ index: "standard" as const, provider: t.provider, model: t.model, dimension: t.dimension }))
    .catch(() => null);
  const current = entry ?? standardTarget;
  const settings = getMultilingualSettings();
  const model = findMultilingualModel(settings.model);

  return {
    current: current
      ? { index: current.index, provider: current.provider, model: current.model, dimension: current.dimension }
      : null,
    desiredIndex: fresh.desiredIndex,
    /** Set when the standard model changed since this index was built. */
    standardUpdate:
      current?.index === "standard" && standardTarget && standardTarget.model !== current.model
        ? { model: standardTarget.model, dimension: standardTarget.dimension }
        : null,
    multilingual: {
      ...availability,
      model: settings.model,
      label: model?.label ?? settings.model,
      languages: model?.languages ?? null,
      elevenLabsModel: model?.elevenLabsModel ?? null,
    },
    job: latest ? toJob(latest) : null,
    retiredIndexes: retired[0]?.count ?? 0,
    orgDefaultIndex: isEmbeddingIndexKind(orgDefault?.default_embedding_index) ? orgDefault!.default_embedding_index : "standard",
  };
}

export async function getEmbeddingIndex(request: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    const access = await requireKbPermission(auth, kbId, "kb:read");
    const status = await statusFor(kbId, access.orgId, access.permissions.has("kb:update"));
    if (!status) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[embedding-index] get:", error);
    return NextResponse.json({ error: "Could not load the knowledge index status." }, { status: 500 });
  }
}

export async function postEmbeddingIndex(request: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    const access = await requireKbPermission(auth, kbId, "kb:update");
    const body = (await request.json().catch(() => ({}))) as { action?: string; index?: unknown };

    switch (body.action) {
      case "start": {
        if (!isEmbeddingIndexKind(body.index)) {
          return NextResponse.json({ error: "index must be 'standard' or 'multilingual'" }, { status: 400 });
        }
        const job = await startReindex({ kbId, index: body.index, userId: auth.user.id });
        await advanceReindexJob(job.id, POLL_BUDGET_MS).catch(() => null);
        break;
      }
      case "retry":
        await retryReindexJob(kbId);
        break;
      case "cancel":
        await cancelReindex(kbId);
        break;
      case "delete-retired": {
        const deleted = await deleteRetiredIndexes(kbId);
        return NextResponse.json({ deleted });
      }
      case "org-default": {
        if (!isEmbeddingIndexKind(body.index)) {
          return NextResponse.json({ error: "index must be 'standard' or 'multilingual'" }, { status: 400 });
        }
        await requireOrgPermission(auth, access.orgId, "org:update");
        if (body.index === "multilingual") {
          const availability = await getMultilingualAvailability(access.orgId);
          if (!availability.available) {
            return NextResponse.json({ error: availability.reason }, { status: 403 });
          }
        }
        await query(
          `INSERT INTO org_ai_settings (org_id, default_embedding_index) VALUES ($1, $2)
           ON CONFLICT (org_id) DO UPDATE SET default_embedding_index = EXCLUDED.default_embedding_index, updated_at = now()`,
          [access.orgId, body.index],
        );
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const status = await statusFor(kbId, access.orgId, true);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof ReindexError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[embedding-index] post:", error);
    return NextResponse.json({ error: "The knowledge index could not be updated." }, { status: 500 });
  }
}
