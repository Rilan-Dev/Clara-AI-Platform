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

// ── Email delivery meta-monitoring ────────────────────────────────────────
//
// notifyAdmins() is the platform's "let the admin know" channel. When the
// email provider itself is broken (invalid Resend key, SMTP unreachable),
// notification rows pile up as status='failed' in the DB and NOBODY is told —
// the exact "issue was not captured" complaint that let a dead OpenAI key
// break KB chat unnoticed. These helpers record an email-delivery incident
// (visible on the super-admin banner + System Status, which do not depend on
// email) WITHOUT attempting an email for it — recording an email failure by
// email would loop.

async function noteEmailDeliveryFailed(provider: string, error: string): Promise<void> {
  try {
    await recordRuntimeIncident(
      {
        key: `email-delivery:${provider}`,
        serviceName: "Email delivery",
        healthy: false,
        severity: "warning",
        message:
          `Admin notification emails are failing via ${provider}: ${error.slice(0, 200)} ` +
          `Incidents are still recorded in-app (super-admin banner / System Status), but no emails go out. ` +
          `Fix the credential or switch provider in Settings → Email Delivery.`,
      },
      { notify: false },
    );
  } catch {
    // Meta-monitoring must never break the notification write path.
  }
}

async function noteEmailDeliverySucceeded(provider: string): Promise<void> {
  try {
    await recordRuntimeIncident(
      {
        key: `email-delivery:${provider}`,
        serviceName: "Email delivery",
        healthy: true,
        severity: "warning",
        message: `Notification emails are delivering again via ${provider}.`,
      },
      { notify: false },
    );
  } catch {
    // Meta-monitoring must never break the notification write path.
  }
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
        if (result.provider !== "console") {
          // A delivered email proves the notification channel is alive —
          // resolve any failing email-delivery incident.
          void noteEmailDeliverySucceeded(result.provider);
        }
      } else {
        await query(
          `UPDATE platform_admin_notifications
              SET status = 'failed', error_message = $1, attempts = attempts + 1
            WHERE id = $2`,
          [result.error ?? "Email provider did not send the notification.", notificationId],
        );
        // The notification channel itself is broken — surface it in-app
        // (never by email, which would loop).
        void noteEmailDeliveryFailed(result.provider, result.error ?? "email provider did not send");
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

async function syncSingleHealthIncident(
  check: PlatformHealthCheck,
  opts?: { notify?: boolean },
): Promise<void> {
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

    if (shouldNotify && opts?.notify !== false) {
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

export async function recordRuntimeIncident(
  check: PlatformHealthCheck,
  opts?: { notify?: boolean },
): Promise<void> {
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
    await syncSingleHealthIncident(check, opts);
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
 * Flatten an error and its cause chain into one classifiable string. Provider
 * SDKs wrap transport failures as a bare `TypeError: fetch failed`; the
 * operator-actionable detail ("Connect Timeout Error (attempted address:
 * generativelanguage.googleapis.com:443, timeout: 10000ms)") only appears in
 * `error.cause`. Without this, network failures classified as a generic
 * one-line warning and nobody could tell WHICH endpoint was unreachable.
 */
function chainText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [`${error.name}: ${error.message}`];
  let current: unknown = (error as { cause?: unknown }).cause;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      parts.push(current);
      current = null;
    } else {
      current = null;
    }
  }
  return parts.join(" · ");
}

/**
 * Classify an embedding/retrieval failure from a live request path and record
 * a runtime incident. Message patterns map to operator-actionable guidance:
 * invalid API key → fix the credential; quota/billing → recharge; resolution
 * failure → configure the embedding default; dimension mismatch → re-index;
 * unreachable endpoint → firewall/DNS/proxy.
 */
export async function recordEmbeddingRuntimeFailure(
  error: unknown,
  context?: { surface?: string },
): Promise<void> {
  try {
    const raw = chainText(error);
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
    } else if (/fetch failed|connect ?timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|EHOSTUNREACH|ENETUNREACH|unreachable/i.test(raw)) {
      const provider = inferredProvider;
      key = provider ? `ai-embedding:${provider}` : "ai-embedding";
      serviceName = provider ? `${provider === "openai" ? "OpenAI" : "Gemini"} embedding` : "Embedding pipeline";
      const host =
        raw.match(/attempted address:\s*([a-z0-9._-]+(?::\d+)?)/i)?.[1] ??
        raw.match(/https?:\/\/([a-z0-9._-]+)/i)?.[1] ??
        null;
      message =
        `The embedding endpoint could not be reached from the server during ${surface}` +
        `${host ? ` (${host})` : ""}: ${raw.slice(0, 200)}. ` +
        `Outbound access to the embedding vendor is blocked, flaky or slow — check the server's ` +
        `firewall/DNS/egress, set HTTPS_PROXY if provider traffic must go through an egress proxy, ` +
        `or raise EGRESS_CONNECT_TIMEOUT_MS for slow international routes.${defaultNote}`;
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

// ── Brain (chat completion) runtime incident capture ────────────────────────
//
// The embedding backbone got runtime incident capture first because it broke
// every KB chat. But the SAME blind spot existed for the answer engine: an
// OpenAI/Gemini/Sarvam chat-completion 401 (dead key) or 429 (billing
// exhausted) only produced container logs — "The assistant could not complete
// the answer" for users, silence for the platform admin. These helpers close
// that gap from the live request paths (assistant chat, embed widget chat).

function displayBrainProviderName(provider: string): string {
  switch (provider.toLowerCase()) {
    case "openai":
      return "OpenAI";
    case "gemini":
    case "google":
      return "Gemini";
    case "sarvam":
      return "Sarvam";
    case "anthropic":
      return "Anthropic";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

function inferBrainProviderFromError(message: string): string {
  if (/openai|sk-proj-|api\.openai\.com|gpt-|invalid_api_key/i.test(message)) return "openai";
  if (/gemini|generativelanguage|google/i.test(message)) return "gemini";
  if (/sarvam|api\.sarvam\.ai/i.test(message)) return "sarvam";
  return "provider";
}

/**
 * Classify a brain (chat-completion) provider failure from a live request
 * path and record a runtime incident — the super-admin banner + email fire
 * without anyone watching container logs. Rate-limited per key (10 min).
 */
export async function recordBrainRuntimeFailure(
  error: unknown,
  context?: { surface?: string; provider?: string; model?: string },
): Promise<void> {
  try {
    const raw = chainText(error);
    const surface = context?.surface ?? "a chat request";
    const providerId = (context?.provider ?? inferBrainProviderFromError(raw)).toLowerCase();
    const providerName = displayBrainProviderName(providerId);
    const modelNote = context?.model ? ` (model ${context.model})` : "";
    const aborted = /abort|cancel|AbortError/i.test(raw);

    // User aborts/cancellations are not provider failures — never record.
    if (aborted && !/401|403|429|quota|invalid_api_key/i.test(raw)) return;

    let message: string;
    let severity: "warning" | "critical";

    if (/invalid_api_key|Incorrect API key|Unauthorized|401|403/i.test(raw)) {
      message =
        `The ${providerName} answer engine failed during ${surface}: the API key was rejected (401/403). ` +
        `Chats, agent preview and published agents will keep failing until the credential is fixed — ` +
        `update it in Settings → AI Platform → Providers${modelNote}.`;
      severity = "critical";
    } else if (/insufficient_quota|quota|billing|exceeded your current quota|429/i.test(raw)) {
      message =
        `The ${providerName} answer engine failed during ${surface}: the provider reported a quota/billing limit (429). ` +
        `Recharge the account or switch the chat/brain default to another provider (Settings → AI Platform)${modelNote}.`;
      severity = "critical";
    } else if (/model_not_found|model .* does not exist|no such model|404/i.test(raw)) {
      message =
        `The ${providerName} answer engine failed during ${surface}: the configured chat model is unavailable to this account${modelNote}. ` +
        `Pick an accessible model in Settings → AI Platform.`;
      severity = "critical";
    } else if (/is currently unhealthy|has no configured credentials|is disabled by the platform/i.test(raw)) {
      message =
        `The ${providerName} provider is gated for ${surface}: ${raw.slice(0, 200)}. ` +
        `Chats, agent preview and published agents keep failing until the provider is healthy again — ` +
        `run "Test connection" (Settings → AI Platform → Providers), fix the credential/base URL, ` +
        `or switch the assistant's chat model${modelNote}.`;
      severity = "critical";
    } else if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(raw)) {
      message =
        `The ${providerName} answer engine could not be reached during ${surface} (network/timeout). ` +
        `Check the provider base URL and network egress${modelNote}.`;
      severity = "warning";
    } else {
      message = `The ${providerName} answer engine failed during ${surface}: ${raw.slice(0, 300)}${modelNote}.`;
      severity = "warning";
    }

    await recordRuntimeIncident({
      key: `ai-brain:${providerId}`,
      serviceName: `${providerName} answer engine`,
      healthy: false,
      severity,
      message,
    });
  } catch (recordError) {
    console.error("[platform-health] brain failure classification failed", recordError);
  }
}

/**
 * Called after a successful chat-completion round trip. Clears the
 * runtime-failing brain incident for that provider (rate-limited, no-op when
 * healthy) so the admin banner reflects recovery promptly.
 */
export async function noteBrainRequestSucceeded(provider?: string): Promise<void> {
  const suffix = provider ? `:${provider.toLowerCase()}` : null;
  for (const [key, state] of runtimeRecent) {
    if (!key.startsWith("ai-brain") || state.healthy) continue;
    if (suffix && !key.endsWith(suffix)) continue;
    await recordRuntimeIncident({
      key,
      serviceName: state.check.serviceName,
      healthy: true,
      severity: "warning",
      message: "Chat completion requests are succeeding again.",
    });
  }
}
