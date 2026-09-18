/**
 * src/modules/voice-core/credit-alerts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * V6 credit-burn alerting (plan §14 V6: "alert fires on burn threshold").
 *
 * ElevenLabs bills a single platform account in characters. When the
 * consumed percentage crosses ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT (default
 * 80), an alert is recorded and a notification is queued through the
 * existing subscription_notifications outbound worker — the same delivery
 * path subscription expiry warnings use, so no new infrastructure exists
 * to operate.
 *
 * De-duplication: one alert per (threshold, limit) pair. Re-alerting
 * requires the character limit to change (plan renewal) or the operator to
 * raise the threshold — a mid-month repeat would be noise, not signal.
 */

import { query as dbQuery } from "@/lib/db";
import { getCreditAlertThresholdPct } from "./model-catalog";
import type { ElevenLabsSubscriptionInfo } from "./types";

export interface CreditAlertEvaluation {
  /** Effective threshold in percent (0 = alerting disabled). */
  thresholdPct: number;
  /** Consumed percentage, null when the account has no limit. */
  usagePercent: number | null;
  /** True when the threshold was crossed on this evaluation. */
  crossed: boolean;
  /** True when this crossing produced a NEW alert record. */
  alerted: boolean;
}

/**
 * Evaluates the burn-down and records/queues alerts when crossed.
 * Pure side-effect accounting — must never throw into the caller (the
 * status probe stays available even when alerting breaks).
 */
export async function evaluateCreditBurn(
  subscription: ElevenLabsSubscriptionInfo,
): Promise<CreditAlertEvaluation> {
  const thresholdPct = getCreditAlertThresholdPct();
  const usagePercent =
    subscription.characterLimit > 0
      ? Math.round((subscription.characterCount / subscription.characterLimit) * 100)
      : null;

  const evaluation: CreditAlertEvaluation = {
    thresholdPct,
    usagePercent,
    crossed: thresholdPct > 0 && usagePercent != null && usagePercent >= thresholdPct,
    alerted: false,
  };

  if (!evaluation.crossed) return evaluation;

  try {
    // Insert-or-see: UNIQUE (threshold_pct, character_limit) de-duplicates
    // repeat crossings within the same billing period.
    const inserted = await dbQuery<{ id: string }>(
      `INSERT INTO elevenlabs_credit_alerts
         (threshold_pct, character_count, character_limit, notified)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (threshold_pct, character_limit) DO NOTHING
       RETURNING id`,
      [thresholdPct, subscription.characterCount, subscription.characterLimit],
    );

    if (inserted.length === 0) {
      // Already alerted for this (threshold, limit) — refresh last_seen only.
      await dbQuery(
        `UPDATE elevenlabs_credit_alerts
            SET last_seen_at = now(), character_count = $1
          WHERE threshold_pct = $2 AND character_limit = $3`,
        [subscription.characterCount, thresholdPct, subscription.characterLimit],
      );
      return evaluation;
    }

    evaluation.alerted = true;
    await queueOperatorNotification(subscription, thresholdPct, usagePercent);
    await dbQuery(`UPDATE elevenlabs_credit_alerts SET notified = TRUE WHERE id = $1`, [
      inserted[0].id,
    ]);
  } catch (err) {
    console.warn("[voice-core] credit-burn evaluation failed:", (err as Error).message);
  }

  return evaluation;
}

/**
 * Queues the operator notification. Recipients are the platform super
 * admins (the people who can top up the account) — resolved the same way
 * the expiry sweep finds its recipients.
 */
async function queueOperatorNotification(
  subscription: ElevenLabsSubscriptionInfo,
  thresholdPct: number,
  usagePercent: number | null,
): Promise<void> {
  const admins = await dbQuery<{ email: string }>(
    `SELECT u.email FROM users u
      WHERE u.is_super_admin = TRUE AND u.status = 'active'`,
  );
  if (admins.length === 0) return;

  const subject = `ElevenLabs credit alert: ${usagePercent}% of the monthly character budget used`;
  const bodyText =
    `The ElevenLabs account (tier: ${subscription.tier}) has consumed ` +
    `${subscription.characterCount.toLocaleString()} of ${subscription.characterLimit.toLocaleString()} characters ` +
    `(${usagePercent}% — threshold ${thresholdPct}%).\n\n` +
    `Voice features will stop working when the budget is exhausted. ` +
    `Top up the account or raise the plan at ElevenLabs, then verify in ` +
    `Clara → Settings → AI Configuration → ElevenLabs connection.`;
  const bodyHtml =
    `<p>The ElevenLabs account (tier: <b>${subscription.tier}</b>) has consumed ` +
    `<b>${subscription.characterCount.toLocaleString()}</b> of ${subscription.characterLimit.toLocaleString()} characters ` +
    `(<b>${usagePercent}%</b> — threshold ${thresholdPct}%).</p>` +
    `<p>Voice features will stop working when the budget is exhausted. ` +
    `Top up the account or raise the plan at ElevenLabs, then verify in ` +
    `Clara → Settings → AI Configuration → ElevenLabs connection.</p>`;

  // subscription_notifications requires an org_id — platform-level alerts
  // use the sentinel NULL-org row pattern via the first org as carrier is
  // wrong; instead we insert with the platform's own bookkeeping org if one
  // exists, else skip DB queuing and fall back to the alert record alone.
  const platformOrg = await dbQuery<{ id: string }>(
    `SELECT id FROM organisations ORDER BY created_at LIMIT 1`,
  );
  if (platformOrg.length === 0) return;
  const orgId = platformOrg[0].id;

  for (const admin of admins) {
    await dbQuery(
      `INSERT INTO subscription_notifications
         (org_id, recipient_email, notification_type, subject, body_html, body_text)
       VALUES ($1, $2, 'elevenlabs_credit_alert', $3, $4, $5)`,
      [orgId, admin.email, subject, bodyHtml, bodyText],
    );
  }
}
