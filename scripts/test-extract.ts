/**
 * scripts/test-extract.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 4 validation — tests enhanced content extraction quality.
 *
 * Usage:
 *   npx tsx scripts/test-extract.ts <url> [--show-full]
 *
 * Examples:
 *   npx tsx scripts/test-extract.ts https://vitejs.dev/guide/
 *   npx tsx scripts/test-extract.ts https://docs.djangoproject.com/en/5.0/
 *   npx tsx scripts/test-extract.ts https://nextjs.org/docs
 *   npx tsx scripts/test-extract.ts https://books.toscrape.com --show-full
 */

import { loadWebPage } from "../src/modules/admin/core/ingest/web-loader";

const DIVIDER = "─".repeat(70);

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  const showFull = args.includes("--show-full");

  if (!url) {
    console.error("Usage: npx tsx scripts/test-extract.ts <url> [--show-full]");
    process.exit(1);
  }

  console.log(`\n${DIVIDER}`);
  console.log(`Testing enhanced extraction on: ${url}`);
  console.log(DIVIDER);

  const start = Date.now();
  const doc = await loadWebPage(url);
  const elapsed = Date.now() - start;

  // ── Metadata ──────────────────────────────────────────────────────────────
  console.log("\n📋 METADATA");
  console.log(`  Title:          ${doc.title}`);
  console.log(`  OG Title:       ${(doc.metadata as Record<string,unknown>)["ogTitle"] || "(none)"}`);
  console.log(`  Description:    ${String((doc.metadata as Record<string,unknown>)["description"] ?? "").slice(0, 100) || "(none)"}`);
  console.log(`  Canonical URL:  ${(doc.metadata as Record<string,unknown>)["canonicalUrl"]}`);
  const bc = (doc.metadata as Record<string,unknown>)["breadcrumbs"] as string[];
  console.log(`  Breadcrumbs:    ${bc?.length > 0 ? bc.join(" > ") : "(none)"}`);
  console.log(`  Strategy:       ${(doc.metadata as Record<string,unknown>)["scrapeStrategy"]}`);
  console.log(`  Fetched in:     ${elapsed}ms`);

  // ── Content stats ─────────────────────────────────────────────────────────
  const lines = doc.text.split("\n");
  const headings   = lines.filter((l) => /^#{1,6}\s/.test(l));
  const tableRows  = lines.filter((l) => l.startsWith("|"));
  const codeBlocks = Math.round((doc.text.match(/```/g) ?? []).length / 2);
  const listItems  = lines.filter((l) => /^(\s*[-*]|\s*\d+\.)/.test(l));
  const links      = (doc.text.match(/\[.+?\]\(.+?\)/g) ?? []).length;

  console.log("\n📊 CONTENT STATISTICS");
  console.log(`  Total chars:    ${doc.text.length.toLocaleString()}`);
  console.log(`  Total lines:    ${lines.length.toLocaleString()}`);
  console.log(`  Headings:       ${headings.length}  (${headings.slice(0, 4).map((h) => h.slice(0, 40)).join(", ")}${headings.length > 4 ? "…" : ""})`);
  console.log(`  Table rows:     ${tableRows.length}`);
  console.log(`  Code blocks:    ${codeBlocks}`);
  console.log(`  List items:     ${listItems.length}`);
  console.log(`  Links:          ${links}`);

  // ── Preview ───────────────────────────────────────────────────────────────
  console.log("\n📄 CONTENT PREVIEW (first 2500 chars)");
  console.log(DIVIDER);
  console.log(doc.text.slice(0, 2500));
  if (doc.text.length > 2500) {
    console.log(`\n... [${(doc.text.length - 2500).toLocaleString()} more chars]`);
  }

  if (showFull) {
    console.log("\n📄 FULL CONTENT");
    console.log(DIVIDER);
    console.log(doc.text);
  }

  // ── Quality checks ────────────────────────────────────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log("✅ QUALITY CHECKS");

  const checks: [string, boolean, string][] = [
    ["Has content (>200 chars)",      doc.text.length > 200,         `${doc.text.length} chars`],
    ["Has headings",                  headings.length > 0,            `${headings.length} found`],
    ["No raw <script> tags",          !doc.text.includes("<script"),  "clean"],
    ["No raw <style> tags",           !doc.text.includes("<style"),   "clean"],
    ["No raw HTML attributes",        !doc.text.includes(' class="'), "clean"],
    ["No nav/footer noise",           !doc.text.includes("©"),        "clean"],
    ["Strategy recorded",             !!(doc.metadata as Record<string,unknown>)["scrapeStrategy"],
      String((doc.metadata as Record<string,unknown>)["scrapeStrategy"])],
  ];

  let passed = 0;
  for (const [name, ok, detail] of checks) {
    const icon = ok ? "  ✅" : "  ❌";
    console.log(`${icon} ${name.padEnd(38)} ${detail}`);
    if (ok) passed++;
  }

  console.log(`\n   ${passed}/${checks.length} checks passed`);
  console.log(DIVIDER + "\n");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
