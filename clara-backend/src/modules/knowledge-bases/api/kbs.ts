/**
 * src/modules/knowledge-bases/api/kbs.ts
 * Route handlers for knowledge base CRUD.
 *
 * POST   /api/projects/[projectId]/kbs   → createKbHandler
 * GET    /api/projects/[projectId]/kbs   → listKbsHandler
 * GET    /api/kbs/[kbId]                 → getKbHandler
 * PATCH  /api/kbs/[kbId]                 → updateKbHandler
 * DELETE /api/kbs/[kbId]                 → deleteKbHandler
 *
 * When a KB is created, we also create its Qdrant collection immediately
 * so it is ready to accept documents. When a KB is deleted, we delete
 * the Qdrant collection first, then the DB row (CASCADE removes config).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getProjectById } from "@/modules/organisations/core/db";
import {
  createKnowledgeBase,
  listKnowledgeBases,
  getKnowledgeBaseById,
  updateKnowledgeBase,
  deleteKnowledgeBase,
} from "../core/db";
import { ensureCollectionExists, getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";

// POST /api/projects/[projectId]/kbs
export async function createKbHandler(
  req: NextRequest,
  projectId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await req.json();
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // 1. Create DB row + default assistant_config (in one transaction)
    const kb = await createKnowledgeBase(projectId, {
      name:        body.name.trim(),
      description: body.description?.trim() || undefined,
    });

    // 2. Create the Qdrant collection for this KB.
    //    Uses the embedding dimension from the current provider (default 1536).
    try {
      const resolved = await resolveAIConfig({
        kbId: kb.id,
        orgId: project.orgId,
        surface: "rag-embedding",
      });
      const provider = ProviderFactory.getProvider(toProviderConfig(resolved));
      await ensureCollectionExists(kb.qdrantCollection, {
        vectorSize: provider.getEmbeddingDimension(),
      });
    } catch (qdrantErr) {
      // Roll back the KB row so the DB and Qdrant stay consistent.
      // (deleteKnowledgeBase also removes assistant_config via CASCADE)
      await deleteKnowledgeBase(kb.id).catch(() => null);
      throw new Error(
        `Failed to create Qdrant collection "${kb.qdrantCollection}": ` +
        (qdrantErr as Error).message
      );
    }

    return NextResponse.json(kb, { status: 201 });
  } catch (err) {
    console.error("[kbs] createKb:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/projects/[projectId]/kbs
export async function listKbsHandler(
  _req: NextRequest,
  projectId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const kbs = await listKnowledgeBases(projectId);
    return NextResponse.json(kbs);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/kbs/[kbId]
export async function getKbHandler(
  _req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    return NextResponse.json(kb);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/kbs/[kbId]
export async function updateKbHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const body = await req.json();
    const kb = await updateKnowledgeBase(kbId, {
      name:        body.name?.trim()        || undefined,
      description: body.description?.trim() || undefined,
      status:      body.status              || undefined,
    });
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    return NextResponse.json(kb);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/kbs/[kbId]
export async function deleteKbHandler(
  _req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // deleteKnowledgeBase returns the qdrant_collection name before deleting the row.
    const collectionName = await deleteKnowledgeBase(kbId);
    if (!collectionName) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    // Delete the Qdrant collection (best-effort — log but don't fail the request).
    try {
      const qdrant = getQdrantClient();
      await qdrant.deleteCollection(collectionName);
    } catch (qdrantErr) {
      console.warn(
        `[kbs] deleteKb: could not delete Qdrant collection "${collectionName}":`,
        (qdrantErr as Error).message
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[kbs] deleteKb:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
