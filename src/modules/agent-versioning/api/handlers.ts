/**
 * src/modules/agent-versioning/api/handlers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent version-control API handlers (draft / versions / branches / merge /
 * publish / workspace context / default-update notification).
 *
 * Permission model:
 *   - reads:        project:read on the agent
 *   - mutations:    project:update on the agent
 *   - tenant isolation: every handler resolves the agent and passes ids only
 *     through the versioning service, which scopes every query by agentId.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { AgentVersioningError, getBranch, getDraft } from "../core/db";
import type { AgentVersionConfig, MergeResolution } from "../core/types";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { changesPublicEmbedPreference } from "../core/public-embed-preference";
import { changesDisabledWidgetDesign } from "../core/widget-draft-policy";
import {
  applyPlatformDefaultUpdate,
  archiveAgentBranch,
  changeTagsForVersion,
  createBranchFromVersion,
  diffAgentVersionConfigs,
  ensureAgentVersioning,
  executeMergeToMain,
  getAgentWorkspaceContext,
  getPublishContext,
  listAgentBranches,
  listAgentVersions,
  publishVersion,
  restoreVersion,
  reviewMerge,
  rollbackToVersion,
  saveAgentDraft,
  saveVersionFromDraft,
} from "../core/service";

function versioningErrorResponse(err: unknown): NextResponse {
  if (err instanceof AgentVersioningError) {
    const status =
      err.code === "AGENT_NOT_FOUND" || err.code === "VERSION_NOT_FOUND" || err.code === "BRANCH_NOT_FOUND"
        ? 404
        : err.code === "MERGE_CONFLICTS_UNRESOLVED" || err.code === "PUBLISH_VALIDATION_FAILED"
          ? 409
          : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  // Auth/permission failures (NextResponse thrown by the rbac layer) must
  // keep their original status — never be masked as a 500.
  if (err instanceof NextResponse) return err;
  console.error("[agent-versioning]", err);
  return NextResponse.json({ error: (err as Error).message || "Versioning operation failed" }, { status: 500 });
}

function parseConfig(value: unknown): AgentVersionConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as AgentVersionConfig;
  if (!config.assistant || typeof config.assistant.assistantName !== "string") return null;
  return config;
}

// ─── Workspace context (persistent header) ────────────────────────────────────

export async function getWorkspaceContextHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const context = await getAgentWorkspaceContext(agentId);
    return NextResponse.json(context);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export async function getDraftHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const branchId = req.nextUrl.searchParams.get("branchId");
    // ONE ensureAgentVersioning call. The previous flow ran the full chain
    // twice: getDraftHandler → ensureAgentVersioning, then getAgentDraft →
    // ensureAgentVersioning again — ~6 redundant queries per request.
    const { main, draft } = await ensureAgentVersioning(agentId);
    if (!branchId || branchId === main.id) {
      return NextResponse.json(draft);
    }
    // Non-main branch — same semantics as getAgentDraft, without re-running
    // the main-branch chain.
    const branch = await getBranch(agentId, branchId);
    if (!branch) throw new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND");
    const branchDraft = await getDraft(agentId, branchId);
    if (!branchDraft) throw new AgentVersioningError("Branch has no draft.", "DRAFT_NOT_FOUND");
    return NextResponse.json(branchDraft);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function putDraftHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const config = parseConfig(body.configuration);
    if (!config) {
      return NextResponse.json({ error: "configuration is required and must include assistant fields" }, { status: 400 });
    }
    const { main, draft: mainDraft } = await ensureAgentVersioning(agentId);
    const branchId = typeof body.branchId === "string" ? body.branchId : main.id;

    // This API also saves voice, knowledge and persona preferences. Block only
    // real widget-pref changes; never disable unrelated agent editing and
    // never change a stored preference just because the widget is hidden.
    if (!isPlatformFeatureEnabled("embeddableWidget")) {
      const existing = branchId === main.id ? mainDraft : await getDraft(agentId, branchId);
      if (!existing) {
        return NextResponse.json({ error: "Branch has no draft.", code: "DRAFT_NOT_FOUND" }, { status: 404 });
      }
      if (changesPublicEmbedPreference(existing.configuration, config) ||
          changesDisabledWidgetDesign(existing.configuration, config)) {
        return NextResponse.json(
          { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
          { status: 404 },
        );
      }
    }
    const draft = await saveAgentDraft(agentId, branchId, config, auth.user.id);
    return NextResponse.json(draft);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Versions ─────────────────────────────────────────────────────────────────

export async function listVersionsHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const branchId = req.nextUrl.searchParams.get("branchId") ?? undefined;
    const versions = await listAgentVersions(agentId, branchId);
    // Configurations can be large — list responses carry metadata only; the
    // detail endpoint returns the full configuration. Change tags (the short
    // pills shown on branch-history rows) are derived here because every
    // configuration is already in memory — no extra queries.
    const configById = new Map(versions.map((v) => [v.id, v.configuration]));
    return NextResponse.json({
      versions: versions.map((v) => ({
        id: v.id,
        branchId: v.branchId,
        branchName: v.branchName,
        versionNumber: v.versionNumber,
        parentVersionId: v.parentVersionId,
        changeSummary: v.changeSummary,
        source: v.source,
        changeTags: changeTagsForVersion(
          v.parentVersionId ? (configById.get(v.parentVersionId) ?? null) : null,
          v.configuration,
        ),
        createdByName: v.createdByName,
        createdAt: v.createdAt,
        publishedAt: v.publishedAt,
      })),
    });
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function saveVersionHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { main } = await ensureAgentVersioning(agentId);
    const branchId = typeof body.branchId === "string" ? body.branchId : main.id;
    const changeSummary = typeof body.changeSummary === "string" ? body.changeSummary : null;
    const version = await saveVersionFromDraft(agentId, branchId, { changeSummary }, auth.user.id);
    return NextResponse.json(version);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function getVersionHandler(req: NextRequest, agentId: string, versionId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const { getVersion } = await import("../core/db");
    const version = await getVersion(agentId, versionId);
    if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    return NextResponse.json(version);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function restoreVersionHandler(req: NextRequest, agentId: string, versionId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const version = await restoreVersion(agentId, versionId, auth.user.id);
    return NextResponse.json(version);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export async function diffHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const a = req.nextUrl.searchParams.get("a") ?? "";
    const b = req.nextUrl.searchParams.get("b") ?? "";
    const branchId = req.nextUrl.searchParams.get("branchId") ?? undefined;
    if (!a || !b) {
      return NextResponse.json({ error: "Query params a and b are required (version ids or 'draft')" }, { status: 400 });
    }
    const diff = await diffAgentVersionConfigs(agentId, a, b, branchId);
    return NextResponse.json(diff);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function listBranchesHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const branches = await listAgentBranches(agentId);
    return NextResponse.json({ branches });
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function createBranchHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const fromVersionId = typeof body.fromVersionId === "string" ? body.fromVersionId : "";
    if (!name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
    if (!fromVersionId) return NextResponse.json({ error: "fromVersionId is required — branches fork from an exact version" }, { status: 400 });
    const result = await createBranchFromVersion(agentId, {
      name,
      description: typeof body.description === "string" ? body.description : null,
      fromVersionId,
    }, auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function archiveBranchHandler(req: NextRequest, agentId: string, branchId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const archived = typeof body.archived === "boolean" ? body.archived : true;
    await archiveAgentBranch(agentId, branchId, archived);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export async function reviewMergeHandler(req: NextRequest, agentId: string, branchId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const review = await reviewMerge(agentId, branchId);
    return NextResponse.json(review);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function executeMergeHandler(req: NextRequest, agentId: string, branchId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const resolutions: MergeResolution[] = Array.isArray(body.resolutions)
      ? body.resolutions
          .filter((r): r is MergeResolution => !!r && typeof r === "object" && typeof (r as MergeResolution).field === "string")
      : [];
    const result = await executeMergeToMain(agentId, branchId, resolutions, auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function getPublishReviewHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const versionId = req.nextUrl.searchParams.get("versionId") ?? "";
    if (!versionId) {
      return NextResponse.json({ error: "versionId query param is required" }, { status: 400 });
    }
    const context = await getPublishContext(agentId, versionId);
    return NextResponse.json(context);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function publishHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const versionId = typeof body.versionId === "string" ? body.versionId : "";
    if (!versionId) {
      return NextResponse.json({ error: "versionId is required — publishing targets an exact immutable version" }, { status: 400 });
    }
    const publicAccess = typeof body.publicAccess === "boolean" ? body.publicAccess : false;
    const result = await publishVersion(agentId, versionId, { publicAccess }, auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function rollbackHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const versionId = typeof body.versionId === "string" ? body.versionId : "";
    if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    const deployment = await rollbackToVersion(agentId, versionId, auth.user.id);
    return NextResponse.json({ deployment });
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Deployments (public access state) ────────────────────────────────────────

export async function listDeploymentsHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const { listDeployments } = await import("../core/db");
    const deployments = await listDeployments(agentId);
    return NextResponse.json({ deployments });
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

// ─── Platform default update notification (§22) ───────────────────────────────

export async function checkDefaultUpdateHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const { checkDefaultAssistantUpdate } = await import("../core/service");
    const result = await checkDefaultAssistantUpdate(agentId);
    return NextResponse.json(result ?? { updateAvailable: false, agentDefaultVersion: null, currentPlatformVersion: null });
  } catch (err) {
    return versioningErrorResponse(err);
  }
}

export async function applyDefaultUpdateHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const draft = await applyPlatformDefaultUpdate(agentId, auth.user.id);
    return NextResponse.json(draft);
  } catch (err) {
    return versioningErrorResponse(err);
  }
}
