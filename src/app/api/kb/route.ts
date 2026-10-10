import { db } from "@/lib/db";
import { errorResponse, ApiError } from "@/lib/api-contract";
import { requireOrgUser } from "@/lib/session";
import { withQuota } from "@/lib/quota";
import { assertEmbeddingModel, embeddingModels } from "@/lib/model-catalogue";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/kb — list the org's knowledge bases with storage usage. */
export async function GET(req: Request) {
  try {
    const { orgId } = await requireOrgUser(req);
    const kbs = await db.knowledgeBase.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({
      kbs: kbs.map((k) => ({ ...k, bytes: Number(k.bytes) })),
      catalogue: embeddingModels().map((m) => ({
        id: m.id,
        displayName: m.displayName,
        dimensions: m.dimensions,
        tier: m.tier,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/kb — create a knowledge base. Quota (kbs limit) is enforced
 * server-side with the 402 contract; the create button in the UI is also
 * disabled at the limit, but the API refusal is the real gate (plan §3.2).
 */
export async function POST(req: Request) {
  try {
    const { user, orgId } = await requireOrgUser(req);
    const body = (await req.json()) as {
      name: string;
      embeddingModelId: string;
    };
    if (!body.name?.trim()) {
      throw new ApiError(422, "VALIDATION_FAILED", "Name is required.", {
        fields: { name: "Give the knowledge base a name." },
      });
    }

    // WS-0.4 guard — a chat model id in an embedding field is a hard,
    // explained error, and dimension mismatch is blocked up front.
    const model = assertEmbeddingModel(body.embeddingModelId);

    await withQuota({ orgId, limitKey: "kbs", endpoint: "POST /api/kb" });

    const kb = await db.knowledgeBase.create({
      data: {
        orgId,
        name: body.name.trim(),
        embeddingModelId: model.id,
        dimensions: model.dimensions ?? 1536,
      },
    });

    await appendAudit({
      orgId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CONFIG",
      kbId: kb.id,
      promptText: null,
      answerText: `Created knowledge base "${kb.name}" with embedding model ${model.id} (${model.dimensions}d).`,
    });

    return Response.json({ kb: { ...kb, bytes: Number(kb.bytes) } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
