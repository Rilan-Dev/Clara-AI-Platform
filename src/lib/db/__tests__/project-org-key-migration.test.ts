import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("project/org composite-key repair migration", () => {
  const migrationPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "db",
    "migrations",
    "029_repair_project_org_key.sql",
  );

  const sql = fs.readFileSync(migrationPath, "utf8");

  it("is idempotent when the canonical constraint already exists", () => {
    expect(sql).toContain("conname = 'projects_id_org_id_unique'");
    expect(sql).toContain("IF NOT EXISTS");
  });

  it("detects the legacy conflicting relation before creating a key", () => {
    expect(sql).toContain("c.relname = 'projects_id_org_id_unique'");
    expect(sql).toContain("c.relkind = 'i'");
  });

  it("reuses a valid unique index instead of recreating its relation", () => {
    expect(sql).toContain("existing_index_unique");
    expect(sql).toContain("UNIQUE USING INDEX");
  });

  it("uses a different constraint name when a conflicting index cannot be reused", () => {
    expect(sql).toContain("projects_id_org_id_key");
    expect(sql).toContain("UNIQUE (id, org_id)");
  });
});
