import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@/lib/db";
import { hashPassword } from "@/modules/auth/core/password";

/**
 * Production seed — bootstrap data a real deployment needs to function.
 *
 * Included (all idempotent, safe to re-run):
 *   • Platform admin user (credentials from env, see below)
 *   • Runtime platform settings with the values this deployment actually uses
 *     (provider models, payment keys, landing embed key)
 *   • The public landing-page demo: one org → agent → KB (backed by the real
 *     Qdrant collection) → embed API key, so the marketing demo works from
 *     minute one and every visitor interaction is recorded as REAL usage.
 *   • The demo org's own login — an org admin user (credentials from env, see
 *     below) linked to the Clara demo organisation, so the demo org can be
 *     signed into and used to set up / showcase the product.
 *   • An active Enterprise subscription for the demo org (manual gateway,
 *     version-pinned, 10-year term) so every plan-gated feature is unlocked
 *     for demos without fake payment data.
 *
 * NOT included (by design):
 *   • Other demo organisations / fake analytics rows / sample billing data —
 *     production dashboards show real traffic only.
 *
 * Environment knobs:
 *   CLARA_ADMIN_EMAIL     (default admin@clara.ai)
 *   CLARA_ADMIN_PASSWORD  default Admin1234! — change immediately after install
 *   CLARA_ADMIN_NAME      (default Platform Admin)
 *   CLARA_DEMO_USER_EMAIL     (default demo@clara.ai)
 *   CLARA_DEMO_USER_PASSWORD  default Demo1234! — org admin of the demo org
 *   DEMO_CLARA_API_KEY    landing-page embed key (raw clr_… value)
 */

type Logger = Pick<typeof console, "log" | "warn" | "error">;

const IDS = {
  adminUserId:  "40000000-0000-0000-0000-000000000001",
  // Distinct from the dev-seed user ids (…0002/…0003) so running the
  // development seed later can never hijack this row via id conflict.
  demoUserId:   "40000000-0de0-0000-0000-000000000001",
  demoOrgId:    "10000000-0000-0000-0000-000000000001",
  demoAgentId:  "20000000-0000-0000-0000-000000000001",
  demoKbId:     "30000000-0000-0000-0000-000000000001",
  demoDocId:    "50000000-0000-0000-0000-000000000001",
  demoApiKeyId: "60000000-0000-0000-0000-000000000001",
} as const;

/** The demo org's Enterprise term in years — long enough to never lapse mid-demo. */
const DEMO_SUB_YEARS = 10;

/** The landing demo's Qdrant collection — vectors survive a Postgres reset. */
const DEMO_QDRANT_COLLECTION = "omen_life_health";

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Values this deployment actually runs with; env always wins. */
function productionSettingValues(): Record<string, string> {
  const env = process.env;
  const values: Record<string, string> = {
    AI_PROVIDER: "openai",
    OPENAI_CHAT_MODEL: "gpt-5.6-terra",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    OPENAI_REALTIME_MODEL: "gpt-realtime-2.1-mini",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-realtime-whisper",
    OPENAI_DEFAULT_VOICE: "alloy",
    GEMINI_CHAT_MODEL: "gemini-2.5-flash",
    GEMINI_EMBEDDING_MODEL: "text-embedding-004",
    GEMINI_REALTIME_MODEL: "gemini-2.5-flash-preview-tts",
    GEMINI_TRANSCRIPTION_MODEL: "gemini-2.5-flash",
    GEMINI_DEFAULT_VOICE: "Puck",
    AI_MAX_CHAT_TOKENS: "4000",
    AI_MAX_REALTIME_TOKENS: "1000",
    AI_MAX_TEMPERATURE: "1.0",
    PHONE_PROVIDER: "twilio",
    NEXT_PUBLIC_APP_URL: "https://clara.ai.amazetechclans.com",
    // Email delivery defaults (secrets pulled from env below).
    EMAIL_PROVIDER: "resend",
    EMAIL_FROM_NAME: "Clara AI",
  };
  // Real secrets/keys come from env only — never hardcoded as defaults.
  for (const key of [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO",
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    "OPENAI_API_KEY", "GEMINI_API_KEY",
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
    "VONAGE_API_KEY", "VONAGE_API_SECRET", "VONAGE_PHONE_NUMBER",
    // Email delivery (Resend / SMTP)
    "RESEND_API_KEY",
    "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_ADDRESS",
  ]) {
    const v = env[key]?.trim();
    if (v) values[key] = v;
  }
  // Non-secret env knobs win over the table above when present.
  for (const key of [
    "AI_PROVIDER", "PHONE_PROVIDER", "NEXT_PUBLIC_APP_URL",
    "OPENAI_CHAT_MODEL", "GEMINI_CHAT_MODEL",
    "EMAIL_PROVIDER", "EMAIL_FROM_NAME", "EMAIL_FROM_ADDRESS",
  ]) {
    const v = env[key]?.trim();
    if (v) values[key] = v;
  }
  return values;
}

