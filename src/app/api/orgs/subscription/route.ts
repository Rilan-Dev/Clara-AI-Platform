import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { writeSubscriptionAudit, queueNotification } from "@/lib/subscription-notifications";
import { computeEffectiveSubscription } from "@/lib/subscription-expiry";

const FREE_PLAN_FALLBACK = {
  plan_id: "free", plan_name: "Free", status: "active",
  current_period_start: null, current_period_end: null,
  cancel_at_period_end: false, paused_at: null, cancelled_at: null,
  trial_extended_days: 0, admin_note: null, gateway: null,
  stripe_subscription_id: null, razorpay_subscription_id: null,
  plan_version_id: null, price_snapshot: 0, plan_snapshot: null,
  max_kbs: 1, max_docs_per_kb: 10, max_req_day: 100, max_storage_mb: 100,
  voice_enabled: false, api_access: false, custom_branding: false,
  analytics_level: "basic", features: ["1 Knowledge Base","10 documents","100 requests/day"],
  price_usd: 0,
};

/** GET /api/orgs/subscription?orgId=xxx */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  try {
    await ensureMigrated();

    // ── Auth: org members see their own subscription; super-admins see any. ──
    // Without this check any authenticated user could read (and, before the
    // PUT/PATCH guards existed, CHANGE) any org's plan — a hard bypass.
    const auth = await requireAuth(req);
    if (!auth.user.isSuperAdmin) {
      const membership = await query<{ id: string }>(
        "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
        [orgId, auth.user.id]
      );
      if (!membership[0]) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch the subscription row regardless of status — expired / cancelled
    // / past_due subscriptions still need to be visible so their owners can
    // renew. The "effective" fields tell the UI what to display and which
    // CTA (renew / upgrade / none) to surface.
    const [subR, usageR] = await Promise.all([
      query(`
        SELECT os.id, os.org_id, os.plan_id, os.status,
          os.current_period_start, os.current_period_end,
          os.cancel_at_period_end, os.paused_at, os.cancelled_at,
          os.trial_extended_days, os.admin_note, os.gateway,
          os.stripe_subscription_id, os.razorpay_subscription_id,
          COALESCE(pv.name, sp.name) AS plan_name,
          COALESCE(pv.price_usd, sp.price_usd) AS price_usd,
          COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
          COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
          COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
          COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
          COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
          COALESCE(pv.api_access, sp.api_access) AS api_access,
          COALESCE(pv.custom_branding, sp.custom_branding) AS custom_branding,
          COALESCE(pv.analytics_level, sp.analytics_level) AS analytics_level,
          COALESCE(pv.features, sp.features) AS features,
          os.plan_version_id, os.price_snapshot, os.plan_snapshot
        FROM org_subscriptions os
        JOIN subscription_plans sp ON sp.id = os.plan_id
        LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
        WHERE os.org_id = $1
        ORDER BY os.updated_at DESC
        LIMIT 1
      `, [orgId]),

      query(`
        SELECT
          (SELECT COUNT(*)::int FROM agents p JOIN knowledge_bases kb ON kb.agent_id=p.id WHERE p.org_id=$1) AS kb_count,
          (SELECT COUNT(*)::int FROM query_events qe WHERE qe.org_id=$1 AND (qe.created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS requests_today,
          (SELECT COALESCE(SUM(d.file_size),0)::bigint FROM documents d JOIN knowledge_bases kb ON kb.id=d.kb_id JOIN agents p ON p.id=kb.agent_id WHERE p.org_id=$1) AS storage_bytes
      `, [orgId]),
    ]);

    const sub = subR[0];
    const effective = sub
      ? computeEffectiveSubscription(sub as { plan_id: string; plan_name: string; status: string; current_period_end: string | null })
      : null;

    return NextResponse.json({
      subscription: sub ?? FREE_PLAN_FALLBACK,
      effective,
      usage: usageR[0] ?? { kb_count: 0, requests_today: 0, storage_bytes: 0 },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/orgs/subscription]", err);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}

/** PUT /api/orgs/subscription — change plan (platform admin only; org users pay via checkout) */
export async function PUT(req: NextRequest) {
  try {
    await ensureMigrated();
    // ── Auth: changing a plan grants quotas — super-admin only. Org users
    // upgrade through Razorpay/Stripe checkout instead. ──
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { orgId, planId, note } = await req.json() as { orgId: string; planId: string; note?: string };
    if (!orgId || !planId) return NextResponse.json({ error: "orgId and planId required" }, { status: 400 });

    const [orgR, oldSubR, newPlanR] = await Promise.all([
      query<{ name: string; slug: string }>(`SELECT name, slug FROM organisations WHERE id=$1`, [orgId]),
      query<{ plan_id: string; status: string }>(`SELECT plan_id, status FROM org_subscriptions WHERE org_id=$1 LIMIT 1`, [orgId]),
      query<Record<string, unknown>>(`
        SELECT sp.id, COALESCE(pv.id, NULL) AS plan_version_id,
               COALESCE(pv.version, 1) AS version,
               COALESCE(pv.name, sp.name) AS name,
               COALESCE(pv.description, sp.description) AS description,
               COALESCE(pv.price_usd, sp.price_usd) AS price_usd,
               COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
               COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
               COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
               COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
               COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
               COALESCE(pv.api_access, sp.api_access) AS api_access,
               COALESCE(pv.custom_branding, sp.custom_branding) AS custom_branding,
               COALESCE(pv.sso_enabled, sp.sso_enabled) AS sso_enabled,
               COALESCE(pv.analytics_level, sp.analytics_level) AS analytics_level,
               COALESCE(pv.priority_support, sp.priority_support) AS priority_support,
               COALESCE(pv.features, sp.features) AS features
        FROM subscription_plans sp
        LEFT JOIN LATERAL (
          SELECT * FROM subscription_plan_versions
          WHERE plan_id = sp.id AND status = 'published'
          ORDER BY version DESC LIMIT 1
        ) pv ON TRUE
        WHERE sp.id=$1
      `, [planId]),
    ]);

    const org     = orgR[0];
    const oldSub  = oldSubR[0];
    const newPlan = newPlanR[0];
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    if (!newPlan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    const newPlanName = String(newPlan.name);

    const snapshot = {
      planId,
      version: newPlan.version,
      name: newPlan.name,
      description: newPlan.description,
      priceUsd: newPlan.price_usd,
      maxKbs: newPlan.max_kbs,
      maxDocsPerKb: newPlan.max_docs_per_kb,
      maxReqDay: newPlan.max_req_day,
      maxStorageMb: newPlan.max_storage_mb,
      voiceEnabled: newPlan.voice_enabled,
      apiAccess: newPlan.api_access,
      customBranding: newPlan.custom_branding,
      ssoEnabled: newPlan.sso_enabled,
      analyticsLevel: newPlan.analytics_level,
      prioritySupport: newPlan.priority_support,
      features: newPlan.features,
    };

    await query(`
      INSERT INTO org_subscriptions
        (org_id, plan_id, plan_version_id, plan_snapshot, price_snapshot, status, admin_note)
      VALUES ($1, $2, $3, $4::jsonb, $5, 'active', $6)
      ON CONFLICT (org_id) DO UPDATE SET
        plan_id=$2, plan_version_id=$3, plan_snapshot=$4::jsonb, price_snapshot=$5,
        status='active', cancel_at_period_end=FALSE, paused_at=NULL,
        cancelled_at=NULL, admin_note=$6, updated_at=now()
    `, [
      orgId, planId, newPlan.plan_version_id, JSON.stringify(snapshot), newPlan.price_usd, note ?? null,
    ]);

    await writeSubscriptionAudit({
      orgId, actorLabel: "admin", action: "plan_changed",
      oldPlanId: oldSub?.plan_id, newPlanId: planId,
      oldStatus: oldSub?.status, newStatus: "active", note,
    });

    const recipientEmail = await getOrgOwnerEmail(orgId);
    if (recipientEmail) {
      await queueNotification({
        orgId, orgName: org.name, recipientEmail, type: "plan_changed",
        data: { orgName: org.name, oldPlan: oldSub?.plan_id ?? "free", newPlan: newPlanName, planName: newPlanName, note: note ?? "" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/orgs/subscription]", err);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}

/** PATCH /api/orgs/subscription — cancel | pause | resume | extend_trial | convert_trial | reactivate (platform admin only) */
export async function PATCH(req: NextRequest) {
  try {
    await ensureMigrated();
    // ── Auth: lifecycle changes are admin actions. ──
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = await req.json() as {
      orgId: string;
      action: "cancel" | "pause" | "resume" | "extend_trial" | "convert_trial" | "reactivate";
      note?: string;
      trialDays?: number;
      planId?: string;
    };
    const { orgId, action, note, trialDays, planId } = body;
    if (!orgId || !action) return NextResponse.json({ error: "orgId and action required" }, { status: 400 });

    const [orgR, subR] = await Promise.all([
      query<{ name: string }>(`SELECT name FROM organisations WHERE id=$1`, [orgId]),
      query<{ plan_id: string; status: string; current_period_end: string; plan_name: string }>(
        `SELECT os.plan_id, os.status, os.current_period_end, sp.name AS plan_name
         FROM org_subscriptions os JOIN subscription_plans sp ON sp.id=os.plan_id WHERE os.org_id=$1 LIMIT 1`, [orgId]),
    ]);

    const org = orgR[0];
    const sub = subR[0];
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    if (!sub && action !== "reactivate") return NextResponse.json({ error: "No subscription found" }, { status: 404 });

    const recipientEmail = await getOrgOwnerEmail(orgId);
    const oldStatus = sub?.status ?? "none";
    const currentPlanName = sub?.plan_name ?? "Free";

    switch (action) {

      case "cancel": {
        await query(`UPDATE org_subscriptions SET status='cancelled', cancel_at_period_end=TRUE, cancelled_at=now(), admin_note=$1, updated_at=now() WHERE org_id=$2`, [note ?? null, orgId]);
        await writeSubscriptionAudit({ orgId, actorLabel: "admin", action: "cancelled", oldStatus, newStatus: "cancelled", oldPlanId: sub!.plan_id, note });
        if (recipientEmail) await queueNotification({ orgId, orgName: org.name, recipientEmail, type: "subscription_cancelled", data: { orgName: org.name, planName: currentPlanName, note: note ?? "" } });
        break;
      }

      case "pause": {
        await query(`UPDATE org_subscriptions SET status='paused', paused_at=now(), admin_note=$1, updated_at=now() WHERE org_id=$2`, [note ?? null, orgId]);
        await writeSubscriptionAudit({ orgId, actorLabel: "admin", action: "paused", oldStatus, newStatus: "paused", oldPlanId: sub!.plan_id, note });
        if (recipientEmail) await queueNotification({ orgId, orgName: org.name, recipientEmail, type: "subscription_paused", data: { orgName: org.name, planName: currentPlanName, note: note ?? "" } });
        break;
      }

      case "resume": {
        await query(`UPDATE org_subscriptions SET status='active', paused_at=NULL, cancelled_at=NULL, cancel_at_period_end=FALSE, admin_note=$1, updated_at=now() WHERE org_id=$2`, [note ?? null, orgId]);
        await writeSubscriptionAudit({ orgId, actorLabel: "admin", action: "resumed", oldStatus, newStatus: "active", oldPlanId: sub!.plan_id, note });
        if (recipientEmail) await queueNotification({ orgId, orgName: org.name, recipientEmail, type: "subscription_resumed", data: { orgName: org.name, planName: currentPlanName } });
        break;
      }

      case "extend_trial": {
        const days = Math.max(1, Math.min(365, trialDays ?? 7));
        await query(`
          UPDATE org_subscriptions SET
            status='trialing',
            current_period_end = COALESCE(current_period_end, now()) + ($1 || ' days')::INTERVAL,
            trial_extended_days = COALESCE(trial_extended_days,0) + $1,
            admin_note=$2, updated_at=now()
          WHERE org_id=$3
        `, [days, note ?? null, orgId]);
        const newEndR = await query<{ current_period_end: string }>(`SELECT current_period_end FROM org_subscriptions WHERE org_id=$1`, [orgId]);
        const newEnd  = newEndR[0]?.current_period_end ? new Date(newEndR[0].current_period_end).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "—";
        await writeSubscriptionAudit({ orgId, actorLabel: "admin", action: "trial_extended", oldStatus, newStatus: "trialing", oldPlanId: sub?.plan_id, note, metadata: { days } });
        if (recipientEmail) await queueNotification({ orgId, orgName: org.name, recipientEmail, type: "trial_extended", data: { orgName: org.name, planName: currentPlanName, trialDays: String(days), trialEnd: newEnd, note: note ?? "" } });
        break;
      }

      case "convert_trial": {
        const targetPlanId = planId ?? sub?.plan_id;
        if (!targetPlanId) return NextResponse.json({ error: "planId required for convert_trial" }, { status: 400 });
        const planR = await query<{ name: string }>(`SELECT name FROM subscription_plans WHERE id=$1`, [targetPlanId]);
        const planName = planR[0]?.name ?? targetPlanId;
        await query(`UPDATE org_subscriptions SET status='active', plan_id=$1, cancel_at_period_end=FALSE, paused_at=NULL, admin_note=$2, updated_at=now() WHERE org_id=$3`, [targetPlanId, note ?? null, orgId]);
        await writeSubscriptionAudit({ orgId, actorLabel: "admin", action: "trial_converted", oldStatus, newStatus: "active", oldPlanId: sub?.plan_id, newPlanId: targetPlanId, note });
        if (recipientEmail) await queueNotification({ orgId, orgName: org.name, recipientEmail, type: "trial_converted", data: { orgName: org.name, planName } });
        break;
      }

      case "reactivate": {
        const targetPlanId = planId ?? sub?.plan_id ?? "free";
        await query(`
          INSERT INTO org_subscriptions (org_id, plan_id, status, admin_note)
          VALUES ($1, $2, 'active', $3)
          ON CONFLICT (org_id) DO UPDATE SET status='active', plan_id=$2, cancel_at_period_end=FALSE, paused_at=NULL, cancelled_at=NULL, admin_note=$3, updated_at=now()
        `, [orgId, targetPlanId, note ?? null]);
        const planR = await query<{ name: string }>(`SELECT name FROM subscription_plans WHERE id=$1`, [targetPlanId]);
        const planName = planR[0]?.name ?? targetPlanId;
        await writeSubscriptionAudit({ orgId, actorLabel: "admin", action: "reactivated", oldStatus, newStatus: "active", oldPlanId: sub?.plan_id, newPlanId: targetPlanId, note });
        if (recipientEmail) await queueNotification({ orgId, orgName: org.name, recipientEmail, type: "subscription_reactivated", data: { orgName: org.name, planName } });
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/orgs/subscription]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Helper: get org owner email ───────────────────────────────────────────────
async function getOrgOwnerEmail(orgId: string): Promise<string | null> {
  try {
    // org_members has no "owner" role — the closest concept is 'org_admin'
    // (the highest-privilege role in the roles table). Pick the earliest-
    // joined org_admin as the notification recipient.
    const rows = await query<{ email: string }>(`
      SELECT u.email FROM users u
      JOIN org_members om ON om.user_id=u.id
      JOIN roles r ON r.id=om.role_id
      WHERE om.org_id=$1 AND r.name='org_admin'
      ORDER BY om.joined_at ASC
      LIMIT 1
    `, [orgId]);
    return rows[0]?.email ?? null;
  } catch {
    return null;
  }
}
