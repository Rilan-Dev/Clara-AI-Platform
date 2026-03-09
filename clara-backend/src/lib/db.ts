/**
 * src/lib/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL connection pool — single instance shared across the entire app.
 *
 * Uses the `pg` package (node-postgres). If pg is not yet installed run:
 *   npm install pg @types/pg
 *
 * Connection details are read from environment variables:
 *   POSTGRES_HOST     POSTGRES_PORT  POSTGRES_USER
 *   POSTGRES_PASSWORD POSTGRES_DB
 *
 * The pool is lazy-initialised on first use and cached on the global object
 * in development so Next.js hot-reload does not create a new pool per module
 * re-evaluation (which would exhaust PostgreSQL's max_connections quickly).
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// ── Environment ───────────────────────────────────────────────────────────────

const PG_CONFIG = {
  host:     process.env.POSTGRES_HOST     ?? "180.188.231.138",
  port:     Number(process.env.POSTGRES_PORT ?? "5434"),
  user:     process.env.POSTGRES_USER     ?? "atc",
  password: process.env.POSTGRES_PASSWORD ?? "Postgres@ATC",
  database: process.env.POSTGRES_DB       ?? "postgres",
  // Keep pool small: Next.js can have many concurrent edge/serverless invocations.
  max:             Number(process.env.PG_POOL_MAX  ?? "10"),
  idleTimeoutMillis:  30_000,
  connectionTimeoutMillis: 10_000,
  // Allow self-signed certs on private/internal PostgreSQL servers
  ssl: process.env.POSTGRES_SSL === "true"
    ? { rejectUnauthorized: false }
    : false,
} as const;

// ── Singleton pattern safe for Next.js dev hot-reload ─────────────────────────

declare global {
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (globalThis.__pgPool) return globalThis.__pgPool;
  const pool = new Pool(PG_CONFIG);

  pool.on("error", (err) => {
    console.error("[db] unexpected pool error:", err.message);
  });

  globalThis.__pgPool = pool;
  return pool;
}

export const pool = getPool();

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
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
