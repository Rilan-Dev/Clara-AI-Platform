#!/usr/bin/env tsx
/**
 * scripts/test-crawl.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Test the URL discovery crawler against any website.
 *
 * Usage:
 *   npx tsx scripts/test-crawl.ts <url> [options]
 *
 * Key options:
 *   --max-depth=N      BFS depth (default: 3)
 *   --max-urls=N       Hard cap on URLs (default: 200)
 *   --delay=N          ms between requests (default: 300)
 *   --no-sitemap       Skip sitemap.xml fast-path
 *   --no-robots        Ignore robots.txt
 *   --whole-site       Crawl entire domain, not just the input path prefix
 *
 * Quick test examples:
 *   npx tsx scripts/test-crawl.ts https://vite.dev/guide/
 *   npx tsx scripts/test-crawl.ts https://vitejs.dev/guide/
 *   npx tsx scripts/test-crawl.ts https://nextjs.org/docs --max-depth=1
 *   npx tsx scripts/test-crawl.ts https://books.toscrape.com --max-urls=30
 *   npx tsx scripts/test-crawl.ts https://docs.djangoproject.com/en/5.0/ --max-urls=50
 */

import { crawlWebsite, type CrawlOptions, type DiscoveredUrl } from "../src/modules/ingest/crawlers";

const D = "─".repeat(70);

function arg(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

async function main() {
  const argv  = process.argv.slice(2);
  const url   = argv.find(a => !a.startsWith("--"));
  const flags: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    flags[k!] = v !== undefined ? v : true;
  }

  if (!url) {
    console.log(`
Usage: npx tsx scripts/test-crawl.ts <url> [--max-depth=N] [--max-urls=N]
                                            [--delay=N] [--no-sitemap]
                                            [--no-robots] [--whole-site]

Examples:
  npx tsx scripts/test-crawl.ts https://vite.dev/guide/
  npx tsx scripts/test-crawl.ts https://vitejs.dev/guide/ --max-depth=2
  npx tsx scripts/test-crawl.ts https://books.toscrape.com --max-urls=30
`);
    process.exit(1);
  }

  try { new URL(url); } catch { console.error(`❌ Invalid URL: ${url}`); process.exit(1); }

  const opts: CrawlOptions = {
    maxDepth:        parseInt(arg(flags,"max-depth") ?? "3"),
    maxUrls:         parseInt(arg(flags,"max-urls")  ?? "200"),
    requestDelayMs:  parseInt(arg(flags,"delay")     ?? "300"),
    parseSitemap:    !flags["no-sitemap"],
    respectRobotsTxt: !flags["no-robots"],
    scopeToInputPath: !flags["whole-site"],
    onUrlDiscovered: (d: DiscoveredUrl) => {
      const icon  = d.status === "discovered" ? "  ✅" : "  ❌";
      const chars = d.contentLength > 0 ? ` (${d.contentLength.toLocaleString()} chars)` : "";
      console.log(`${icon} [D${d.depth}] ${d.title.slice(0, 60).padEnd(61)}${chars}`);
      console.log(`         ${d.url}`);
    },
    onProgress: p => {
      process.stdout.write(`\r  📊 visited:${p.crawledCount}  queued:${p.queuedCount}  found:${p.totalDiscovered}   `);
    },
  };

  console.log(`\n${D}`);
  console.log(`🕷️  Crawling: ${url}`);
  console.log(`   depth=${opts.maxDepth}  maxUrls=${opts.maxUrls}  delay=${opts.requestDelayMs}ms`);
  console.log(`   sitemap=${opts.parseSitemap}  robots=${opts.respectRobotsTxt}  scoped=${opts.scopeToInputPath}`);
  console.log(`${D}\n`);

  const result = await crawlWebsite(url, opts);
  console.log(); // clear progress line

  // ── Summary ──────────────────────────────────────────────────────────────────
  const ok  = result.discoveredUrls.filter(u => u.status === "discovered");
  const err = result.discoveredUrls.filter(u => u.status === "error");

  console.log(`\n${D}`);
  console.log(`📋 SUMMARY`);
  console.log(`${D}`);
  console.log(`  Root URL:    ${result.rootUrl}`);
  console.log(`  Path scope:  ${result.pathPrefix === "/" ? "(entire site)" : result.pathPrefix + "*"}`);
  console.log(`  Discovered:  ${ok.length} pages`);
  console.log(`  Errors:      ${err.length}`);
  console.log(`  Duration:    ${(result.crawlDurationMs / 1000).toFixed(1)}s`);

  // Depth breakdown
  const byDepth = new Map<number, number>();
  for (const u of ok) byDepth.set(u.depth, (byDepth.get(u.depth) ?? 0) + 1);
  console.log(`\n  Depth breakdown:`);
  for (const [d, n] of [...byDepth.entries()].sort((a,b) => a[0]-b[0]))
    console.log(`    D${d}: ${n} page(s)`);

  if (err.length > 0) {
    console.log(`\n  Errors (first 5):`);
    for (const e of err.slice(0, 5)) console.log(`    ❌ ${e.url}\n       ${e.errorMessage}`);
    if (err.length > 5) console.log(`    ... and ${err.length - 5} more`);
  }

  // Full URL list
  console.log(`\n${D}`);
  console.log(`📝 ALL DISCOVERED URLs (${ok.length}):`);
  console.log(`${D}`);
  for (const u of ok) console.log(`  ${u.url}`);

  // Quality checks
  console.log(`\n${D}`);
  console.log(`✅ QUALITY CHECKS`);
  const inputUrlObj = new URL(url);
  const prefix      = result.pathPrefix;
  const checks: [string, boolean, string][] = [
    ["At least 1 page found",          ok.length >= 1,       `${ok.length} found`],
    ["No .css/.js/.png in results",    !ok.some(u => /\.(css|js|mjs|png|jpg|gif|svg|woff)$/i.test(new URL(u.url).pathname)), "clean"],
    ["All URLs are http(s)",           ok.every(u => /^https?:\/\//.test(u.url)), "✅"],
    ["All URLs match path prefix",     prefix === "/" || ok.every(u => { try { const p = new URL(u.url).pathname; return (p+"/").startsWith(prefix); } catch { return false; } }), prefix],
    ["Success rate ≥ 80%",             result.discoveredUrls.length === 0 || ok.length / result.discoveredUrls.length >= 0.8, `${ok.length}/${result.discoveredUrls.length}`],
    ["Finished under 3 minutes",       result.crawlDurationMs < 180_000, `${(result.crawlDurationMs/1000).toFixed(0)}s`],
  ];

  let passed = 0;
  for (const [name, pass, detail] of checks) {
    console.log(`  ${pass ? "✅" : "❌"} ${name.padEnd(38)} ${detail}`);
    if (pass) passed++;
  }
  console.log(`\n  ${passed}/${checks.length} checks passed`);
  console.log(`${D}\n`);
}

main().catch(e => { console.error("\n❌ Fatal:", e.message); process.exit(1); });
