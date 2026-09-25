/**
 * src/lib/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL connection pool — one lazy singleton per runtime instance.
 *
 * Serverless runtimes can create many warm instances. Pool size therefore
 * multiplies across instances and must stay deliberately small; otherwise
 * Supabase session-mode pools can hit their per-role client limit.
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// ── Environment ───────────────────────────────────────────────────────────────

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("[db] DATABASE_URL is required");
  }
  return databaseUrl;
}

/**
 * Connections per process.
 *   • Vercel: always 1 — pools multiply across warm serverless instances.
 *   • VPS / Docker: ONE long-running process serves every request, so a
 *     single connection serialises all traffic (voice turns, dashboards,
 *     the ingest poller, health checks). Default 10 against a self-hosted
 *     Postgres; 3 when DATABASE_URL points at a shared Supabase pooler whose
 *     client limit is global.
 * PG_POOL_MAX overrides the non-Vercel default.
 */
export function resolvePoolMax(env: Record<string, string | undefined> = process.env): number {
  if (env.VERCEL) return 1;
  const configured = Number(env.PG_POOL_MAX);
  if (Number.isFinite(configured) && configured >= 1) return Math.floor(configured);
  return /pooler\.supabase\.com/i.test(env.DATABASE_URL ?? "") ? 3 : 10;
}

function getPgConfig() {

  return {
    connectionString: getDatabaseUrl(),

    // Vercel/serverless instances multiply this pool across concurrent
    // functions. Session-mode Postgres/Supabase limits are global to the
    // database role, so even a "small" per-instance pool can exhaust the
    // shared limit when several instances are warm at once. Keep Vercel at
    // exactly one client per runtime; concurrent requests queue in pg instead
    // of opening additional database sessions.
    max: resolvePoolMax(),

    min: 0,

    // Keep warm connections long enough to avoid repeated TLS/SCRAM setup
    // during normal UI navigation, while allowing idle serverless instances
    // to release their connection.
    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 5_000,
    query_timeout: 8_000,
    statement_timeout: 8_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  } as const;
}

// ── Singleton pattern safe for Next.js dev hot-reload ─────────────────────────

declare global {
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (globalThis.__pgPool) return globalThis.__pgPool;

  const pool = new Pool(getPgConfig());

  pool.on("error", (err) => {
    console.error("[db] unexpected pool error:", err.message);
  });

  globalThis.__pgPool = pool;
  return pool;
}

// Keep the exported pool API stable while deferring DATABASE_URL validation
// and Pool construction until the first actual database operation. Next.js
// imports route modules during build-time page-data collection, but those
// imports must not require production runtime secrets.
export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const instance = getPool();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

// ── Typed query helpers ───────────────────────────────────────────────────────

/** Run a single parameterised query, returns all rows. */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result: QueryResult<T> = await pool.query<T>(sql, params);
  return result.rows;
}

/** Run a query that is expected to return exactly one row, or null. */
export async function queryOne<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Execute a statement that returns no meaningful rows (INSERT/UPDATE/DELETE). */
export async function execute(sql: string, params?: unknown[]): Promise<void> {
  await pool.query(sql, params);
}

/** Acquire a raw client for multi-statement transactions. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    committed = true;
    return result;
  } catch (error) {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[db] transaction rollback failed:", rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
