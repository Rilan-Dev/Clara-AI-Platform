/**
 * src/lib/env-scope.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Environment scoping rules — the contract that keeps existing (production)
 * deployments byte-identical while CLARA_ENV=development isolates every store.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyQdrantCollectionPrefix,
  describeEnvScope,
  resolveBullmqPrefix,
  resolveClaraEnv,
  resolvePgSchema,
  resolveQdrantCollectionPrefix,
} from "./env-scope";

const ENV_KEYS = ["CLARA_ENV", "PG_SCHEMA", "QDRANT_COLLECTION_PREFIX", "BULLMQ_PREFIX"] as const;

// process.env.NODE_ENV is typed read-only (Next augmentation) — stub it.
const setNodeEnv = (value?: string) => {
  if (value === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else vi.stubEnv("NODE_ENV", value);
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("resolveClaraEnv", () => {

  it("defaults to production when nothing is set", () => {
    expect(resolveClaraEnv()).toBe("production");
  });

  it("seeds from NODE_ENV=development", () => {
    setNodeEnv("development");
    expect(resolveClaraEnv()).toBe("development");
  });

  it("CLARA_ENV wins over NODE_ENV", () => {
    setNodeEnv("development");
    process.env.CLARA_ENV = "production";
    expect(resolveClaraEnv()).toBe("production");
  });

  it("ignores unknown CLARA_ENV values", () => {
    process.env.CLARA_ENV = "staging";
    expect(resolveClaraEnv()).toBe("production");
  });
});

describe("resolvePgSchema (backward compatibility is absolute)", () => {

  it("production default is NO schema (public — today's behaviour)", () => {
    expect(resolvePgSchema()).toBeNull();
  });

  it("development defaults to clara_dev", () => {
    process.env.CLARA_ENV = "development";
    expect(resolvePgSchema()).toBe("clara_dev");
  });

  it("PG_SCHEMA overrides the derived default in both directions", () => {
    process.env.CLARA_ENV = "development";
    process.env.PG_SCHEMA = "clara_prod";
    expect(resolvePgSchema()).toBe("clara_prod");

    process.env.PG_SCHEMA = "clara_stage";
    expect(resolvePgSchema()).toBe("clara_stage");
  });

  it("rejects unsafe schema identifiers", () => {
    process.env.PG_SCHEMA = 'evil"; DROP SCHEMA public CASCADE; --';
    expect(() => resolvePgSchema()).toThrow(/not a safe schema identifier/);
    process.env.PG_SCHEMA = "1starts_with_digit";
    expect(() => resolvePgSchema()).toThrow(/not a safe schema identifier/);
  });
});

describe("resolveQdrantCollectionPrefix", () => {

  it("production default is empty (unprefixed collections)", () => {
    expect(resolveQdrantCollectionPrefix()).toBe("");
  });

  it("development defaults to dev_", () => {
    process.env.CLARA_ENV = "development";
    expect(resolveQdrantCollectionPrefix()).toBe("dev_");
  });

  it("QDRANT_COLLECTION_PREFIX overrides (empty string disables)", () => {
    process.env.CLARA_ENV = "development";
    process.env.QDRANT_COLLECTION_PREFIX = "";
    expect(resolveQdrantCollectionPrefix()).toBe("");
    process.env.QDRANT_COLLECTION_PREFIX = "stage-";
    expect(resolveQdrantCollectionPrefix()).toBe("stage-");
  });

  it("rejects unsafe prefixes", () => {
    process.env.QDRANT_COLLECTION_PREFIX = "bad prefix!";
    expect(() => resolveQdrantCollectionPrefix()).toThrow(/must be 0–32 chars/);
  });

  it("applyQdrantCollectionPrefix prefixes generated names", () => {
    process.env.CLARA_ENV = "development";
    expect(applyQdrantCollectionPrefix("kb_ab69cf61_support_rilan")).toBe(
      "dev_kb_ab69cf61_support_rilan",
    );
    delete process.env.CLARA_ENV;
    expect(applyQdrantCollectionPrefix("kb_ab69cf61_support_rilan")).toBe(
      "kb_ab69cf61_support_rilan",
    );
  });
});

describe("resolveBullmqPrefix", () => {

  it("production default is null — Redis keys never move on upgrade", () => {
    expect(resolveBullmqPrefix()).toBeNull();
  });

  it("development defaults to dev_ (shared-db isolation for cluster Redis)", () => {
    process.env.CLARA_ENV = "development";
    expect(resolveBullmqPrefix()).toBe("dev_");
  });

  it("BULLMQ_PREFIX= (empty) disables the prefix even in development", () => {
    process.env.CLARA_ENV = "development";
    process.env.BULLMQ_PREFIX = "";
    expect(resolveBullmqPrefix()).toBeNull();
  });
});

describe("describeEnvScope", () => {

  it("renders the active scoping knobs for startup logs", () => {
    process.env.CLARA_ENV = "development";
    expect(describeEnvScope()).toBe("env=development pgSchema=clara_dev qdrantPrefix=dev_ bullmqPrefix=dev_");
    delete process.env.CLARA_ENV;
    expect(describeEnvScope()).toBe("env=production");
  });
});
