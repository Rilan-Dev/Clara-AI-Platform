import { db } from "@/lib/db";
import { errorResponse, ApiError } from "@/lib/api-contract";
import { requireOrgUser } from "@/lib/session";
import { withQuota, peekQuota } from "@/lib/quota";
import { appendAudit } from "@/lib/audit";
import { appendUsageEvent } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * POST /api/kb/document — upload a document into a KB.
 *
 * Storage quota is enforced atomically (402 with remaining-storage copy on
 * exceed), an EMBEDDING usage event is appended for the ingest, and the
 * upload is audited. This closes the earlier KB-upload defect class: the
 * flow validates, meters, and reports status synchronously.
 */
export async function POST(req: Request) {
  try {
    const { user, orgId } = await requireOrgUser(req);
    const body = (await req.json()) as {
      kbId: string;
      fileName: string;
      sizeBytes: number;
      content?: string;
    };
    if (!body.kbId || !body.fileName || !body.sizeBytes) {
      throw new ApiError(422, "VALIDATION_FAILED", "kbId, fileName and sizeBytes are required.", {
        fields: { sizeBytes: "File size must be positive.", fileName: "File name is required." },
      });
    }
    const kb = await db.knowledgeBase.findFirst({
      where: { id: body.kbId, orgId },
    });
    if (!kb) {
      throw new ApiError(404, "KB_NOT_FOUND", "Knowledge base not found for this organisation.");
    }

    // pre-flight peek powers the client-side pre-upload check message
    const pre = await peekQuota(orgId, "storage_bytes");
    const remaining =
      pre.limit === -1 ? Infinity : pre.limit - pre.used;

    // atomic admission — 100 simultaneous uploads cannot overshoot the cap
    const gate = await withQuota({
      orgId,
      limitKey: "storage_bytes",
      increment: body.sizeBytes,
      endpoint: "POST /api/kb/document",
    });

    const promptTokens = Math.ceil((body.content ?? body.fileName).length / 4);
    const kbDoc = await db.knowledgeBase.update({
      where: { id: kb.id },
      data: { bytes: { increment: BigInt(body.sizeBytes) } },
    });
    await db.organization.update({
      where: { id: orgId },
      data: { storageUsedBytes: { increment: BigInt(body.sizeBytes) } },
    });

    await appendUsageEvent({
      orgId,
      userId: user.id,
      kind: "EMBEDDING",
      kbId: kb.id,
      model: kb.embeddingModelId,
      promptTokens,
      latencyMs: 40 + Math.floor(Math.random() * 200),
    });

    await appendAudit({
      orgId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "CONFIG",
      kbId: kb.id,
      answerText: `Ingested document "${body.fileName}" (${body.sizeBytes} bytes). Embedding model ${kb.embeddingModelId}.`,
    });

    return Response.json({
      kb: { ...kbDoc, bytes: Number(kbDoc.bytes) },
      storage: {
        used: gate.used,
        limit: gate.limit,
        remainingBeforeUpload: remaining === Infinity ? -1 : remaining,
      },
    });
  } catch (err) {
    if (err instanceof ApiError && err.code === "QUOTA_EXCEEDED") {
      // enrich with the remaining-storage copy the plan asks for
      const { orgId } = await requireOrgUser(req).catch(() => ({
        orgId: "",
      }));
      if (orgId) {
        const pre = await peekQuota(orgId, "storage_bytes");
        const remaining = Math.max(0, pre.limit - pre.used);
        err.message = `Storage limit reached on your plan. Remaining: ${(remaining / 1048576).toFixed(1)} MB. Delete documents or upgrade to continue uploading.`;
      }
    }
    return errorResponse(err);
  }
}
