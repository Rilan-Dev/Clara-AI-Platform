import { afterEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditFeatureDocs } from "./check-feature-docs.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture({ rows = [1], docs = rows, missingSection = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "clara-feature-audit-"));
  roots.push(root);
  const dir = join(root, "docs", "features");
  mkdirSync(dir, { recursive: true });
  const file = (n) => String(n).padStart(2, "0") + "-example.md";
  writeFileSync(
    join(dir, "README.md"),
    "# Feature Index\n\n| # | Feature | Doc |\n|---|---|---|\n" +
      rows.map((n) => `| ${String(n).padStart(2, "0")} | Feature ${n} | [${file(n)}](./${file(n)}) |\n`).join(""),
  );
  for (const n of docs) {
    writeFileSync(
      join(dir, file(n)),
      `# Feature ${n}\n\n` +
        Array.from({ length: missingSection ? 9 : 10 }, (_, i) => `## ${i + 1}. Section\n\nText\n\n`).join(""),
    );
  }
  return root;
}

describe("docs/features index integrity", () => {
  it("accepts an indexed and structured feature", () => {
    assert.deepEqual(auditFeatureDocs(fixture()), []);
  });

  it("detects missing links and unindexed feature documents", () => {
    const errors = auditFeatureDocs(fixture({ rows: [1], docs: [2] }));
    assert.ok(errors.some((error) => error.includes("Unindexed feature document")));
    assert.ok(errors.some((error) => error.includes("Indexed document does not exist")));
  });

  it("detects non-contiguous feature numbering and missing section definitions", () => {
    const errors = auditFeatureDocs(fixture({ rows: [2], missingSection: true }));
    assert.ok(errors.some((error) => error.includes("numbered 2 (expected 1)")));
    assert.ok(errors.some((error) => error.includes("numbered sections 1–10")));
  });

  it("detects duplicate feature-index references", () => {
    const errors = auditFeatureDocs(fixture({ rows: [1, 1] }));
    assert.ok(errors.some((error) => error.includes("Duplicate feature index entry")));
  });
});
