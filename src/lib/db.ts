/**
 * src/lib/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL connection pool — single instance shared across the entire app.
 *
 * Uses the `pg` package (node-postgres). If pg is not yet installed run:
 *   npm install pg @types/pg
 *
 * Connection details are read exclusively from DATABASE_URL.
 * The same variable is used by the app, migrations, seed scripts, and tooling.\n *
 * The pool is lazy-initialised on first use and cached on the global object
 * in development so Next.js hot-reload does not create a new pool per module
 * re-evaluation (which would exhaust PostgreSQL's max_connections quickly).
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

function getPgConfig() {
  return {
  connectionString: getDatabaseUrl(),
  // Keep enough warm connections for concurrent API work without allowing one
  // request to serialize the entire serverless instance. Override per plan.
  //
  // max on Vercel: 5 (not 1). With max:1 every Promise.all of queries in a
  // route serialised through the single connection — "parallel" workloads paid
  // the full per-query round-trip time sequentially. 5 lets a request fan out.
  // Supabase direct connections are limited (~60 on the default tier); Vercel
  // Hobby concurrency keeps simultaneous instances low enough that 5/instance
  // is safe. Tune with PG_POOL_MAX if the database tier changes.
  max: process.env.VERCEL ? Math.min(10, Math.max(1, Number(process.env.PG_POOL_MAX ?? "5"))) : Math.max(1, Number(process.env.PG_POOL_MAX ?? "10")),
  min: 0,
  // idleTimeoutMillis: 60s (not 5s). A 5s idle timeout dropped the connection
  // between typical UI interactions, so EVERY request after a brief pause paid
  // a fresh TCP + TLS + SCRAM handshake to a remote database (~200-700ms per
  // request of pure overhead). 60s keeps connections warm across clicks,
  // navigation bursts and polling while still recycling long-idle sockets.
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 3_000,
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
    const value = Reflect.get(getPool(), property, getPool());
    return typeof value === "function" ? value.bind(getPool()) : value;
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
