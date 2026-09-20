/**
 * src/modules/organisations/core/workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "Workspace wizard" — atomically provisions a complete tenant workspace:
 *   organisation → admin user → subscription (pinned plan version) →
 *   agent → knowledge base → API key → optional public-demo assignment.
 *
 * Used by the Platform Admin "New Workspace" wizard so admins no longer need
 * to click through 6 separate screens (and previously had no safe way to
 * generate a demo API key without a real workspace behind it).
 */

import { randomUUID, randomBytes, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { hashPassword } from "@/modules/auth/core/password";
import { getPlatformAssistantDefaults } from "@/modules/ai-core/assistant-defaults-db";

// ── Input / output types ───────────────────────────────────────────────────────

export type CreateWorkspaceInput = {
  orgName: string;
  orgSlug?: string;
  adminEmail: string;
  adminFullName: string;
  /** If omitted, a strong random password is generated and returned once. */
  adminPassword?: string;
  /** Defaults to "enterprise" — the wizard is intended for hand-provisioned, white-glove workspaces. */
  planId?: string;
  agentName?: string;
  agentDescription?: string;
  kbName?: string;
  kbDescription?: string;
  apiKeyName?: string;
  /** When true, points the platform's public landing-page demo at this workspace's KB + API key. */
  markAsDemo?: boolean;
  /** Platform admin user performing the action (used for audit columns). */
  createdBy: string;
};

export type CreateWorkspaceResult = {
  org: { id: string; name: string; slug: string };
  admin: { id: string; email: string; fullName: string; temporaryPassword: string | null };
  agent: { id: string; name: string };
  kb: { id: string; name: string; qdrantCollection: string };
  apiKey: { id: string; rawKey: string; keyPrefix: string; name: string };
  planId: string;
  markedAsDemo: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(value: string, maxLen = 60): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen) || "org";
}

function kbSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "kb";
}

function makeCollectionName(kbId: string, name: string): string {
  return `kb_${kbId.replace(/-/g, "").slice(0, 8)}_${kbSlug(name)}`;
}

function generatePassword(): string {
  // 16 random bytes → base64url gives a strong, URL-safe, easily-copyable password.
  return randomBytes(16).toString("base64url");
}

