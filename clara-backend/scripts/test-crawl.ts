#!/usr/bin/env tsx

/**
 * scripts/test-crawl.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Test script to validate the web crawler module.
 *
 * Usage:
 *   npx tsx scripts/test-crawl.ts <url> [--max-depth=N] [--max-urls=N] [--delay=N]
 *
 * Examples:
 *   npx tsx scripts/test-crawl.ts https://example.com
 *   npx tsx scripts/test-crawl.ts https://vitejs.dev --max-depth=2 --max-urls=50
 *   npx tsx scripts/test-crawl.ts https://nextjs.org/docs --max-depth=1
 */

import { crawlWebsite, type CrawlOptions, type DiscoveredUrl } from "../src/modules/ingest/crawlers";

function parseArgs() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  const flags: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (key && value) flags[key] = value;
    }
  }

  return { url, flags };
}

function printUsage() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  Clara Web Crawler Test Script                                      ║
║  Discovers all sub-URLs from a given root URL                       ║
╚══════════════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/test-crawl.ts <url> [options]

Options:
  --max-depth=N     Maximum crawl depth (default: 2)
  --max-urls=N      Maximum URLs to discover (default: 50)
  --delay=N         Delay between requests in ms (default: 500)
  --no-sitemap      Skip sitemap.xml parsing
  --no-robots       Ignore robots.txt

Examples:
  npx tsx scripts/test-crawl.ts https://example.com
  npx tsx scripts/test-crawl.ts https://vitejs.dev --max-depth=2 --max-urls=50
  npx tsx scripts/test-crawl.ts https://docs.djangoproject.com --max-depth=1
`);
}

async function main() {
  const { url, flags } = parseArgs();

  if (!url) {
    printUsage();
    process.exit(1);
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    console.error(`❌ Invalid URL: ${url}`);
    process.exit(1);
  }

  const options: CrawlOptions = {
    maxDepth: flags["max-depth"] ? parseInt(flags["max-depth"], 10) : 2,
    maxUrls: flags["max-urls"] ? parseInt(flags["max-urls"], 10) : 50,
    requestDelayMs: flags["delay"] ? parseInt(flags["delay"], 10) : 500,
    parseSitemap: flags["no-sitemap"] !== "",
    respectRobotsTxt: flags["no-robots"] !== "",
    onUrlDiscovered: (discovered: DiscoveredUrl) => {
      const icon = discovered.status === "discovered" ? "✅" : "❌";
      const depth = `[D${discovered.depth}]`;
      const size = `(${discovered.contentLength} chars)`;
      console.log(`  ${icon} ${depth} ${size} ${discovered.title}`);
      console.log(`     └─ ${discovered.url}`);
    },
    onProgress: (progress) => {
      process.stdout.write(
        `\r  📊 Crawled: ${progress.crawledCount} | Queued: ${progress.queuedCount} | Discovered: ${progress.totalDiscovered}  `
      );
    },
  };

  console.log(`\n🕷️  Starting crawl of: ${url}`);
  console.log(`   Max Depth: ${options.maxDepth}`);
  console.log(`   Max URLs: ${options.maxUrls}`);
  console.log(`   Request Delay: ${options.requestDelayMs}ms`);
  console.log(`   Sitemap: ${options.parseSitemap ? "Yes" : "No"}`);
  console.log(`   Robots.txt: ${options.respectRobotsTxt ? "Respected" : "Ignored"}`);
  console.log(`${"─".repeat(70)}\n`);

  const result = await crawlWebsite(url, options);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`\n📋 Crawl Summary:`);
  console.log(`   Root URL:       ${result.rootUrl}`);
  console.log(`   Total Discovered: ${result.discoveredUrls.length}`);
  console.log(`   Successful:     ${result.totalPages}`);
  console.log(`   Errors:         ${result.errors.length}`);
  console.log(`   Duration:       ${(result.crawlDurationMs / 1000).toFixed(1)}s`);

  // Group by depth
  const byDepth = new Map<number, DiscoveredUrl[]>();
  for (const u of result.discoveredUrls) {
    const list = byDepth.get(u.depth) ?? [];
    list.push(u);
    byDepth.set(u.depth, list);
  }

  console.log(`\n📊 URLs by Depth:`);
  for (const [depth, urls] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    const successful = urls.filter((u) => u.status === "discovered").length;
    const failed = urls.filter((u) => u.status === "error").length;
    console.log(`   Depth ${depth}: ${urls.length} URLs (${successful} ok, ${failed} errors)`);
  }

  if (result.errors.length > 0) {
    console.log(`\n⚠️  Errors:`);
    for (const err of result.errors.slice(0, 10)) {
      console.log(`   D${err.depth} ${err.url}`);
      console.log(`     └─ ${err.message}`);
    }
    if (result.errors.length > 10) {
      console.log(`   ... and ${result.errors.length - 10} more errors`);
    }
  }

  // Output all discovered URLs as a clean list
  console.log(`\n📝 All Discovered URLs:`);
  for (const u of result.discoveredUrls) {
    if (u.status === "discovered") {
      console.log(`   ${u.url}`);
    }
  }

  console.log(`\n✅ Done!`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
