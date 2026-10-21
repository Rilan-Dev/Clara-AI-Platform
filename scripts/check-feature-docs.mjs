#!/usr/bin/env node
/**
 * Verify that docs/features/README.md indexes every numbered feature document
 * once and that each document retains the shared ten-section definition.
 *
 * Pure filesystem check: no GitHub token, network, migrations or deployment.
 * Run: node scripts/check-feature-docs.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePattern = /^\d{2}-[a-z0-9-]+\.md$/;

export function auditFeatureDocs(repoRoot) {
  const dir = join(repoRoot, "docs", "features");
  const errors = [];
  if (!existsSync(join(dir, "README.md"))) {
    return ["Missing docs/features/README.md"];
  }

  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const indexed = [];
  const rowPattern = /^\|\s*(\d{2})\s*\|[^\n]*?\]\(\.\/([^)]*\.md)\)\s*\|\s*$/gm;
  for (const match of readme.matchAll(rowPattern)) {
    indexed.push({ number: Number(match[1]), file: match[2] });
  }
  const available = readdirSync(dir).filter((name) => filePattern.test(name)).sort();
  const indexedNames = indexed.map((entry) => entry.file);
  const names = new Set(indexedNames);

  if (indexed.length === 0) errors.push("Feature matrix has no indexed feature rows");
  for (const name of available) {
    if (!names.has(name)) errors.push(`Unindexed feature document: ${name}`);
  }
  for (const [position, entry] of indexed.entries()) {
    if (entry.number !== position + 1) {
      errors.push(`Matrix row ${position + 1} is numbered ${entry.number} (expected ${position + 1})`);
    }
    if (!filePattern.test(entry.file) || !entry.file.startsWith(String(entry.number).padStart(2, "0") + "-")) {
      errors.push(`Matrix number/path mismatch: ${entry.number} → ${entry.file}`);
    }
    if (indexedNames.indexOf(entry.file) !== position) errors.push(`Duplicate feature index entry: ${entry.file}`);
    if (!existsSync(join(dir, entry.file))) {
      errors.push(`Indexed document does not exist: ${entry.file}`);
      continue;
    }
    const content = readFileSync(join(dir, entry.file), "utf8");
    const sections = [...content.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm)];
    const sequence = sections.map((section) => Number(section[1]));
    if (sequence.length !== 10 || sequence.some((section, index) => section !== index + 1)) {
      errors.push(`${entry.file}: expected numbered sections 1–10 in order, found ${sequence.join(", ") || "(none)"}`);
    }
    for (const link of content.matchAll(/\]\((\.\/?[^)#\s]+)(?:#[^)]*)?\)/g)) {
      const destination = link[1];
      if (!existsSync(resolve(dirname(join(dir, entry.file)), destination))) {
        errors.push(`${entry.file}: broken relative link ${destination}`);
      }
    }
  }
  return errors;
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (scriptPath && scriptPath === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(scriptPath), "..");
  const errors = auditFeatureDocs(repoRoot);
  if (errors.length) {
    console.error(`Feature documentation check failed (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Feature documentation index, numbering, ten-section structure and relative links: OK");
  }
}
