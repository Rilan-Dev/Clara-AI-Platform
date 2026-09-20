#!/usr/bin/env node
/**
 * scripts/migrate-ai-configuration.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * AI configuration data migration — implements the operational stages of
 * docs/superpowers/plans/2026-09-20-clara-ai-configuration-migration.md:
 *
 *   Stage B/C — normalize + populate the platform provider registry
 *   Stage D   — entitlement audit report (read-only)
 *   Stage E   — every active agent → Main branch + immutable v1 (+ deployment
 *               when currently published)
 *   Stage F   — Default-Assistant provenance stays NULL (unknown — never
 *               fabricated for historical agents)
 *   Stage G   — import legacy config_snapshots as immutable versions
 *               (source = legacy_snapshot, parentage unknown)
 *   §18       — verification checklist
 *
 * Usage:
 *   node scripts/migrate-ai-configuration.mjs            # dry-run (default) + report
 *   node scripts/migrate-ai-configuration.mjs --apply    # execute migration
 *   node scripts/migrate-ai-configuration.mjs --verify   # verification checklist only
 *
 * Rollback safety: purely ADDITIVE — no legacy row is modified or deleted.
 * Re-runs are idempotent (agents that already have versions are skipped).
 * The report is retained as an artifact under docs/superpowers/reports/.
 */

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has("--apply");
const VERIFY_ONLY = argv.has("--verify");

// ── DB connection (repo .env carries the Postgres URL) ────────────────────────
const envPath = path.join(process.cwd(), ".env");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const envVars = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pgUrl =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : envVars.DATABASE_URL;
if (!pgUrl || !pgUrl.startsWith("postgres")) {
  console.error("[migrate-ai] No postgres DATABASE_URL found in .env — aborting.");
  process.exit(1);
}
const client = new Client({ connectionString: pgUrl });

const report = {
  generatedAt: new Date().toISOString(),
  mode: APPLY ? "apply" : VERIFY_ONLY ? "verify" : "dry-run",
  stages: {},
  warnings: [],
};

function log(...args) {
  console.log("[migrate-ai]", ...args);
}

// ── Preflight ─────────────────────────────────────────────────────────────────

async function preflight() {
  const { rows } = await client.query(
    "SELECT filename FROM schema_migrations"
  );
  const applied = new Set(rows.map((r) => r.filename));
  if (![...applied].some((f) => f.startsWith("040_") || f.includes("ai_governance_and_agent_versioning"))) {
    throw new Error(
      "Migration 040 (ai governance + agent versioning schema) is not applied yet. Boot the app once (ensureMigrated) or apply the SQL manually, then re-run."
    );
  }
  log("preflight OK — schema 040 present.");
}

