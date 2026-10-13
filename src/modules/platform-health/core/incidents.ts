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
    await syncSingleHealthIncident(check);
  }
}

async function syncSingleHealthIncident(check: PlatformHealthCheck): Promise<void> {
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
      return;
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

// ── Runtime incident capture ─────────────────────────────────────────────────
//
// The scheduled health checks only observe the platform when they run. Real
// user-visible failures (a chat retrieval that died on a 401 embedding call,
// a provider catalogue discovery that silently failed) must ALSO create
// incidents at the moment they happen — otherwise the platform admin only
// learns about a broken provider from container logs, exactly the gap that
// let an invalid OpenAI key break every KB chat for hours without a single
// admin notification.
//
// Recording is rate-limited per check key (default 10 minutes) so a burst of
// failed requests does not hammer the DB or spam the email queue; state
// CHANGES (healthy → failing, failing → healthy) are always recorded.

const RUNTIME_RATE_LIMIT_MS = 10 * 60_000;

const runtimeRecent = new Map<string, { healthy: boolean; message: string; at: number; check: PlatformHealthCheck }>();

export async function recordRuntimeIncident(check: PlatformHealthCheck): Promise<void> {
  try {
    const recent = runtimeRecent.get(check.key);
    if (
      recent &&
      recent.healthy === check.healthy &&
      recent.message === check.message &&
      Date.now() - recent.at < RUNTIME_RATE_LIMIT_MS
    ) {
      return;
    }
    await syncSingleHealthIncident(check);
    runtimeRecent.set(check.key, { healthy: check.healthy, message: check.message, at: Date.now(), check });
  } catch (error) {
    console.error("[platform-health] runtime incident record failed", check.key, error);
  }
}

/**
 * Called after a successful embedding round trip (chat retrieval, embed
 * search, ingestion). Clears every runtime-failing embedding incident so the
 * admin banner and email notifications reflect recovery promptly instead of
 * waiting for the next scheduled health check.
 */
export async function noteEmbeddingRequestSucceeded(): Promise<void> {
  for (const [key, state] of runtimeRecent) {
    if (!key.startsWith("ai-embedding") || state.healthy) continue;
    await recordRuntimeIncident({
      key,
      serviceName: state.check.serviceName,
      healthy: true,
      severity: "warning",
      message: "Embedding requests are succeeding again.",
    });
  }
}

function inferEmbeddingProviderFromError(message: string): "openai" | "gemini" | null {
  if (/openai|sk-proj-|api\.openai\.com|invalid_api_key/i.test(message)) return "openai";
  if (/gemini|generativelanguage|google/i.test(message)) return "gemini";
  return null;
}

async function describeEmbeddingDefault(): Promise<string> {
  try {
    const rows = await query<{ provider_id: string; model_id: string }>(
      "SELECT provider_id, model_id FROM platform_ai_embedding_defaults WHERE id = TRUE LIMIT 1",
    );
    const row = rows[0];
    return row ? ` Platform embedding default: ${row.provider_id}/${row.model_id}.` : " No platform embedding default is set (Settings → AI Platform → Embeddings).";
  } catch {
    return "";
  }
}

/**
 * Classify an embedding/retrieval failure from a live request path and record
 * a runtime incident. Message patterns map to operator-actionable guidance:
 * invalid API key → fix the credential; quota/billing → recharge; resolution
 * failure → configure the embedding default; dimension mismatch → re-index.
 */
export async function recordEmbeddingRuntimeFailure(
  error: unknown,
  context?: { surface?: string },
): Promise<void> {
  try {
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const surface = context?.surface ?? "a chat/retrieval request";
    const defaultNote = await describeEmbeddingDefault();
    const inferredProvider = inferEmbeddingProviderFromError(raw);

    let key: string;
    let serviceName: string;
    let message: string;
    let severity: "warning" | "critical";

    if (/invalid_api_key|Incorrect API key|Unauthorized|401/i.test(raw)) {
      const provider = inferredProvider ?? "openai";
      key = `ai-embedding:${provider}`;
      serviceName = `${provider === "openai" ? "OpenAI" : "Gemini"} embedding`;
      message =
        `Embedding request failed during ${surface}: the ${provider === "openai" ? "OpenAI" : "Gemini"} API key was rejected (401 invalid_api_key). ` +
        `Fix or replace the credential in Settings → AI Platform → Providers, or switch the embedding default to a healthy provider.${defaultNote}`;
      severity = "critical";
    } else if (/insufficient_quota|quota|billing|429|rate.?limit/i.test(raw)) {
      const provider = inferredProvider ?? "openai";
      key = `ai-embedding:${provider}`;
      serviceName = `${provider === "openai" ? "OpenAI" : "Gemini"} embedding`;
      message =
        `Embedding request failed during ${surface}: the provider reported a quota/billing limit (429). ` +
        `Recharge the account or switch the embedding default to another provider.${defaultNote}`;
      severity = "critical";
    } else if (/No embedding model is configured|AIConfigResolutionError/i.test(raw)) {
      key = "ai-embedding-config";
      serviceName = "Embedding configuration";
      message =
        `Embedding resolution failed during ${surface}: no usable embedding model resolved for the tenant. ` +
        `This usually means the embedding provider's live model discovery failed (bad key or unreachable vendor) and no fallback row is enabled. ` +
        `Set the platform embedding default and verify the provider credential (Settings → AI Platform).${defaultNote}`;
      severity = "critical";
    } else if (/dimension|vector size|expected vector/i.test(raw)) {
      key = "ai-embedding-dimension";
      serviceName = "Embedding dimensions";
      message =
        `Retrieval failed during ${surface}: the query embedding dimensions do not match the knowledge-base collection. ` +
        `The platform embedding backbone changed after this KB was indexed — re-index the knowledge base (or restore the original embedding provider).${defaultNote}`;
      severity = "warning";
    } else {
      const provider = inferredProvider;
      key = provider ? `ai-embedding:${provider}` : "ai-embedding";
      serviceName = provider ? `${provider === "openai" ? "OpenAI" : "Gemini"} embedding` : "Embedding pipeline";
      message = `Embedding request failed during ${surface}: ${raw.slice(0, 300)}.${defaultNote}`;
      severity = "warning";
    }

    await recordRuntimeIncident({ key, serviceName, healthy: false, severity, message });
  } catch (recordError) {
    console.error("[platform-health] embedding failure classification failed", recordError);
  }
}
