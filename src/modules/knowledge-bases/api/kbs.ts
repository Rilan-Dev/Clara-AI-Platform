/** Tenant knowledge-base CRUD. Platform admins cannot access tenant KBs. */

import { NextRequest, NextResponse } from "next/server";
import { unexpectedKnowledgeApiError } from "./unexpected-error";
import { ensureMigrated } from "@/lib/db/migrate";
import { getAgentById } from "@/modules/organisations/core/db";
import { createKnowledgeBase, listKnowledgeBases, getKnowledgeBaseById, updateKnowledgeBase, deleteKnowledgeBase } from "../core/db";
import { ensureCollectionExists, getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { requireAuth, requireAgentPermission, requireKbPermission } from "@/modules/auth/core/rbac";
import { planGuard, planLimitResponse } from "@/lib/plan-guard";
import { writeAuditLog } from "@/modules/auth/core/db";

export async function createKbHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "kb:create");
    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    const body = await req.json();
    if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    // Plan limit: max knowledge bases per org (KBs are counted org-wide).
    const kbGuard = await planGuard(agent.orgId, "kbs");
    if (!kbGuard.allowed) return planLimitResponse(kbGuard) as NextResponse;

    const kb = await createKnowledgeBase(agentId, { name: body.name.trim(), description: body.description?.trim() || undefined });
    try {
      const resolved = await resolveAIConfig({ kbId: kb.id, orgId: agent.orgId, surface: "rag-embedding" });
      const provider = ProviderFactory.getProvider(toProviderConfig(resolved, "embedding"));
      await ensureCollectionExists(kb.qdrantCollection, { vectorSize: provider.getEmbeddingDimension() });
    } catch (qdrantErr) {
      await deleteKnowledgeBase(kb.id).catch(() => null);
      throw new Error(`Failed to create Qdrant collection "${kb.qdrantCollection}": ${(qdrantErr as Error).message}`);
    }
    // WS-1.4: mutation audit — who created which KB, when.
    void writeAuditLog({
      userId: auth.user.id,
      orgId: agent.orgId,
      action: "kb.create",
      resourceType: "knowledge_base",
      resourceId: kb.id,
      newData: { name: kb.name, agentId },
    }).catch(() => undefined);
    return NextResponse.json(kb, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[kbs] createKb:", err);
    return unexpectedKnowledgeApiError(err, "knowledge-base");
  }
}

export async function listKbsHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "kb:read");
    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json(await listKnowledgeBases(agentId));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return unexpectedKnowledgeApiError(err, "knowledge-base");
  }
}

export async function getKbHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:read");
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    return NextResponse.json(kb);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return unexpectedKnowledgeApiError(err, "knowledge-base");
  }
}

export async function updateKbHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:update");
    const body = await req.json();
    const kb = await updateKnowledgeBase(kbId, { name: body.name?.trim() || undefined, description: body.description?.trim() || undefined, status: body.status || undefined });
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    return NextResponse.json(kb);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return unexpectedKnowledgeApiError(err, "knowledge-base");
  }
}

export async function deleteKbHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:delete");
    const collectionName = await deleteKnowledgeBase(kbId);
    if (!collectionName) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    try { await getQdrantClient().deleteCollection(collectionName); }
    catch (qdrantErr) { console.warn(`[kbs] deleteKb: could not delete Qdrant collection "${collectionName}":`, (qdrantErr as Error).message); }
    // WS-1.4: mutation audit — destructive action on tenant content.
    void writeAuditLog({
      userId: auth.user.id,
      action: "kb.delete",
      resourceType: "knowledge_base",
      resourceId: kbId,
      newData: { collection: collectionName },
    }).catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[kbs] deleteKb:", err);
    return unexpectedKnowledgeApiError(err, "knowledge-base");
  }
}
