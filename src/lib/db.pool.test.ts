import { describe, expect, it } from "vitest";
import { resolvePgScopeOptions, resolvePoolMax } from "./db";

describe("resolvePoolMax", () => {
  it("keeps Vercel at one connection per instance", () => {
    expect(resolvePoolMax({ VERCEL: "1", PG_POOL_MAX: "20" })).toBe(1);
  });
  it("gives a self-hosted server a real pool", () => {
    expect(resolvePoolMax({ DATABASE_URL: "postgresql://clara@postgres:5432/clara" })).toBe(10);
  });
  it("stays small against a shared Supabase pooler", () => {
    expect(resolvePoolMax({ DATABASE_URL: "postgresql://u@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" })).toBe(3);
  });
  it("honours PG_POOL_MAX off Vercel", () => {
    expect(resolvePoolMax({ PG_POOL_MAX: "4" })).toBe(4);
  });
});

describe("resolvePgScopeOptions (environment scoping)", () => {
  const saved = {
    CLARA_ENV: process.env.CLARA_ENV,
    PG_SCHEMA: process.env.PG_SCHEMA,
    NODE_ENV: process.env.NODE_ENV,
  };

  afterEach(() => {
    process.env.CLARA_ENV = saved.CLARA_ENV;
    process.env.PG_SCHEMA = saved.PG_SCHEMA;
    // NODE_ENV is readonly in the current Node typings; restore safely.
    if (saved.NODE_ENV === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", saved.NODE_ENV);
  });

  it("production default sets NO options key — connections are byte-identical to today", () => {
    expect(resolvePgScopeOptions({ NODE_ENV: "production" })).toEqual({});
  });

  it("development routes every connection into the clara_dev schema", () => {
    expect(resolvePgScopeOptions({ CLARA_ENV: "development" })).toEqual({
      options: "-c search_path=clara_dev,public",
    });
  });

  it("PG_SCHEMA overrides the derived default", () => {
    expect(resolvePgScopeOptions({ PG_SCHEMA: "clara_prod" })).toEqual({
      options: "-c search_path=clara_prod,public",
    });
  });
});
