import { db } from "@/lib/db";
import { errorResponse, ApiError } from "@/lib/api-contract";
import { requireOrgUser } from "@/lib/session";
import { planSpec, PLANS } from "@/lib/plans";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/upgrade — switch the org's plan (Razorpay in
 * production; direct here). Every change writes a BILLING audit row.
 */
export async function POST(req: Request) {
  try {
    const { user, orgId } = await requireOrgUser(req);
    if (user.role !== "org_admin" && user.role !== "platform_admin") {
      throw new ApiError(
        403,
        "ORG_ADMIN_REQUIRED",
        "Only organisation admins can change the plan."
      );
    }
    const body = (await req.json()) as { planId: string };
    const target = PLANS.find((p) => p.id === body.planId);
    if (!target) {
      throw new ApiError(422, "VALIDATION_FAILED", "Unknown plan id.", {
        fields: { planId: "Pick a plan from the catalogue." },
      });
    }
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new ApiError(404, "ORG_NOT_FOUND", "Organisation not found.");
    if (org.planId === target.id) {
      throw new ApiError(422, "ALREADY_ON_PLAN", `Already on the ${target.name} plan.`);
    }
    const from = planSpec(org.planId);

    const updated = await db.organization.update({
      where: { id: orgId },
      data: {
        planId: target.id,
        renewalDate: new Date(Date.now() + 30 * 864e5),
      },
    });

    await appendAudit({
      orgId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "BILLING",
      answerText: `Plan changed from ${from.name} to ${target.name} (₹${target.priceInr}/month). New limits: ${target.requestsDay}/day, ${target.requestsMonth}/month, ${target.kbs === -1 ? "unlimited" : target.kbs} KBs.`,
    });

    return Response.json({
      org: { id: updated.id, planId: updated.planId, renewalDate: updated.renewalDate },
      plan: { id: target.id, name: target.name },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
