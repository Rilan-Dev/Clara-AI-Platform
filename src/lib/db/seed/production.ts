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
 *
 * NOT included (by design):
 *   • Demo organisations / fake analytics rows / sample billing data —
 *     production dashboards show real traffic only.
 *
 * Environment knobs:
 *   CLARA_ADMIN_EMAIL     (default admin@clara.ai)
 *   CLARA_ADMIN_PASSWORD  default Admin1234! — change immediately after install
 *   CLARA_ADMIN_NAME      (default Platform Admin)
 *   DEMO_CLARA_API_KEY    landing-page embed key (raw clr_… value)
 */

type Logger = Pick<typeof console, "log" | "warn" | "error">;

const IDS = {
  adminUserId:  "40000000-0000-0000-0000-000000000001",
  demoOrgId:    "10000000-0000-0000-0000-000000000001",
  demoAgentId:  "20000000-0000-0000-0000-000000000001",
  demoKbId:     "30000000-0000-0000-0000-000000000001",
  demoDocId:    "50000000-0000-0000-0000-000000000001",
  demoApiKeyId: "60000000-0000-0000-0000-000000000001",
} as const;

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
  ]) {
    const v = env[key]?.trim();
    if (v) values[key] = v;
  }
  // Non-secret env knobs win over the table above when present.
  for (const key of [
    "AI_PROVIDER", "PHONE_PROVIDER", "NEXT_PUBLIC_APP_URL",
    "OPENAI_CHAT_MODEL", "GEMINI_CHAT_MODEL",
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
    `INSERT INTO agents (id, org_id, name, description, status, assistant_name)
     VALUES ($1, $2, 'Clara Demo Assistant', 'Public landing-page demo assistant', 'published', 'Clara')
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
       (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
        voice_id, primary_colour, accent_colour, temperature, max_tokens,
        cite_sources, strict_mode)
     VALUES ($1, 'Clara',
       'You are Clara, the AI assistant for the Clara platform demo. Answer questions about insurance using only information from the knowledge base. Always cite your sources with [S1], [S2] notation. Be accurate, professional, and helpful.',
       'Hello! I am Clara. How can I help you today?',
       'I can only answer questions about the topics covered by this knowledge base.',
       'alloy', '#6366f1', '#a5b4fc', 0.7, 500, TRUE, TRUE)
     ON CONFLICT (kb_id) DO UPDATE SET
       assistant_name = EXCLUDED.assistant_name,
       system_prompt = EXCLUDED.system_prompt,
       welcome_message = EXCLUDED.welcome_message`,
    [IDS.demoKbId],
  );

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

export async function seedProductionData(options?: { logger?: Logger }) {
  const logger = options?.logger ?? console;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await seedPlatformAdmin(client, logger);
    await seedPlatformSettings(client, logger);
    await seedLandingDemo(client, logger);
    await client.query("COMMIT");
    logger.log("[seed:prod] production seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
