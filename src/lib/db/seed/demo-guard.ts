/**
 * src/lib/db/seed/demo-guard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard for every code path that writes DEMO / DEVELOPMENT seed data.
 *
 * Why this exists: the demo dataset (fictional tenants, synthetic analytics)
 * must NEVER land in a production database. A NODE_ENV check alone is not
 * enough — operator shells routinely have NODE_ENV unset, which used to make
 * `npm run seed` (demo seeder) silently run against whatever DATABASE_URL /
 * POSTGRES_HOST pointed at, including live production databases.
 *
 * The guard is default-deny. Demo seeding is allowed only when ALL hold:
 *   1. NODE_ENV is explicitly set to a non-production value
 *      (normally "development"). Unset ⇒ refuse.
 *   2. The target database host is local (localhost / loopback / common
 *      docker-compose service names). Remote hosts ⇒ refuse.
 *   3. Remote hosts can only be used deliberately, by passing `--force`
 *      (for shared dev databases), and never when NODE_ENV=production.
 *
 * Pure, dependency-free logic so it can be unit-tested (see
 * src/lib/db/seed/__tests__/demo-guard.test.ts). CLI entry points format the
 * refusal with `formatDemoSeedRefusal()` and exit non-zero.
 */

export type DemoSeedCheckInput = {
  /** NODE_ENV value to test. Defaults to process.env.NODE_ENV. */
  nodeEnv?: string | undefined;
  /** Resolved DB host to test. Defaults to resolveDemoDbHost(). */
  dbHost?: string;
  /** Explicit --force override. Defaults to argv containing "--force". */
  force?: boolean;
};

export type DemoSeedCheck =
  | {
      allowed: true;
      dbHost: string;
      forced: boolean;
    }
  | {
      allowed: false;
      dbHost: string;
      reason: "node_env_production" | "node_env_unset" | "remote_db_not_forced";
      remediation: string;
    };

/**
 * Hosts that are always safe to demo-seed: loopback interfaces, and the
 * docker-compose service names used by this repo's compose files.
 */
const LOCAL_DB_HOSTS = new Set([
  "",
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "clara-postgres",
  "postgres",
  "postgresql",
  "db",
  "database",
]);

/** Resolve the database host the pool would connect to, without importing pg. */
export function resolveDemoDbHost(
  env: Record<string, string | undefined> = process.env,
): string {
  const direct = env.POSTGRES_HOST?.trim();
  if (direct) return direct.toLowerCase();
  const url = env.DATABASE_URL?.trim();
  if (url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      /* malformed DATABASE_URL — fall through to "" */
    }
  }
  return "";
}

function isLocalHost(host: string): boolean {
  return LOCAL_DB_HOSTS.has(host);
}

/**
 * Check whether demo/dev seeding is allowed for this environment.
 * Pure function — no side effects, no process.exit.
 */
export function checkDemoSeedAllowed(input: DemoSeedCheckInput = {}): DemoSeedCheck {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const dbHost = (input.dbHost ?? resolveDemoDbHost()).toLowerCase();
  const force = input.force ?? process.argv.includes("--force");

  if (nodeEnv === "production") {
    return {
      allowed: false,
      dbHost,
      reason: "node_env_production",
      remediation:
        "NODE_ENV=production — demo data must never touch a production database. " +
        "Use `npm run seed:prod` for the production bootstrap.",
    };
  }

  if (!nodeEnv) {
    return {
      allowed: false,
      dbHost,
      reason: "node_env_unset",
      remediation:
        "NODE_ENV is not set. Demo seeding requires an explicit development environment: " +
        "re-run with NODE_ENV=development (and a local database host).",
    };
  }

  if (!isLocalHost(dbHost) && !force) {
    return {
      allowed: false,
      dbHost,
      reason: "remote_db_not_forced",
      remediation:
        `The database host "${dbHost}" is remote. Demo seeding refuses remote databases ` +
        "by default. If this is a deliberate shared development database, re-run with `--force`. " +
        "For the production bootstrap use `npm run seed:prod`.",
    };
  }

  return { allowed: true, dbHost, forced: force && !isLocalHost(dbHost) };
}

/** Human-readable refusal message for CLI entry points. */
export function formatDemoSeedRefusal(check: Extract<DemoSeedCheck, { allowed: false }>): string {
  return [
    "[seed:demo] REFUSED — demo/development seeding is not allowed here.",
    `  target database host : ${check.dbHost || "(unset)"}`,
    `  reason               : ${check.reason}`,
    `  fix                  : ${check.remediation}`,
  ].join("\n");
}