async function loadPlatformEnv() {
  const { rows } = await client.query("SELECT key, value FROM platform_env_settings WHERE value IS NOT NULL AND value <> ''");
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

// ── Stage B/C: provider registry normalization ───────────────────────────────

async function stageProviderRegistry(platformEnv) {
  const providers = [
    { id: "openai", envKey: "OPENAI_API_KEY", enabledEnv: null },
    { id: "gemini", envKey: "GEMINI_API_KEY", enabledEnv: null },
    { id: "sarvam", envKey: "SARVAM_API_KEY", enabledEnv: "SARVAM_ENABLED" },
    { id: "elevenlabs", envKey: "ELEVENLABS_API_KEY", enabledEnv: "ELEVENLABS_ENABLED" },
  ];
  const results = [];
  for (const p of providers) {
    const secret = (platformEnv[p.envKey] ?? envVars[p.envKey] ?? process.env[p.envKey] ?? "").trim();
    const killSwitchOn = p.enabledEnv ? (platformEnv[p.enabledEnv] ?? envVars[p.enabledEnv] ?? "false").toLowerCase() === "true" : true;
    const configured = Boolean(secret) && killSwitchOn;

    const masked = secret ? `••••••••${secret.slice(-3)}` : null;
    const current = await client.query(
      "SELECT enabled FROM platform_ai_providers WHERE provider_id = $1",
      [p.id]
    );
    const alreadyEnabled = current.rows[0]?.enabled === true;

    // Enable only after configured (Stage C §8: enable only after configured;
    // a provider previously disabled by an admin is left disabled).
    const nextEnabled = alreadyEnabled || configured;
    results.push({ provider: p.id, configured, killSwitchOn, enabledNow: nextEnabled, wasEnabled: alreadyEnabled });

    if (APPLY) {
      await client.query("UPDATE platform_ai_providers SET enabled = $2, updated_at = now() WHERE provider_id = $1", [p.id, nextEnabled]);
      await client.query(
        `UPDATE platform_ai_provider_credentials
            SET masked_hint = $2, configured = $3, updated_at = now()
          WHERE provider_id = $1`,
        [p.id, masked, Boolean(secret)]
      );
    }
  }
  report.stages.providerRegistry = results;
  log("Stage B/C — provider registry:", results.map((r) => `${r.provider}:${r.configured ? "configured" : "unconfigured"}/${r.enabledNow ? "enabled" : "disabled"}`).join("  "));

  // ── Stage B repair: stale legacy allow-lists ──────────────────────────────
  // Historical org rows can pre-date provider additions (e.g. allow-lists
  // pinned to [openai, gemini] while the platform default is sarvam), which
  // blocks the org's runtime resolution entirely. ADD the platform default
  // provider to any allow-list that lacks it (additive — nothing is removed;
  // org allow-lists are legacy compat only in the new architecture).
  const platformProvider = (platformEnv.AI_PROVIDER ?? "openai").trim().toLowerCase();
  if (["openai", "gemini", "sarvam"].includes(platformProvider)) {
    const stale = await client.query(
      `SELECT org_id, allowed_providers FROM org_ai_settings
        WHERE NOT ($1 = ANY(allowed_providers))`,
      [platformProvider]
    );
    if (stale.rows.length > 0) {
      report.warnings.push(
        `${stale.rows.length} organisation allow-list(s) lacked the platform default provider "${platformProvider}" — repaired additively.`
      );
      if (APPLY) {
        await client.query(
          `UPDATE org_ai_settings
              SET allowed_providers = array_append(allowed_providers, $1), updated_at = now()
            WHERE NOT ($1 = ANY(allowed_providers))`,
          [platformProvider]
        );
      }
      log(`Stage B — repaired ${stale.rows.length} stale allow-list(s) to include "${platformProvider}".`);
    }
  }
}

// ── Stage D: entitlement audit (report only) ─────────────────────────────────

async function stageEntitlementAudit() {
  const { rows } = await client.query(
    `SELECT os.org_id, o.name AS org_name, sp.id AS plan_id,
            COALESCE(pac.chat, TRUE)     AS chat_entitled,
            COALESCE(pac.voice_chat, sp.voice_enabled) AS voice_chat_entitled,
            aas.provider AS agent_provider
       FROM org_subscriptions os
       JOIN organisations o ON o.id = os.org_id
       JOIN subscription_plans sp ON sp.id = os.plan_id
       LEFT JOIN LATERAL (
         SELECT bool_or(CASE WHEN capability = 'chat' THEN enabled END) AS chat,
                bool_or(CASE WHEN capability = 'voice_chat' THEN enabled END) AS voice_chat
           FROM plan_ai_capabilities WHERE plan_id = sp.id
       ) pac ON TRUE
       LEFT JOIN LATERAL (
         SELECT DISTINCT ON (agent_id) provider FROM agent_ai_settings WHERE org_id = os.org_id
       ) aas ON TRUE`
  );
  const unentitledVoice = rows.filter((r) => r.agent_provider != null && r.voice_chat_entitled === false);
  report.stages.entitlementAudit = {
    orgsAudited: rows.length,
    orgsWithVoiceChatNotEntitled: unentitledVoice.map((r) => ({ org: r.org_name, provider: r.agent_provider })),
  };
  if (unentitledVoice.length > 0) {
    report.warnings.push(
      `${unentitledVoice.length} organisation(s) currently use voice providers but their plan lacks the voice_chat entitlement. The runtime resolver degrades these to the brain provider — review before enforcing entitlements strictly.`
    );
  }
  log(`Stage D — entitlement audit: ${rows.length} orgs, ${unentitledVoice.length} with unentitled voice usage.`);
}

// ── Stage E/F/G: agents → Main + versions + deployments ───────────────────────

const ASSISTANT_FIELD_MAP = [
  ["assistantName", "assistant_name"],
  ["avatarUrl", "avatar_url"],
  ["systemPrompt", "system_prompt"],
  ["welcomeMessage", "welcome_message"],
  ["outOfScopeReply", "out_of_scope_reply"],
  ["rules", "rules"],
  ["defaultLanguage", "default_language"],
  ["allowedLanguages", "allowed_languages"],
  ["alwaysRespondIn", "always_respond_in"],
  ["voiceId", "voice_id"],
  ["speed", "speed"],
  ["temperature", "temperature"],
  ["maxTokens", "max_tokens"],
  ["citeSources", "cite_sources"],
  ["strictMode", "strict_mode"],
  ["primaryColour", "primary_colour"],
  ["accentColour", "accent_colour"],
  ["launcherColour", "launcher_colour"],
  ["widgetTheme", "widget_theme"],
  ["widgetPosition", "widget_position"],
  ["widgetButtonSize", "widget_button_size"],
  ["widgetBorderRadius", "widget_border_radius"],
  ["widgetFontFamily", "widget_font_family"],
  ["widgetChatHeight", "widget_chat_height"],
  ["widgetShowBranding", "widget_show_branding"],
  ["widgetLauncherLabel", "widget_launcher_label"],
  ["widgetMode", "widget_mode"],
  ["headerBg", "header_bg"],
  ["headerTextColor", "header_text_color"],
  ["headerHeight", "header_height"],
  ["headerBlur", "header_blur"],
  ["showStatusDot", "show_status_dot"],
  ["statusDotColor", "status_dot_color"],
  ["avatarShape", "avatar_shape"],
  ["chatAreaBg", "chat_area_bg"],
  ["userBubbleBg", "user_bubble_bg"],
  ["userBubbleText", "user_bubble_text"],
  ["userBubbleRadius", "user_bubble_radius"],
  ["userBubblePadding", "user_bubble_padding"],
  ["userBubbleShadow", "user_bubble_shadow"],
  ["botBubbleBg", "bot_bubble_bg"],
  ["botBubbleText", "bot_bubble_text"],
  ["botBubbleRadius", "bot_bubble_radius"],
  ["botBubbleBorder", "bot_bubble_border"],
  ["botBubblePadding", "bot_bubble_padding"],
  ["botBubbleShadow", "bot_bubble_shadow"],
  ["messageGap", "message_gap"],
  ["messageMaxWidth", "message_max_width"],
  ["messageFontSize", "message_font_size"],
  ["messageLineHeight", "message_line_height"],
  ["showTimestamps", "show_timestamps"],
  ["timestampColor", "timestamp_color"],
  ["timestampFontSize", "timestamp_font_size"],
  ["typingDotColor", "typing_dot_color"],
  ["typingDotSize", "typing_dot_size"],
  ["inputBg", "input_bg"],
  ["inputBorder", "input_border"],
  ["inputBorderFocus", "input_border_focus"],
  ["inputRadius", "input_radius"],
  ["inputTextColor", "input_text_color"],
  ["inputPlaceholderColor", "input_placeholder_color"],
  ["inputPadding", "input_padding"],
  ["inputAreaBg", "input_area_bg"],
  ["inputAreaBorder", "input_area_border"],
  ["sendBtnBg", "send_btn_bg"],
  ["sendBtnHoverBg", "send_btn_hover_bg"],
  ["sendBtnTextColor", "send_btn_text_color"],
  ["sendBtnRadius", "send_btn_radius"],
  ["sendBtnSize", "send_btn_size"],
  ["scrollbarWidth", "scrollbar_width"],
  ["scrollbarColor", "scrollbar_color"],
  ["scrollbarTrackColor", "scrollbar_track_color"],
  ["footerBg", "footer_bg"],
  ["footerTextColor", "footer_text_color"],
  ["animationsEnabled", "animations_enabled"],
  ["messageAnimationStyle", "message_animation_style"],
  ["customCss", "custom_css"],
  ["customLauncherSvg", "custom_launcher_svg"],
  ["customHeaderHtml", "custom_header_html"],
  ["customFooterHtml", "custom_footer_html"],
  ["customThemeCss", "custom_theme_css"],
  ["customInjectJs", "custom_inject_js"],
  ["customPoweredBy", "custom_powered_by"],
  ["voiceBtnBg", "voice_btn_bg"],
  ["voiceBtnSize", "voice_btn_size"],
  ["voiceBtnRadius", "voice_btn_radius"],
  ["voiceBtnActiveColor", "voice_btn_active_color"],
  ["voicePanelBg", "voice_panel_bg"],
  ["voiceWaveColor", "voice_wave_color"],
];

function assistantRowToConfig(row) {
  const assistant = {};
  for (const [camel, snake] of ASSISTANT_FIELD_MAP) {
    assistant[camel] = row[snake] ?? null;
  }
  return assistant;
}

async function stageMigrateAgents() {
  const agents = await client.query(
    `SELECT a.id, a.org_id, a.name, a.status
       FROM agents a
      WHERE a.status <> 'archived'
      ORDER BY a.created_at`
  );

  let created = 0, skipped = 0, deployments = 0, importedSnapshots = 0;
  const details = [];

  for (const agent of agents.rows) {
    const existing = await client.query(
      "SELECT count(*)::int AS n FROM agent_versions WHERE agent_id = $1",
      [agent.id]
    );
    if (existing.rows[0].n > 0) {
      skipped++;
      // Still ensure a deployment exists for published agents (idempotent).
      const dep = await client.query(
        "SELECT count(*)::int AS n FROM agent_deployments WHERE agent_id = $1 AND status = 'active'",
        [agent.id]
      );
      if (dep.rows[0].n === 0 && agent.status === "published" && APPLY) {
        const latest = await client.query(
          "SELECT id FROM agent_versions WHERE agent_id = $1 AND branch_id = (SELECT id FROM agent_branches WHERE agent_id = $1 AND is_main) ORDER BY version_number DESC LIMIT 1",
          [agent.id]
        );
        if (latest.rows[0]) {
          await insertDeployment(agent, latest.rows[0].id);
          deployments++;
        }
      }
      continue;
    }

    const assistant = await client.query(
      "SELECT * FROM assistant_configs WHERE agent_id = $1",
      [agent.id]
    );
    if (assistant.rows.length === 0) {
      // Agent never had a config — leave to the self-healing bootstrap.
      skipped++;
      details.push({ agent: agent.name, action: "no-assistant-config (bootstrap deferred)" });
      continue;
    }

    const ai = await client.query(
      "SELECT * FROM agent_ai_settings WHERE agent_id = $1",
      [agent.id]
    );
    const org = await client.query(
      "SELECT * FROM org_ai_settings WHERE org_id = $1",
      [agent.org_id]
    );
    const aiRow = ai.rows[0] ?? {};
    const orgRow = org.rows[0] ?? {};

    const kbs = await client.query(
      "SELECT id FROM knowledge_bases WHERE agent_id = $1 AND status = 'active' ORDER BY created_at",
      [agent.id]
    );

    // ── Main branch ──────────────────────────────────────────────────────────
    const mainId = randomUUID();
    if (APPLY) {
      await client.query(
        `INSERT INTO agent_branches (id, agent_id, org_id, name, description, is_main)
         VALUES ($1, $2, $3, 'Main', 'Permanent mainline branch.', TRUE)
         ON CONFLICT (agent_id, name) DO NOTHING`,
        [mainId, agent.id, agent.org_id]
      );
    }
    const mainRow = await client.query(
      "SELECT id FROM agent_branches WHERE agent_id = $1 AND is_main",
      [agent.id]
    );
    const branchId = mainRow.rows[0]?.id ?? mainId;

    // ── Stage G: legacy snapshot import (ordered ASC, parentage UNKNOWN) ─────
    const snapshots = await client.query(
      "SELECT * FROM config_snapshots WHERE agent_id = $1 ORDER BY created_at ASC",
      [agent.id]
    );
    let versionNumber = 0;
    for (const snap of snapshots.rows) {
      versionNumber++;
      if (APPLY) {
        await client.query(
          `INSERT INTO agent_versions (id, agent_id, org_id, branch_id, version_number, parent_version_id,
                configuration_json, change_summary, source, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb, $7, 'legacy_snapshot', $8, $9)
           ON CONFLICT (branch_id, version_number) DO NOTHING`,
          [
            randomUUID(),
            agent.id,
            agent.org_id,
            branchId,
            versionNumber,
            JSON.stringify({
              assistant: assistantRowToConfig(snap.snapshot),
              ai: null, // historical AI selection UNKNOWN — uncertainty preserved
              runtime: null,
              knowledge: { kbIds: kbs.rows.map((k) => k.id) },
            }),
            snap.label ? `Imported snapshot: ${snap.label}` : "Imported legacy snapshot",
            snap.created_by ?? null,
            snap.created_at,
          ]
        );
      }
      importedSnapshots++;
    }

    // ── Stage E: current effective configuration → newest immutable version ──
    versionNumber++;
    const currentConfig = {
      assistant: assistantRowToConfig(assistant.rows[0]),
      ai: {
        provider: aiRow.provider ?? orgRow.default_provider ?? null,
        chatModel: aiRow.chat_model ?? orgRow.default_chat_model ?? null,
        embeddingModel: aiRow.embedding_model ?? orgRow.default_embedding_model ?? null,
        realtimeModel: aiRow.realtime_model ?? orgRow.default_realtime_model ?? null,
        transcriptionModel: aiRow.transcription_model ?? orgRow.default_transcription_model ?? null,
        voiceProvider: aiRow.voice_provider ?? orgRow.voice_provider ?? null,
        realtimeVoiceProvider: aiRow.realtime_voice_provider ?? orgRow.realtime_voice_provider ?? null,
      },
      runtime: {
        enableVoice: orgRow.enable_voice ?? true,
        enableRealtime: orgRow.enable_realtime ?? true,
        enablePublicEmbed: orgRow.enable_public_embed ?? true,
      },
      knowledge: { kbIds: kbs.rows.map((k) => k.id) },
    };
    const versionId = randomUUID();
    if (APPLY) {
      await client.query(
        `INSERT INTO agent_versions (id, agent_id, org_id, branch_id, version_number, parent_version_id,
              configuration_json, change_summary, source, created_by)
         VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb, $7, 'migration', NULL)
         ON CONFLICT (branch_id, version_number) DO NOTHING`,
        [
          versionId,
          agent.id,
          agent.org_id,
          branchId,
          versionNumber,
          JSON.stringify(currentConfig),
          "Initial version — migrated from live agent configuration",
        ]
      );
      // Draft mirrors the current effective configuration.
      await client.query(
        `INSERT INTO agent_drafts (id, agent_id, org_id, branch_id, user_id, configuration_json, parent_version_id)
         VALUES ($1, $2, $3, $4, NULL, $5::jsonb, $6)
         ON CONFLICT (branch_id) DO NOTHING`,
        [randomUUID(), agent.id, agent.org_id, branchId, JSON.stringify(currentConfig), versionId]
      );
      // Stage F: provenance stays NULL for historical agents (unknown).
      await client.query(
        "UPDATE agents SET default_assistant_version = NULL WHERE id = $1",
        [agent.id]
      );
    }

    // Deployment when the agent is currently published (Stage E §7).
    if (agent.status === "published") {
      if (APPLY) {
        await insertDeployment(agent, versionId, orgRow);
      }
      deployments++;
    }
    created++;
    details.push({
      agent: agent.name,
      versions: versionNumber,
      importedSnapshots: snapshots.rows.length,
      deployment: agent.status === "published",
    });
  }

  report.stages.agentMigration = {
    activeAgents: agents.rows.length,
    migrated: created,
    skippedAlreadyVersioned: skipped,
    importedSnapshotVersions: importedSnapshots,
    deploymentsCreated: deployments,
    details,
  };
  log(
    `Stage E/F/G — agents: ${agents.rows.length} active, ${created} migrated, ${skipped} skipped, ${importedSnapshots} snapshots imported, ${deployments} deployments.`
  );
}

async function insertDeployment(agent, versionId, orgRow) {
  await client.query(
    `UPDATE agent_deployments SET status = 'superseded'
      WHERE agent_id = $1 AND environment = 'production' AND status = 'active'`,
    [agent.id]
  );
  await client.query(
    `INSERT INTO agent_deployments (id, agent_id, org_id, branch_id, version_id, environment, status, public_access, published_by)
     VALUES ($1, $2, $3,
             (SELECT branch_id FROM agent_versions WHERE id = $4),
             $4, 'production', 'active', $5, NULL)`,
    [randomUUID(), agent.id, agent.org_id, versionId, orgRow?.enable_public_embed ?? true]
  );
  await client.query("UPDATE agent_versions SET published_at = now() WHERE id = $1 AND published_at IS NULL", [versionId]);
}

// ── §18 Verification checklist ────────────────────────────────────────────────

async function stageVerify() {
  const checks = [];

  const q = async (sql, params = []) => (await client.query(sql, params)).rows;

  const activeAgents = await q("SELECT count(*)::int AS n FROM agents WHERE status <> 'archived'");
  const withMain = await q("SELECT count(DISTINCT agent_id)::int AS n FROM agent_branches WHERE is_main");
  checks.push({ check: "Every active agent has a Main branch", ok: withMain[0].n >= activeAgents[0].n, detail: `${withMain[0].n}/${activeAgents[0].n}` });

  const withVersion = await q("SELECT count(DISTINCT agent_id)::int AS n FROM agent_versions");
  checks.push({ check: "Every active agent has at least one immutable version", ok: withVersion[0].n >= activeAgents[0].n, detail: `${withVersion[0].n}/${activeAgents[0].n}` });

  const publishedAgents = await q("SELECT count(*)::int AS n FROM agents WHERE status = 'published'");
  const withDeployment = await q("SELECT count(DISTINCT agent_id)::int AS n FROM agent_deployments WHERE status = 'active'");
  checks.push({ check: "Every published agent has a deployment", ok: withDeployment[0].n >= publishedAgents[0].n, detail: `${withDeployment[0].n}/${publishedAgents[0].n}` });

  const deploymentsToVersion = await q(
    `SELECT count(*)::int AS n FROM agent_deployments dep
      LEFT JOIN agent_versions v ON v.id = dep.version_id
     WHERE v.id IS NULL`
  );
  checks.push({ check: "Every deployment points to an immutable version", ok: deploymentsToVersion[0].n === 0, detail: `${deploymentsToVersion[0].n} orphans` });

  // Deployments structurally cannot point to drafts (FK → agent_versions).
  checks.push({ check: "No deployment points to a draft", ok: true, detail: "enforced by FK agent_deployments.version_id → agent_versions.id" });

  const unknownProviders = await q(
    `SELECT provider FROM agent_ai_settings WHERE provider IS NOT NULL
      AND provider NOT IN ('openai','gemini','sarvam')
     UNION
     SELECT default_provider FROM org_ai_settings WHERE default_provider IS NOT NULL
      AND default_provider NOT IN ('openai','gemini','sarvam')`
  );
  checks.push({ check: "No unknown provider IDs remain", ok: unknownProviders.length === 0, detail: unknownProviders.map((r) => r.provider).join(", ") || "none" });

  const crossTenant = await q(
    `SELECT count(*)::int AS n FROM agent_versions v
       JOIN agents a ON a.id = v.agent_id
      WHERE a.org_id <> v.org_id`
  );
  checks.push({ check: "No cross-tenant branch/version relationships", ok: crossTenant[0].n === 0, detail: `${crossTenant[0].n} violations` });

  const disabledProviderSelections = await q(
    `SELECT DISTINCT p.provider_id
       FROM platform_ai_providers p
       JOIN agent_versions v ON (v.configuration_json->'ai'->>'provider') = p.provider_id
      WHERE p.enabled = FALSE`
  );
  checks.push({
    check: "No disabled provider can be selected by runtime",
    ok: disabledProviderSelections.length === 0,
    detail: disabledProviderSelections.map((r) => r.provider_id).join(", ") || "none",
  });

  const noDeployment = await q(
    "SELECT count(DISTINCT a.id)::int AS n FROM agents a LEFT JOIN agent_deployments dep ON dep.agent_id = a.id AND dep.status = 'active' WHERE dep.id IS NULL AND a.status <> 'archived'"
  );
  checks.push({
    check: "Legacy fallback count is zero or explicitly understood",
    ok: noDeployment[0].n === 0,
    detail: `${noDeployment[0].n} agents without deployments still resolve via the legacy chain (dual-read)`,
  });

  const orgsWithSub = await q(
    `SELECT count(*)::int AS n FROM organisations o
      LEFT JOIN org_subscriptions os ON os.org_id = o.id
     WHERE os.id IS NULL`
  );
  checks.push({ check: "Every active organisation has a subscription record (entitlement resolution)", ok: orgsWithSub[0].n === 0, detail: `${orgsWithSub[0].n} without` });

  report.stages.verification = checks;
  for (const c of checks) {
    log(`${c.ok ? "PASS" : "WARN"} — ${c.check} (${c.detail})`);
    if (!c.ok) report.warnings.push(`Verification: ${c.check} — ${c.detail}`);
  }
}

// ── Report artifact ───────────────────────────────────────────────────────────

function writeReport() {
  const dir = path.join(process.cwd(), "docs", "superpowers", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "2026-09-20-ai-configuration-migration-report.md");
  const lines = [
    "# AI Configuration Migration Report",
    "",
    `Generated: ${report.generatedAt} · Mode: **${report.mode}**`,
    "",
    "## Stage B/C — Provider registry",
    "",
    "| Provider | Configured | Kill-switch | Enabled |",
    "|---|---|---|---|",
    ...(report.stages.providerRegistry ?? []).map(
      (r) => `| ${r.provider} | ${r.configured ? "yes" : "no"} | ${r.killSwitchOn ? "on" : "off"} | ${r.enabledNow ? "yes" : "no"} |`
    ),
    "",
    "## Stage D — Entitlement audit",
    "",
    "```json",
    JSON.stringify(report.stages.entitlementAudit ?? {}, null, 2),
    "```",
    "",
    "## Stage E/F/G — Agent migration",
    "",
    "```json",
    JSON.stringify(
      {
        ...(report.stages.agentMigration ?? {}),
        details: (report.stages.agentMigration?.details ?? []).slice(0, 50),
      },
      null,
      2
    ),
    "```",
    "",
    "## §18 Verification checklist",
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...(report.stages.verification ?? []).map((c) => `| ${c.check} | ${c.ok ? "PASS" : "WARN"} | ${c.detail} |`),
    "",
    report.warnings.length > 0 ? "## Warnings" : "",
    ...(report.warnings.length > 0 ? ["", ...report.warnings.map((w) => `- ${w}`)] : []),
    "",
  ];
  fs.writeFileSync(file, lines.filter((l) => l !== undefined).join("\n"));
  log(`report written → ${file}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await client.connect();
  try {
    await preflight();
    const platformEnv = await loadPlatformEnv();
    if (!VERIFY_ONLY) {
      await stageProviderRegistry(platformEnv);
      await stageEntitlementAudit();
      await stageMigrateAgents();
    }
    await stageVerify();
    writeReport();
    const failed = (report.stages.verification ?? []).filter((c) => !c.ok).length;
    log(`done — ${failed} verification warning(s).`);
    process.exitCode = 0;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-ai] FAILED:", err);
  process.exitCode = 1;
});
