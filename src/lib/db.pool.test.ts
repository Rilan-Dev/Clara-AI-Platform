import { describe, expect, it } from "vitest";
import { resolvePoolMax } from "./db";

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
