#!/usr/bin/env node
/**
 * scripts/strip-engine-modules.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Removes the proprietary AI module source from clara-backend AFTER you have
 * already run  `npm run sync`  in clara-engine and verified it works.
 *
 * ⚠️  RUN ONCE — this is destructive. Commit clara-engine first.
 *
 * Usage:
 *   node scripts/strip-engine-modules.cjs
 *   node scripts/strip-engine-modules.cjs --dry-run   (preview only)
 */
const fs      = require("fs");
const path    = require("path");
const dryRun  = process.argv.includes("--dry-run");

const SRC = path.resolve(__dirname, "../src");

// Directories to completely remove from clara-backend
const REMOVE_DIRS = [
  "modules/ai-core",
  "modules/admin/core",
  "modules/embed/core",
  "modules/ingest",
  "modules/phone",
  "modules/knowledge-bases/worker",
  "modules/queue",
  "modules/shared",
];

// Individual files to remove
const REMOVE_FILES = [
  // These now live only in clara-engine
  "modules/knowledge-bases/worker/ingest-worker.ts",
  "modules/knowledge-bases/worker/scrape-worker.ts",
  "modules/knowledge-bases/worker/retry-scheduler.ts",
];

function rmDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`  [SKIP] Not found: ${dir}`);
    return;
  }
  if (dryRun) {
    console.log(`  [DRY]  Would delete dir: ${dir}`);
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`  🗑️   Deleted: ${dir}`);
}

console.log(`\n🔪  clara-backend module strip${dryRun ? " (DRY RUN)" : ""}\n`);
console.log("⚠️  Make sure clara-engine is synced and working before proceeding!\n");

for (const d of REMOVE_DIRS) {
  rmDir(path.join(SRC, d));
}

// Also clean up the top-level workers/ directory
const workersDir = path.resolve(__dirname, "../workers");
rmDir(workersDir);

// Clean up scripts that belong to the engine only
const engineScripts = [
  "scripts/voice-relay.mjs",
  "scripts/phone-stream.mjs",
  "scripts/dev-relay.mjs",
  "scripts/ingest.ts",
  "scripts/ingest-web.ts",
  "scripts/scrape-benchmark.ts",
  "scripts/test-crawl.ts",
  "scripts/test-extract.ts",
  "scripts/diagnose-extract.ts",
  "scripts/probe-site.ts",
  "scripts/scan-blocked-domains.ts",
];

console.log("\n🧹  Removing engine-only scripts...");
for (const s of engineScripts) {
  const full = path.resolve(__dirname, "..", s);
  if (!fs.existsSync(full)) { console.log(`  [SKIP] ${s}`); continue; }
  if (dryRun) { console.log(`  [DRY]  Would delete: ${s}`); continue; }
  fs.rmSync(full, { force: true });
  console.log(`  🗑️   Deleted: ${s}`);
}

if (dryRun) {
  console.log("\n✅  Dry run complete — nothing was deleted.");
  console.log("    Remove --dry-run flag to actually strip the modules.\n");
} else {
  console.log("\n✅  Strip complete!");
  console.log("    clara-backend now contains NO proprietary AI source code.");
  console.log("    The app works only when CLARA_ENGINE_URL points to your VPS.\n");
  console.log("Next steps:");
  console.log("  1. Add CLARA_ENGINE_URL + CLARA_ENGINE_SECRET to .env");
  console.log("  2. git add -A && git commit -m 'chore: extract AI core to clara-engine'");
  console.log("  3. git push  (safe to make public)\n");
}
