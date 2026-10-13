import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

type HealthAlert = {
  id: string;
  incidentKey: string;
  serviceName: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
  lastSeenAt: string;
};

const ACTIONS: Record<string, { actionLabel: string; actionHref: string }> = {
  "ai-provider:gemini": { actionLabel: "Open AI settings", actionHref: "/settings/ai" },
  gemini: { actionLabel: "Open AI settings", actionHref: "/settings/ai" },
  razorpay: { actionLabel: "Open payment settings", actionHref: "/settings/payments" },
  stripe: { actionLabel: "Open payment settings", actionHref: "/settings/payments" },
  "stripe-webhook": { actionLabel: "Open payment settings", actionHref: "/settings/payments" },
};

function actionFor(key: string) {
  // Every AI incident family (ai-provider:*, ai-embedding*, ai-catalog:*)
  // routes to the AI Platform workspace where the credential / default that
  // caused the incident is actually editable.
  if (key === "ai-embedding-config" || key === "ai-embedding-dimension" || key.startsWith("ai-embedding") || key.startsWith("ai-provider:") || key.startsWith("ai-catalog:")) {
    return { actionLabel: "Open AI settings", actionHref: "/settings/ai" };
  }
  return ACTIONS[key] ?? { actionLabel: "Open system status", actionHref: "/system-status" };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const rows = await query<{
      check_key: string;
      service_name: string;
      severity: "warning" | "critical";
      message: string;
      last_seen_at: string;
    }>(
      `SELECT check_key, service_name, severity, message, last_seen_at
         FROM platform_health_incidents
        WHERE status = 'failing'
        ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, last_seen_at DESC`,
    );

    const alerts: HealthAlert[] = rows.map((row) => ({
      id: row.check_key,
      incidentKey: row.check_key,
      serviceName: row.service_name,
      severity: row.severity,
      title: `${row.service_name} needs attention`,
      message: row.message,
      ...actionFor(row.check_key),
      lastSeenAt: row.last_seen_at,
    }));

    return NextResponse.json({ alerts });
  } catch (error) {
    const status = error instanceof Error && /forbidden|unauthorized/i.test(error.message) ? 403 : 500;
    return NextResponse.json({ error: "Unable to load platform health alerts." }, { status });
  }
}