function generateRawApiKey(): string {
  return "clr_" + randomBytes(24).toString("hex");
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function uniqueSlug(client: PoolClient, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await client.query("SELECT id FROM organisations WHERE slug = $1", [candidate]);
    if (existing.rows.length === 0) return candidate;
    candidate = `${base}-${n++}`;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

export class WorkspaceValidationError extends Error {}

function validate(input: CreateWorkspaceInput): void {
  if (!input.orgName?.trim() || input.orgName.trim().length < 2)
    throw new WorkspaceValidationError("Organisation name must be at least 2 characters");
  if (!input.adminEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail.trim()))
    throw new WorkspaceValidationError("A valid admin email is required");
  if (!input.adminFullName?.trim() || input.adminFullName.trim().length < 2)
    throw new WorkspaceValidationError("Admin full name is required");
  if (input.adminPassword && input.adminPassword.length < 8)
    throw new WorkspaceValidationError("Admin password must be at least 8 characters");
}

// ── Core ──────────────────────────────────────────────────────────────────────

export async function createWorkspace(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
  validate(input);

  const planId = input.planId?.trim() || "enterprise";
  const generatedPassword = input.adminPassword?.trim() || generatePassword();
  const passwordHash = await hashPassword(generatedPassword);

  const result = await withTransaction(async (client) => {
    // ── Plan must exist ──────────────────────────────────────────────────────
    const planCheck = await client.query("SELECT id FROM subscription_plans WHERE id = $1", [planId]);
    if (planCheck.rows.length === 0)
      throw new WorkspaceValidationError(`Unknown subscription plan "${planId}"`);

    // ── Email must be free ───────────────────────────────────────────────────
    const emailCheck = await client.query("SELECT id FROM users WHERE email = $1", [
      input.adminEmail.toLowerCase().trim(),
    ]);
    if (emailCheck.rows.length > 0)
      throw new WorkspaceValidationError("An account with this email already exists");

    // ── 1. Organisation ──────────────────────────────────────────────────────
    const slugBase = slugify(input.orgSlug?.trim() || input.orgName);
    const slug = await uniqueSlug(client, slugBase);
    const orgRows = await client.query<Record<string, unknown>>(
      `INSERT INTO organisations (name, slug) VALUES ($1, $2) RETURNING *`,
      [input.orgName.trim(), slug],
    );
    const org = orgRows.rows[0]!;
    await client.query(`INSERT INTO org_ai_settings (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`, [org.id]);

    // ── 2. Admin user + membership ───────────────────────────────────────────
    const userRows = await client.query<Record<string, unknown>>(
      `INSERT INTO users (email, password_hash, full_name, status, email_verified)
       VALUES ($1, $2, $3, 'active', TRUE) RETURNING *`,
      [input.adminEmail.toLowerCase().trim(), passwordHash, input.adminFullName.trim()],
    );
    const userRow = userRows.rows[0]!;

    const roleRow = (await client.query("SELECT id FROM roles WHERE name = 'org_admin'")).rows[0];
    if (!roleRow) throw new Error("org_admin role not found — run migrations first");
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role_id, invited_by)
       VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, user_id) DO NOTHING`,
      [org.id, userRow.id, roleRow.id, input.createdBy],
    );

    // ── 3. Subscription — pin the current published plan version ────────────
    const planRows = await client.query<Record<string, unknown>>(
      `
      SELECT sp.id AS plan_id, pv.id AS plan_version_id, COALESCE(pv.version, 1) AS version,
             COALESCE(pv.name, sp.name) AS name, COALESCE(pv.description, sp.description) AS description,
             COALESCE(pv.price_usd, sp.price_usd) AS price_usd, COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
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
      WHERE sp.id = $1
      `,
      [planId],
    );
    const planData = planRows.rows[0]!;
    const snapshot = {
      planId,
      version: planData.version,
      name: planData.name,
      description: planData.description,
      priceUsd: planData.price_usd,
      maxKbs: planData.max_kbs,
      maxDocsPerKb: planData.max_docs_per_kb,
      maxReqDay: planData.max_req_day,
      maxStorageMb: planData.max_storage_mb,
      voiceEnabled: planData.voice_enabled,
      apiAccess: planData.api_access,
      customBranding: planData.custom_branding,
      ssoEnabled: planData.sso_enabled,
      analyticsLevel: planData.analytics_level,
      prioritySupport: planData.priority_support,
      features: planData.features,
    };
    await client.query(
      `
      INSERT INTO org_subscriptions (org_id, plan_id, plan_version_id, plan_snapshot, price_snapshot, status, admin_note)
      VALUES ($1, $2, $3, $4::jsonb, $5, 'active', $6)
      ON CONFLICT (org_id) DO UPDATE SET
        plan_id = $2, plan_version_id = $3, plan_snapshot = $4::jsonb, price_snapshot = $5,
        status = 'active', cancel_at_period_end = FALSE, paused_at = NULL,
        cancelled_at = NULL, admin_note = $6, updated_at = now()
      `,
      [org.id, planId, planData.plan_version_id ?? null, JSON.stringify(snapshot), planData.price_usd, "Created via workspace wizard"],
    );

    // ── 4. Agent (the former "project") ─────────────────────────────────────
    const agentName = input.agentName?.trim() || "Default Agent";
    const agentRows = await client.query<Record<string, unknown>>(
      `INSERT INTO agents (org_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [org.id, agentName, input.agentDescription?.trim() || null],
    );
    const agent = agentRows.rows[0]!;
    await client.query(
      `INSERT INTO agent_ai_settings (agent_id, org_id) VALUES ($1, $2) ON CONFLICT (agent_id) DO NOTHING`,
      [agent.id, org.id],
    );

    // ── 5. Knowledge base ───────────────────────────────────────────────────
    // KBs hold content only — the assistant config lives on the agent.
    const kbId = randomUUID();
    const kbName = input.kbName?.trim() || "Default Knowledge Base";
    const qdrantCollection = makeCollectionName(kbId, kbName);
    const kbRows = await client.query<Record<string, unknown>>(
      `INSERT INTO knowledge_bases (id, agent_id, name, description, qdrant_collection)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [kbId, agent.id, kbName, input.kbDescription?.trim() || null, qdrantCollection],
    );
    const kb = kbRows.rows[0]!;

    // Seed the AGENT's assistant config from the platform assistant defaults —
    // newly onboarding workspaces start with the platform default persona
    // (Identity / Behaviour / Language / Voice). The values are copied here,
    // so later platform default edits never rewrite this workspace.
    const defaults = await getPlatformAssistantDefaults();
    await client.query(
      `INSERT INTO assistant_configs (
         agent_id, assistant_name, avatar_url, system_prompt, welcome_message,
         out_of_scope_reply, rules, temperature, max_tokens, cite_sources, strict_mode,
         default_language, allowed_languages,
         always_respond_in, voice_id, speed, primary_colour, accent_colour, launcher_colour
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13::text[],$14,$15,$16,$17,$18,$19)`,
      [
        agent.id,
        defaults.assistantName,
        defaults.avatarUrl,
        defaults.systemPrompt,
        defaults.welcomeMessage,
        defaults.outOfScopeReply,
        JSON.stringify(defaults.rules),
        defaults.temperature,
        defaults.maxTokens,
        defaults.citeSources,
        defaults.strictMode,
        defaults.defaultLanguage,
        defaults.allowedLanguages,
        defaults.alwaysRespondIn,
        defaults.voiceId ?? "alloy",
        defaults.voiceSpeed ?? 1.0,
        defaults.primaryColour,
        defaults.accentColour,
        defaults.launcherColour ?? "#6366f1",
      ],
    );

    // ── 6. API key ────────────────────────────────────────────────────────────
    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 16);
    const apiKeyName = input.apiKeyName?.trim() || "Default";
    const apiKeyRows = await client.query<Record<string, unknown>>(
      `INSERT INTO api_keys (kb_id, org_id, name, key_prefix, key_hash, allowed_origins, rate_limit_per_hour, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [kbId, org.id, apiKeyName, keyPrefix, keyHash, [], 500, input.createdBy],
    );
    const apiKeyRow = apiKeyRows.rows[0]!;

    return { org, userRow, agent, kb, apiKeyRow, rawKey };
  });

  // ── Agent version-control bootstrap (migration Stage E/F) ──────────────────
  // Permanent Main branch + draft seeded from the current platform default
  // version, with the source default version recorded (best-effort, idempotent
  // and self-healing on first workspace visit).
  try {
    const { ensureAgentVersioning, recordDefaultAssistantProvenanceIfMissing } = await import(
      "@/modules/agent-versioning/core/service"
    );
    await ensureAgentVersioning(result.agent.id as string, input.createdBy);
    await recordDefaultAssistantProvenanceIfMissing(result.agent.id as string);
  } catch (versioningErr) {
    console.warn(
      `[workspace] version-control bootstrap deferred for agent ${result.agent.id}:`,
      (versioningErr as Error).message,
    );
  }

  // ── Optional: point the public landing-page demo at this new workspace ─────
  if (input.markAsDemo) {
    const { setPlatformEnvSetting } = await import("@/modules/phone/core/db");
    const { updateEmbedApiKey } = await import("@/modules/admin/core/embed-api-key-db");
    await setPlatformEnvSetting("DEMO_ORG_ID", result.org.id as string, input.createdBy);
    await setPlatformEnvSetting("DEMO_KB_ID", result.kb.id as string, input.createdBy);
    await setPlatformEnvSetting("DEMO_CLARA_API_KEY", result.rawKey, input.createdBy);
    await setPlatformEnvSetting("NEXT_PUBLIC_LANDING_EMBED_API_KEY", result.rawKey, input.createdBy);
    await updateEmbedApiKey(result.rawKey);
  }

  return {
    org: { id: result.org.id as string, name: result.org.name as string, slug: result.org.slug as string },
    admin: {
      id: result.userRow.id as string,
      email: result.userRow.email as string,
      fullName: result.userRow.full_name as string,
      temporaryPassword: input.adminPassword?.trim() ? null : generatedPassword,
    },
    agent: { id: result.agent.id as string, name: result.agent.name as string },
    kb: {
      id: result.kb.id as string,
      name: result.kb.name as string,
      qdrantCollection: result.kb.qdrant_collection as string,
    },
    apiKey: {
      id: result.apiKeyRow.id as string,
      rawKey: result.rawKey,
      keyPrefix: result.apiKeyRow.key_prefix as string,
      name: result.apiKeyRow.name as string,
    },
    planId,
    markedAsDemo: Boolean(input.markAsDemo),
  };
}
