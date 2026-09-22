/**
 * Platform health incident persistence + super-admin notifications.
 *
 * This is deliberately independent of the System Status UI. A failing
 * dependency therefore creates an auditable incident and attempts email
 * delivery even when nobody is looking at /system-status.
 */

import { query } from "@/lib/db";
import { sendPlatformEmail } from "@/lib/email";

export type PlatformHealthCheck = {
  key: string;
  serviceName: string;
  healthy: boolean;
  severity: "warning" | "critical";
  message: string;
};

type AdminRecipient = { id: string; email: string };

async function getSuperAdmins(): Promise<AdminRecipient[]> {
  try {
    return await query<AdminRecipient>(
      `SELECT id, email
         FROM users
        WHERE is_super_admin = TRUE
          AND status = 'active'
          AND email IS NOT NULL
          AND btrim(email) <> ''`,
    );
  } catch (error) {
    console.error("[platform-health] failed to load super-admin recipients", error);
    return [];
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function notifyAdmins(params: {
  incidentKey: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
}): Promise<void> {
  const admins = await getSuperAdmins();
  for (const admin of admins) {
    try {
      const rows = await query<{ id: string }>(
        `INSERT INTO platform_admin_notifications
           (incident_key, recipient_user_id, recipient_email, severity, title, message)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          params.incidentKey,
          admin.id,
          admin.email,
          params.severity,
          params.title,
          params.message,
        ],
      );
      const notificationId = rows[0]?.id;
      if (!notificationId) continue;

      const result = await sendPlatformEmail({
        to: admin.email,
        subject: `[Clara Platform] ${params.title}`,
        text: `${params.message}\n\nSystem Status: /system-status`,
        html: `<h2>${escapeHtml(params.title)}</h2><p>${escapeHtml(params.message)}</p><p>Open Clara Platform → System Status to investigate.</p>`,
      });

      if (result.sent || result.provider === "console") {
        await query(
          `UPDATE platform_admin_notifications
              SET status = 'sent', sent_at = now(), attempts = attempts + 1
            WHERE id = $1`,
          [notificationId],
        );
      } else {
        await query(
          `UPDATE platform_admin_notifications
              SET status = 'failed', error_message = $1, attempts = attempts + 1
            WHERE id = $2`,
          [result.error ?? "Email provider did not send the notification.", notificationId],
        );
      }
    } catch (error) {
      console.error("[platform-health] admin notification delivery failed", error);
    }
  }
}

export async function syncPlatformHealthIncidents(
  checks: PlatformHealthCheck[],
): Promise<void> {
  for (const check of checks) {
    try {
      const existing = await query<{
        status: "healthy" | "failing";
        message: string;
      }>(
        `SELECT status, message
           FROM platform_health_incidents
          WHERE check_key = $1`,
        [check.key],
      );

      const previous = existing[0] ?? null;

      if (check.healthy) {
        if (previous?.status === "failing") {
          await query(
            `UPDATE platform_health_incidents
                SET status = 'healthy',
                    resolved_at = now(),
                    last_seen_at = now()
              WHERE check_key = $1`,
            [check.key],
          );
          await notifyAdmins({
            incidentKey: check.key,
            severity: "warning",
            title: `${check.serviceName} recovered`,
            message: `${check.serviceName} is healthy again. Previous issue: ${previous.message}`,
          });
        } else {
          await query(
            `INSERT INTO platform_health_incidents
               (check_key, service_name, status, severity, message)
             VALUES ($1, $2, 'healthy', $3, $4)
             ON CONFLICT (check_key) DO UPDATE
               SET last_seen_at = now()`,
            [check.key, check.serviceName, check.severity, check.message],
          );
        }
        continue;
      }

      await query(
        `INSERT INTO platform_health_incidents
           (check_key, service_name, status, severity, message, first_seen_at, last_seen_at)
         VALUES ($1, $2, 'failing', $3, $4, now(), now())
         ON CONFLICT (check_key) DO UPDATE
           SET service_name = EXCLUDED.service_name,
               status = 'failing',
               severity = EXCLUDED.severity,
               message = EXCLUDED.message,
               last_seen_at = now()`,
        [check.key, check.serviceName, check.severity, check.message],
      );

      const shouldNotify =
        !previous ||
        previous.status === "healthy" ||
        previous.message !== check.message;

      if (shouldNotify) {
        await query(
          `UPDATE platform_health_incidents
              SET last_notified_at = now()
            WHERE check_key = $1`,
          [check.key],
        );
        await notifyAdmins({
          incidentKey: check.key,
          severity: check.severity,
          title: `${check.serviceName} requires attention`,
          message: check.message,
        });
      }
    } catch (error) {
      // Monitoring must never make the status endpoint fail.
      console.error("[platform-health] incident sync failed", check.key, error);
    }
  }
}
