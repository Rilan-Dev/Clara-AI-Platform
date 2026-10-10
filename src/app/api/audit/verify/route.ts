import { errorResponse } from "@/lib/api-contract";
import { requirePlatformAdmin } from "@/lib/session";
import { verifyChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/audit/verify — recomputes the hash chain, reports integrity. */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin(req);
    return Response.json(await verifyChain());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/audit/verify — deliberate tamper test used by the validation
 * suite: flips one character inside a row, verifies the chain now breaks,
 * then restores the original value. Proves tamper-evidence end to end.
 */
export async function POST(req: Request) {
  try {
    await requirePlatformAdmin(req);
    const { db } = await import("@/lib/db");
    const target = await db.auditLog.findFirst({
      orderBy: { seq: "desc" },
      where: { promptText: { not: null } },
    });
    if (!target) {
      return Response.json({
        tampered: false,
        ok: true,
        note: "No prompt rows to tamper with.",
      });
    }
    const original = target.promptText as string;
    await db.auditLog.update({
      where: { id: target.id },
      data: { promptText: original + " (edited)" },
    });
    const broken = await verifyChain();
    await db.auditLog.update({
      where: { id: target.id },
      data: { promptText: original },
    });
    const restored = await verifyChain();
    return Response.json({
      tampered: true,
      chainBrokeAfterTamper: !broken.ok,
      breakDetail: broken.firstBreak,
      chainOkAfterRestore: restored.ok,
      tamperedSeq: target.seq,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
