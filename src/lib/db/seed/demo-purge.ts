import type { PoolClient } from "pg";

import { DEMO_IDS, DEMO_KB_IDS, DEMO_ORG_IDS } from "@/lib/db/seed/demo";

/**
 * src/lib/db/seed/demo-purge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Purge the demo/development seed scope (and e2e test artifacts) from a
 * database, leaving production bootstrap data and all real traffic untouched.
 *
 * Scope — everything owned by the fixed demo UUIDs:
 *   • Omen United Insurance / TechVision Solutions organisations
 *   • their org admins, agents, KBs, documents, ingest jobs, personas
 *   • synthetic query_events / usage_events / audit_logs / sessions
 *
 * Optionally also removes orphaned e2e test users (`…@clara-test.ai` with no
 * org membership) and their dependent rows — leftovers from live acceptance
 * runs that must not live in a production database either.
 *
 * The purge is FK-safe (children deleted before parents), guarded with
 * to_regclass so tables missing on older schemas are skipped, and runs inside
 * the caller's transaction — so it is atomic and can be dry-run by rolling
 * back. Real organisations, users, KBs, events and the production seed rows
 * are never matched by any condition below.
 */

type Logger = Pick<typeof console, "log" | "warn" | "error">;

export type PurgeTableRow = { table: string; deleted: number };

export type PurgeDemoResult = {
  /** Per-table deletion counts, in execution order. */
  rows: PurgeTableRow[];
  /** Qdrant collections that belonged to demo KBs (delete via Qdrant after commit). */
  qdrantCollections: string[];
  /** E2e test users that were (or would be) removed, with their emails. */
  e2eUsers: { id: string; email: string }[];
  /** @clara-test.ai users that still have an org membership — reported, NOT deleted. */
  skippedE2eUsers: { id: string; email: string }[];
};

/** Users created by live e2e acceptance runs (scripts/e2e-*.js). */
const E2E_USER_EMAIL_PATTERN = "%@clara-test.ai";

/**
 * Scope keys map to concrete column names per table — self-referencing tables
 * (users, organisations, agents, knowledge_bases) match on their own `id`.
 */
type ScopeKey = "org" | "user" | "agent" | "kb" | "document";
type ScopedColumns = Partial<Record<ScopeKey, string>>;

/**
 * Deletion plan, children-first. Each entry is executed as
 *   DELETE FROM <table> WHERE <any scope column> IN (<demo ids>)
 */
const PURGE_PLAN: ReadonlyArray<Readonly<{ table: string; scopes: ScopedColumns }>> = [
  { table: "sessions",                scopes: { user: "user_id" } },
  { table: "password_reset_tokens",   scopes: { user: "user_id" } },
  { table: "audit_logs",              scopes: { user: "user_id", org: "org_id" } },
  { table: "platform_events",         scopes: { user: "user_id", org: "org_id" } },
  { table: "usage_events",            scopes: { org: "org_id", agent: "agent_id", kb: "kb_id", document: "document_id" } },
  { table: "query_events",            scopes: { user: "user_id", org: "org_id", kb: "kb_id" } },
  { table: "chat_sessions",           scopes: { user: "user_id", kb: "kb_id" } },
  { table: "daily_query_stats",       scopes: { kb: "kb_id" } },
  { table: "top_queries",             scopes: { kb: "kb_id" } },
  { table: "phone_call_logs",         scopes: { kb: "kb_id" } },
  { table: "phone_call_configs",      scopes: { kb: "kb_id" } },
  { table: "scrape_url_retries",      scopes: { kb: "kb_id" } },
  { table: "scrape_urls",             scopes: { document: "document_id" } },
  { table: "scrape_sessions",         scopes: { kb: "kb_id" } },
  { table: "ingest_jobs",             scopes: { kb: "kb_id", document: "document_id" } },
  { table: "documents",               scopes: { kb: "kb_id" } },
  { table: "api_keys",                scopes: { org: "org_id", kb: "kb_id" } },
  { table: "kb_ai_overrides",         scopes: { kb: "kb_id" } },
  { table: "knowledge_bases",         scopes: { kb: "id" } },
  { table: "config_snapshots",        scopes: { agent: "agent_id" } },
  { table: "assistant_configs",       scopes: { agent: "agent_id" } },
  { table: "agent_members",           scopes: { agent: "agent_id", user: "user_id" } },
  { table: "agent_language_assignments", scopes: { org: "org_id", agent: "agent_id" } },
  { table: "agent_voice_assignments",    scopes: { org: "org_id", agent: "agent_id" } },
  { table: "agent_ai_settings",          scopes: { org: "org_id", agent: "agent_id" } },
  { table: "agents",                 scopes: { agent: "id" } },
  { table: "subscription_audit_log",  scopes: { org: "org_id" } },
  { table: "subscription_notifications", scopes: { org: "org_id" } },
  { table: "billing_events",          scopes: { org: "org_id" } },
  { table: "org_ai_settings",         scopes: { org: "org_id" } },
  { table: "organisation_languages",  scopes: { org: "org_id" } },
  { table: "organisation_voices",     scopes: { org: "org_id" } },
  { table: "org_members",             scopes: { org: "org_id", user: "user_id" } },
  { table: "org_subscriptions",       scopes: { org: "org_id" } },
  { table: "users",                   scopes: { user: "id" } },
  { table: "organisations",           scopes: { org: "id" } },
] as const;

