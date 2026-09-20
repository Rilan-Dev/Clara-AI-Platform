import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkDemoSeedAllowed,
  formatDemoSeedRefusal,
  resolveDemoDbHost,
} from "@/lib/db/seed/demo-guard";

/**
 * demo-guard tests — the default-deny contract that keeps demo/development
 * seed data off production databases.
 *
 * The regression that motivated the guard: an operator shell with NODE_ENV
 * unset ran `npm run seed` (then pointing at the demo seeder) against a live
 * production DATABASE_URL, and the demo dataset landed in production. Every
 * case below pins one refusal or allowance rule.
 */

const REAL_ENV: Record<string, string | undefined> = { ...process.env };
const REAL_ARGV = process.argv;

beforeEach(() => {
  const clean: Record<string, string | undefined> = { ...process.env };
  delete clean.NODE_ENV;
  delete clean.POSTGRES_HOST;
  delete clean.DATABASE_URL;
  process.env = clean as typeof process.env;
});

afterEach(() => {
  process.env = { ...REAL_ENV } as typeof process.env;
  process.argv = REAL_ARGV;
});

describe("resolveDemoDbHost", () => {
  it("prefers POSTGRES_HOST over DATABASE_URL", () => {
    expect(resolveDemoDbHost({ POSTGRES_HOST: "Clara-Postgres", DATABASE_URL: "postgresql://u:p@remote.example.com/db" })).toBe("clara-postgres");
  });

  it("falls back to the DATABASE_URL hostname", () => {
    expect(resolveDemoDbHost({ DATABASE_URL: "postgresql://u:p@180.188.231.138:1234/clara_platform" })).toBe("180.188.231.138");
  });

  it("returns empty string when nothing is set or DATABASE_URL is malformed", () => {
    expect(resolveDemoDbHost({})).toBe("");
    expect(resolveDemoDbHost({ DATABASE_URL: "not-a-url" })).toBe("");
  });
});

describe("checkDemoSeedAllowed", () => {
  it("REFUSES when NODE_ENV=production (no --force override exists for this)", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: "production", dbHost: "localhost", force: true });
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toBe("node_env_production");
  });

  it("REFUSES when NODE_ENV is unset — the exact production accident regression", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: undefined, dbHost: "180.188.231.138" });
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toBe("node_env_unset");
  });

  it("REFUSES a remote database host without --force even in development", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: "development", dbHost: "180.188.231.138", force: false });
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toBe("remote_db_not_forced");
  });

  it("ALLOWS localhost with an explicit development NODE_ENV", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: "development", dbHost: "localhost" });
    expect(check).toMatchObject({ allowed: true, dbHost: "localhost", forced: false });
  });

  it("ALLOWS docker-compose service hostnames (local dev)", () => {
    for (const host of ["clara-postgres", "postgres", "db"]) {
      const check = checkDemoSeedAllowed({ nodeEnv: "development", dbHost: host });
      expect(check.allowed).toBe(true);
    }
  });

  it("ALLOWS other explicit non-production environments (e.g. test) on localhost", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: "test", dbHost: "127.0.0.1" });
    expect(check.allowed).toBe(true);
  });

  it("ALLOWS a remote shared dev database only with --force, and marks it forced", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: "development", dbHost: "180.188.231.138", force: true });
    expect(check).toMatchObject({ allowed: true, forced: true });
  });

  it("defaults force from argv (--force present)", () => {
    process.argv = [...REAL_ARGV, "--force"];
    const check = checkDemoSeedAllowed({ nodeEnv: "development", dbHost: "180.188.231.138" });
    expect(check).toMatchObject({ allowed: true, forced: true });
  });

  it("reads env defaults when no input is given (unset NODE_ENV refuses)", () => {
    process.env.POSTGRES_HOST = "db.internal.example.com";
    const check = checkDemoSeedAllowed();
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toBe("node_env_unset");
  });
});

describe("formatDemoSeedRefusal", () => {
  it("renders a multi-line refusal with host, reason and remediation", () => {
    const check = checkDemoSeedAllowed({ nodeEnv: undefined, dbHost: "180.188.231.138" });
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      const text = formatDemoSeedRefusal(check);
      expect(text).toContain("REFUSED");
      expect(text).toContain("180.188.231.138");
      expect(text).toContain("node_env_unset");
      expect(text).toContain("NODE_ENV=development");
    }
  });
});
