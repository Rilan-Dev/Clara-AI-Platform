/**
 * GET /api/analytics/revenue
 * ─────────────────────────────────────────────────────────────────────────────
 * Revenue trend charts — MRR over time, plan distribution, billing events.
 *
 * Query params:
 *   from   ISO date string (default: 6 months ago)
 *   to     ISO date string (default: today)
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

function safeDateParam(val: string | null, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // Platform-wide revenue analytics — super admin only.
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const sp       = req.nextUrl.searchParams;
    const toDate   = safeDateParam(sp.get("to"),   new Date());
    const fromDate = safeDateParam(sp.get("from"),  new Date(Date.now() - 180 * 86400 * 1000));

    // ── Monthly MRR trend (from subscription history) ─────────────────────
    const mrrTrend = await query<{
      month:       string;
      month_ts:    string;
      new_subs:    number;
      churned:     number;
      added_mrr:   number;
      active_subs: number;
    }>(`
      SELECT
        to_char(date_trunc('month', gs.month_date), 'Mon YYYY') AS month,
        date_trunc('month', gs.month_date)::text                AS month_ts,
        COUNT(os.id) FILTER (
          WHERE date_trunc('month', os.created_at) = date_trunc('month', gs.month_date)
            AND sp.price_usd > 0
        )::int                                                   AS new_subs,
        0::int                                                   AS churned,
        COALESCE(SUM(sp.price_usd) FILTER (
          WHERE date_trunc('month', os.created_at) = date_trunc('month', gs.month_date)
            AND sp.price_usd > 0
        ), 0)::int                                               AS added_mrr,
        COUNT(os.id) FILTER (
          WHERE os.created_at <= (gs.month_date + INTERVAL '1 month')
            AND (os.status IN ('active','trialing'))
            AND sp.price_usd > 0
        )::int                                                   AS active_subs
      FROM generate_series(
        date_trunc('month', $1::timestamptz),
        date_trunc('month', $2::timestamptz),
        INTERVAL '1 month'
      ) AS gs(month_date)
      LEFT JOIN org_subscriptions os ON TRUE
      LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
      GROUP BY gs.month_date
      ORDER BY gs.month_date ASC
    `, [fromDate.toISOString(), toDate.toISOString()]);

    // ── Plan distribution (current snapshot) ─────────────────────────────
    const planDist = await query<{ plan_id: string; plan_name: string; count: number; mrr: number }>(`
      SELECT
        COALESCE(os.plan_id, 'free')  AS plan_id,
        COALESCE(sp.name, 'Free')     AS plan_name,
        COUNT(o.id)::int              AS count,
        COALESCE(SUM(CASE
          WHEN os.status = 'active' AND COALESCE(os.price_snapshot, sp.price_usd) > 0
          THEN COALESCE(os.price_snapshot, sp.price_usd)
          ELSE 0 END), 0)::int AS mrr
      FROM organisations o
      LEFT JOIN org_subscriptions os ON os.org_id = o.id AND os.status IN ('active','trialing')
      LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
      GROUP BY COALESCE(os.plan_id,'free'), COALESCE(sp.name,'Free')
      ORDER BY mrr DESC
    `, []);

    // ── Billing events timeline (actual payments) ─────────────────────────
    const billingTimeline = await query<{
      day:          string;
      total_usd:    number;
      total_inr:    number;
      event_count:  number;
      gateway:      string;
    }>(`
      SELECT
        created_at::date::text       AS day,
        COALESCE(SUM(amount_cents), 0) / 100  AS total_usd,
        COALESCE(SUM(amount_paise), 0) / 100  AS total_inr,
        COUNT(*)::int                AS event_count,
        gateway
      FROM billing_events
      WHERE status = 'paid'
        AND created_at BETWEEN $1 AND $2
      GROUP BY created_at::date, gateway
      ORDER BY day ASC
    `, [fromDate.toISOString(), toDate.toISOString()]);

    // ── Current totals ────────────────────────────────────────────────────
    const totals = await query<{ mrr: number; arr: number; paying_orgs: number; trial_orgs: number }>(`
      SELECT
        COALESCE(SUM(
          CASE WHEN os.status = 'active' AND COALESCE(os.price_snapshot, sp.price_usd) > 0
            THEN COALESCE(os.price_snapshot, sp.price_usd)
            ELSE 0 END
        ), 0)::int AS mrr,
        COALESCE(SUM(
          CASE WHEN os.status = 'active' AND COALESCE(os.price_snapshot, sp.price_usd) > 0
            THEN COALESCE(os.price_snapshot, sp.price_usd)
            ELSE 0 END
        ), 0)::int * 12 AS arr,
        COUNT(*) FILTER (WHERE os.status = 'active'
          AND COALESCE(os.price_snapshot, sp.price_usd) > 0)::int AS paying_orgs,
        COUNT(*) FILTER (WHERE os.status = 'trialing'
          AND COALESCE(os.price_snapshot, sp.price_usd) > 0)::int AS trial_orgs
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
    `, []);

    return NextResponse.json({
      mrrTrend,
      planDist,
      billingTimeline,
      totals: totals[0] ?? { mrr: 0, arr: 0, paying_orgs: 0, trial_orgs: 0 },
      meta: { from: fromDate.toISOString(), to: toDate.toISOString() },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/analytics/revenue]", err);
    return NextResponse.json({ error: "Failed to fetch revenue analytics" }, { status: 500 });
  }
}