async function seedPlatformAdmin(client: PoolClient, logger: Logger) {
  const email = (process.env.CLARA_ADMIN_EMAIL ?? "admin@clara.ai").toLowerCase().trim();
  const password = process.env.CLARA_ADMIN_PASSWORD ?? "Admin1234!";
  const fullName = process.env.CLARA_ADMIN_NAME ?? "Platform Admin";

  const hash = await hashPassword(password);
  await client.query(
    `INSERT INTO users (id, email, password_hash, full_name, is_super_admin, email_verified, status)
     VALUES ($1, $2, $3, $4, TRUE, TRUE, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       is_super_admin = TRUE,
       email_verified = TRUE,
       status = 'active'`,
    [IDS.adminUserId, email, hash, fullName],
  );
  logger.log(`[seed:prod] platform admin ready → ${email}`);
}

async function seedPlatformSettings(client: PoolClient, logger: Logger) {
  const values = productionSettingValues();

  // The landing embed key: env (DEMO_CLARA_API_KEY / NEXT_PUBLIC_LANDING_EMBED_API_KEY)
  const landingKey =
    process.env.DEMO_CLARA_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() ||
    "";
  if (landingKey) {
    values.DEMO_CLARA_API_KEY = landingKey;
    values.NEXT_PUBLIC_LANDING_EMBED_API_KEY = landingKey;
  }

  const entries = Object.entries(values);
  for (const [key, value] of entries) {
    await client.query(
      `INSERT INTO platform_env_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    );
  }
  logger.log(`[seed:prod] applied ${entries.length} platform settings values`);
}

async function seedLandingDemo(client: PoolClient, logger: Logger) {
  const rawKey = process.env.DEMO_CLARA_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() ||
    "";
  if (!rawKey) {
    logger.warn("[seed:prod] no DEMO_CLARA_API_KEY set — landing demo not seeded");
    return;
  }

  // If a different KB already owns the demo Qdrant collection, do not steal it
  // (e.g. a legacy deployment where the old demo KB still exists).
  const owner = await client.query<{ id: string }>(
    `SELECT id FROM knowledge_bases WHERE qdrant_collection = $1 LIMIT 1`,
    [DEMO_QDRANT_COLLECTION],
  );
  const existingOwner = owner.rows[0]?.id;
  if (existingOwner && existingOwner !== IDS.demoKbId) {
    logger.warn(
      `[seed:prod] qdrant collection ${DEMO_QDRANT_COLLECTION} is owned by KB ${existingOwner} — skipping landing demo seed`,
    );
    return;
  }

  await client.query(
    `INSERT INTO organisations (id, name, slug, logo_url)
     VALUES ($1, 'Clara', 'clara-demo', NULL)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [IDS.demoOrgId],
  );

  await client.query(
    `INSERT INTO agents (id, org_id, name, description, status)
     VALUES ($1, $2, 'Clara Demo Assistant', 'Public landing-page demo assistant', 'published')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, status = 'published'`,
    [IDS.demoAgentId, IDS.demoOrgId],
  );

  await client.query(
    `INSERT INTO knowledge_bases (id, agent_id, name, description, qdrant_collection, status)
     VALUES ($1, $2, 'Insurance FAQs', 'Public demo knowledge base (landing page)',
             $3, 'active')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       qdrant_collection = EXCLUDED.qdrant_collection, status = 'active'`,
    [IDS.demoKbId, IDS.demoAgentId, DEMO_QDRANT_COLLECTION],
  );

  // The document row mirrors the chunks already indexed in the Qdrant collection.
  await client.query(
    `INSERT INTO documents (id, kb_id, title, original_filename, source_type, mime_type,
                            file_size, chunk_count, status, uploaded_by)
     VALUES ($1, $2, 'FAQs (All)', 'faqs-all.pdf', 'upload', 'application/pdf',
             0, 71, 'ready', $3)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, chunk_count = EXCLUDED.chunk_count, status = 'ready'`,
    [IDS.demoDocId, IDS.demoKbId, IDS.adminUserId],
  );

  await client.query(
    `INSERT INTO assistant_configs
       (agent_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
        voice_id, primary_colour, accent_colour, temperature, max_tokens,
        cite_sources, strict_mode)
     VALUES ($1, 'Clara',
       'You are Clara, the AI assistant for the Clara platform demo. Answer questions about insurance using only information from the knowledge base. Always cite your sources with [S1], [S2] notation. Be accurate, professional, and helpful.',
       'Hello! I am Clara. How can I help you today?',
       'I can only answer questions about the topics covered by this knowledge base.',
       'alloy', '#6366f1', '#a5b4fc', 0.7, 500, TRUE, TRUE)
     ON CONFLICT (agent_id) DO UPDATE SET
       assistant_name = EXCLUDED.assistant_name,
       system_prompt = EXCLUDED.system_prompt,
       welcome_message = EXCLUDED.welcome_message`,
    [IDS.demoAgentId],
  );
``
  // Embed API key — the raw key comes from env; only the hash is stored.
  await client.query(
    `INSERT INTO api_keys (id, kb_id, org_id, name, key_prefix, key_hash, is_active)
     VALUES ($1, $2, $3, 'Landing Demo', $4, $5, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       kb_id = EXCLUDED.kb_id, org_id = EXCLUDED.org_id,
       key_prefix = EXCLUDED.key_prefix, key_hash = EXCLUDED.key_hash, is_active = TRUE`,
    [IDS.demoApiKeyId, IDS.demoKbId, IDS.demoOrgId, rawKey.slice(0, 16), hashKey(rawKey)],
  );

  await client.query(
    `INSERT INTO embed_api_key (key)
     VALUES ($1)
     ON CONFLICT (key) DO NOTHING`,
    [rawKey],
  );

  logger.log(`[seed:prod] landing demo ready → org=Clara kb=Insurance FAQs key=${rawKey.slice(0, 12)}…`);
}

/**
 * The demo org's login + Enterprise subscription.
 *
 * Creates an org-admin user for the Clara demo organisation (env-configurable
 * credentials) and grants the org an active Enterprise subscription pinned to
 * the currently published plan version (same snapshot pattern as the signup
 * flow). A subscription-audit entry is written only when the plan actually
 * changes, so re-seeding never duplicates history.
 */
async function seedDemoOrgAccess(client: PoolClient, logger: Logger) {
  const email = (process.env.CLARA_DEMO_USER_EMAIL ?? "demo@clara.ai").toLowerCase().trim();
  const password = process.env.CLARA_DEMO_USER_PASSWORD ?? "Demo1234!";
  const fullName = "Clara Demo User";

  // The org row (same values as the landing demo — upserted here too so the
  // login exists even when the embed key is absent and the landing demo is
  // skipped).
  await client.query(
    `INSERT INTO organisations (id, name, slug, logo_url)
     VALUES ($1, 'Clara', 'clara-demo', NULL)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [IDS.demoOrgId],
  );

  const hash = await hashPassword(password);
  await client.query(
    `INSERT INTO users (id, email, password_hash, full_name, is_super_admin, email_verified, status)
     VALUES ($1, $2, $3, $4, FALSE, TRUE, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       is_super_admin = FALSE,
       email_verified = TRUE,
       status = 'active'`,
    [IDS.demoUserId, email, hash, fullName],
  );

  const roleRow = await client.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'org_admin' LIMIT 1`,
  );
  const orgAdminRoleId = roleRow.rows[0]?.id;
  if (!orgAdminRoleId) throw new Error("[seed:prod] org_admin role missing — run migrations first");
  await client.query(
    `INSERT INTO org_members (org_id, user_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [IDS.demoOrgId, IDS.demoUserId, orgAdminRoleId],
  );

  // Pin to the latest published Enterprise plan version (signup-flow pattern).
  const planRow = await client.query<Record<string, unknown>>(
    `SELECT sp.id AS plan_id, COALESCE(pv.id, NULL) AS plan_version_id,
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
     WHERE sp.id = 'enterprise'
     LIMIT 1`,
  );
  const plan = planRow.rows[0];
  if (!plan) throw new Error("[seed:prod] enterprise plan missing — run migrations first");

  const snapshot = {
    planId: "enterprise",
    version: plan.version,
    name: plan.name,
    description: plan.description,
    priceUsd: plan.price_usd,
    maxKbs: plan.max_kbs,
    maxDocsPerKb: plan.max_docs_per_kb,
    maxReqDay: plan.max_req_day,
    maxStorageMb: plan.max_storage_mb,
    voiceEnabled: plan.voice_enabled,
    apiAccess: plan.api_access,
    customBranding: plan.custom_branding,
    ssoEnabled: plan.sso_enabled,
    analyticsLevel: plan.analytics_level,
    prioritySupport: plan.priority_support,
    features: plan.features,
  };
  const adminNote = "Production demo base — Enterprise granted by seed";

  const existing = await client.query<{ plan_id: string }>(
    `SELECT plan_id FROM org_subscriptions WHERE org_id = $1 LIMIT 1`,
    [IDS.demoOrgId],
  );
  const oldPlanId = existing.rows[0]?.plan_id;

  await client.query(
    `INSERT INTO org_subscriptions
       (org_id, plan_id, plan_version_id, plan_snapshot, price_snapshot, status,
        current_period_start, current_period_end, gateway, admin_note)
     VALUES ($1, 'enterprise', $2, $3::jsonb, $4, 'active',
             now(), now() + ($5::int * INTERVAL '1 year'), 'manual', $6)
     ON CONFLICT (org_id) DO UPDATE SET
       plan_id = 'enterprise', plan_version_id = EXCLUDED.plan_version_id,
       plan_snapshot = EXCLUDED.plan_snapshot, price_snapshot = EXCLUDED.price_snapshot,
       status = 'active', cancel_at_period_end = FALSE, paused_at = NULL,
       cancelled_at = NULL, gateway = 'manual',
       current_period_end = now() + ($5::int * INTERVAL '1 year'),
       admin_note = EXCLUDED.admin_note, updated_at = now()`,
    [
      IDS.demoOrgId,
      plan.plan_version_id ?? null,
      JSON.stringify(snapshot),
      Number(plan.price_usd),
      DEMO_SUB_YEARS,
      adminNote,
    ],
  );

  // Audit only on an actual plan change — keeps re-runs idempotent.
  if (oldPlanId !== "enterprise") {
    await client.query(
      `INSERT INTO subscription_audit_log
         (org_id, actor_label, action, old_plan_id, new_plan_id, new_status, note)
       VALUES ($1, 'system', 'plan_changed', $2, 'enterprise', 'active', $3)`,
      [IDS.demoOrgId, oldPlanId ?? null, adminNote],
    );
  }

  logger.log(
    `[seed:prod] demo org access ready → login=${email} org=Clara plan=Enterprise (manual, ${DEMO_SUB_YEARS} years)`,
  );
}

export async function seedProductionData(options?: { logger?: Logger }) {
  const logger = options?.logger ?? console;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await seedPlatformAdmin(client, logger);
    await seedPlatformSettings(client, logger);
    await seedLandingDemo(client, logger);
    await seedDemoOrgAccess(client, logger);
    await client.query("COMMIT");
    logger.log("[seed:prod] production seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