/**
 * Purge the demo scope (and optionally e2e test artifacts) using the given
 * transaction client. The caller controls BEGIN / COMMIT / ROLLBACK — run it
 * inside a rolled-back transaction for a dry-run report.
 */
export async function purgeDemoScope(
  client: PoolClient,
  options?: { includeE2eArtifacts?: boolean; logger?: Logger },
): Promise<PurgeDemoResult> {
  const logger = options?.logger ?? console;
  const includeE2e = options?.includeE2eArtifacts ?? false;

  const orgIds = [...DEMO_ORG_IDS];
  const agentIds = [DEMO_IDS.omenAgentId, DEMO_IDS.tvAgentId];
  const kbIds = [...DEMO_KB_IDS];
  const demoUserIds = [DEMO_IDS.omenAdminUserId, DEMO_IDS.tvAdminUserId];

  // E2e test users: only those with no org membership are safe to remove;
  // any with a membership are reported (an org would still reference them).
  const e2eUsers: { id: string; email: string }[] = [];
  const skippedE2eUsers: { id: string; email: string }[] = [];
  if (includeE2e) {
    const found = await client.query<{ id: string; email: string; memberships: number }>(
      `SELECT u.id, u.email,
              (SELECT COUNT(*)::int FROM org_members om WHERE om.user_id = u.id) AS memberships
       FROM users u WHERE u.email LIKE $1`,
      [E2E_USER_EMAIL_PATTERN],
    );
    for (const row of found.rows) {
      if (row.memberships === 0) e2eUsers.push({ id: row.id, email: row.email });
      else skippedE2eUsers.push({ id: row.id, email: row.email });
    }
  }
  const userIds = [...demoUserIds, ...e2eUsers.map((u) => u.id)];

  const idsFor = (scope: ScopeKey): string[] => {
    switch (scope) {
      case "org": return orgIds;
      case "user": return userIds;
      case "agent": return agentIds;
      case "kb": return kbIds;
      case "document": return documentIds;
    }
  };

  // Demo document ids + Qdrant collection names — collected BEFORE the KB/doc
  // rows are deleted, so vectors can be cleaned up after commit.
  const docsRes = await client.query<{ id: string }>(
    `SELECT id FROM documents WHERE kb_id = ANY($1::uuid[])`,
    [kbIds],
  );
  const documentIds = docsRes.rows.map((r) => r.id);
  const kbRes = await client.query<{ qdrant_collection: string }>(
    `SELECT qdrant_collection FROM knowledge_bases WHERE id = ANY($1::uuid[]) AND qdrant_collection IS NOT NULL`,
    [kbIds],
  );
  const qdrantCollections = kbRes.rows.map((r) => r.qdrant_collection);

  const rows: PurgeTableRow[] = [];
  for (const step of PURGE_PLAN) {
    const entries = Object.entries(step.scopes) as Array<[ScopeKey, string]>;
    if (entries.length === 0) continue;

    // Skip tables that do not exist on this schema (older deployments).
    const exists = await client.query<{ present: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS present`,
      [`public.${step.table}`],
    );
    if (!exists.rows[0]?.present) {
      logger.warn(`[purge:demo] table ${step.table} not present — skipped`);
      continue;
    }

    const conditions: string[] = [];
    const params: string[] = [];
    for (const [scope, column] of entries) {
      const ids = idsFor(scope);
      if (ids.length === 0) continue;
      params.push(...ids);
      const placeholders = ids.map((_, i) => `$${params.length - ids.length + 1 + i}`).join(",");
      conditions.push(`${column} = ANY(ARRAY[${placeholders}]::uuid[])`);
    }
    if (conditions.length === 0) continue;

    const res = await client.query(
      `DELETE FROM ${step.table} WHERE ${conditions.join(" OR ")}`,
      params,
    );
    rows.push({ table: step.table, deleted: res.rowCount ?? 0 });
  }

  return { rows, qdrantCollections, e2eUsers, skippedE2eUsers };
}

/**
 * Delete Qdrant collections that hold demo vectors or are orphans (no
 * knowledge_bases row references them). Called AFTER the Postgres commit —
 * vector deletion is best-effort and never blocks the SQL purge.
 */
export async function cleanQdrantAfterPurge(options?: {
  logger?: Logger;
  extraCollections?: string[];
  keepCollections?: string[];
}): Promise<{ deleted: string[]; kept: string[]; errors: string[] }> {
  const logger = options?.logger ?? console;
  const url = process.env.QDRANT_URL?.replace(/"/g, "").trim();
  const deleted: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  const targets = new Set(options?.extraCollections ?? []);
  if (!url) {
    logger.warn("[purge:demo] QDRANT_URL not set — vector cleanup skipped");
    return { deleted, kept: [...targets], errors };
  }
  const apiKey = process.env.QDRANT_API_KEY?.replace(/"/g, "").trim() ?? "";
  const headers: Record<string, string> = apiKey ? { "api-key": apiKey } : {};

  // Orphan sweep: any collection no KB row references (minus explicit keeps
  // like the platform document catalog) is leftover garbage.
  const pool = (await import("@/lib/db")).pool;
  const liveRes = await pool.query<{ qdrant_collection: string }>(
    `SELECT DISTINCT qdrant_collection FROM knowledge_bases WHERE qdrant_collection IS NOT NULL`,
  );
  const live = new Set(liveRes.rows.map((r) => r.qdrant_collection));
  for (const keep of options?.keepCollections ?? ["document_catalog"]) live.add(keep);

  const res = await fetch(`${url}/collections`, { headers });
  const data = (await res.json()) as { result?: { collections?: { name: string }[] } };
  const all = data.result?.collections?.map((c) => c.name) ?? [];
  for (const name of all) {
    if (!live.has(name)) targets.add(name);
  }

  for (const name of targets) {
    try {
      const del = await fetch(`${url}/collections/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers,
      });
      if (del.ok) {
        deleted.push(name);
        logger.log(`[purge:demo] qdrant ${name} → deleted`);
      } else {
        errors.push(`${name} (${del.status})`);
        logger.warn(`[purge:demo] qdrant ${name} → kept (${del.status})`);
      }
    } catch (err) {
      errors.push(`${name} (${(err as Error).message})`);
      logger.warn(`[purge:demo] qdrant ${name} delete failed: ${(err as Error).message}`);
    }
  }

  return { deleted, kept, errors };
}
