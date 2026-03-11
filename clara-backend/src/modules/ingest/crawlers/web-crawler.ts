/**
 * src/modules/ingest/crawlers/web-crawler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal website crawler — discovers all sub-URLs from a root URL.
 *
 * Strategy:
 *   1. HTTP fetch first (fast/cheap)
 *   2. Playwright fallback for JS-rendered SPAs (if content is thin)
 *   3. BFS traversal with configurable max depth
 *   4. Same-domain filtering + URL normalization + deduplication
 *   5. robots.txt respect + rate limiting
 *   6. Optional sitemap.xml parsing for additional URL discovery
 *
 * Works with: static HTML, Next.js, Vite, Django, ASP.NET, PHP, any web tech.
 */

import { load as loadHtml, type CheerioAPI } from "cheerio";
import {
  fetchRobotsTxt,
  isUrlAllowed,
  type RobotsRules,
} from "./robots-parser";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrawlOptions = {
  /** Maximum depth to crawl (0 = root only). Default: 3 */
  maxDepth?: number;
  /** Max concurrent page fetches. Default: 3 */
  concurrency?: number;
  /** Delay in ms between requests to the same domain. Default: 500 */
  requestDelayMs?: number;
  /** Per-page fetch timeout in ms. Default: 15000 */
  pageTimeoutMs?: number;
  /** Maximum total URLs to discover. Default: 200 */
  maxUrls?: number;
  /** Whether to respect robots.txt. Default: true */
  respectRobotsTxt?: boolean;
  /** Whether to also parse sitemap.xml for URL discovery. Default: true */
  parseSitemap?: boolean;
  /** Exclude URL patterns (glob-like). Default: common non-content paths */
  excludePatterns?: string[];
  /** Callback fired when a new URL is discovered */
  onUrlDiscovered?: (url: DiscoveredUrl) => void;
  /** Callback fired on crawl progress */
  onProgress?: (progress: CrawlProgress) => void;
};

export type DiscoveredUrl = {
  url: string;
  title: string;
  depth: number;
  parentUrl: string | null;
  contentLength: number;
  status: "discovered" | "error";
  errorMessage?: string;
};

export type CrawlError = {
  url: string;
  message: string;
  depth: number;
};

export type CrawlProgress = {
  crawledCount: number;
  queuedCount: number;
  totalDiscovered: number;
};

export type CrawlResult = {
  rootUrl: string;
  discoveredUrls: DiscoveredUrl[];
  totalPages: number;
  crawlDurationMs: number;
  errors: CrawlError[];
};

// ── Default exclusion patterns ────────────────────────────────────────────────

const DEFAULT_EXCLUDE_PATTERNS = [
  // Auth / session
  "/login", "/logout", "/signup", "/register", "/auth/",
  "/signin", "/signout", "/reset-password", "/forgot-password",
  // API / data endpoints
  "/api/", "/_next/", "/_nuxt/", "/__",
  // Assets
  ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg",
  ".ico", ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mp3", ".webm",
  // Admin / internal
  "/admin/", "/wp-admin/", "/wp-json/",
  // Social / share
  "/share", "/print",
  // Pagination with high numbers (likely infinite)
  // Feed / RSS
  "/feed", "/rss", ".xml",
];

// ── URL Utilities ─────────────────────────────────────────────────────────────

/**
 * Extracts the base domain from a URL for same-domain comparison.
 * Handles www/non-www as equivalent.
 */
function getBaseDomain(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

/**
 * Normalizes a URL for deduplication:
 * - Strips fragment (#...)
 * - Strips trailing slashes (except root)
 * - Lowercases hostname
 * - Sorts query params
 */
function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.hash = "";

    // Sort query params for consistency
    const params = new URLSearchParams(url.searchParams);
    const sortedParams = new URLSearchParams(
      [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    );
    url.search = sortedParams.toString() ? `?${sortedParams.toString()}` : "";

    // Remove trailing slash (but keep root "/")
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    url.pathname = pathname;

    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Checks if a URL should be excluded based on pattern matching.
 */
function shouldExcludeUrl(
  url: string,
  excludePatterns: string[]
): boolean {
  const lowerUrl = url.toLowerCase();
  return excludePatterns.some((pattern) =>
    lowerUrl.includes(pattern.toLowerCase())
  );
}

/**
 * Resolves a potentially relative href to an absolute URL
 * relative to the current page URL.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    // Skip non-HTTP links
    if (
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:") ||
      href.startsWith("data:") ||
      href.startsWith("blob:")
    ) {
      return null;
    }
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

// ── HTML Fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch raw HTML via HTTP.
 */
async function fetchHtml(
  url: string,
  timeoutMs: number
): Promise<{ html: string; ok: boolean; statusCode: number }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ClaraKnowledgeBot/1.0; +https://clara.ai/bot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return { html: "", ok: false, statusCode: res.status };
    }

    // Only process HTML responses
    const contentType = res.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return { html: "", ok: false, statusCode: res.status };
    }

    const html = await res.text();
    return { html, ok: true, statusCode: res.status };
  } catch {
    return { html: "", ok: false, statusCode: 0 };
  }
}

/**
 * Render a page with Playwright for JS-heavy SPAs.
 * Returns null if Playwright is not available.
 */
async function renderWithPlaywright(
  url: string,
  timeoutMs: number
): Promise<string | null> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: timeoutMs,
      });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn(
      `[web-crawler] Playwright render failed for ${url}:`,
      (err as Error).message
    );
    return null;
  }
}

// ── Link Extraction ───────────────────────────────────────────────────────────

/**
 * Extracts all <a href> links from parsed HTML.
 */
function extractLinks(
  $: CheerioAPI,
  pageUrl: string,
  targetDomain: string,
  excludePatterns: string[]
): string[] {
  const links: Set<string> = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const resolved = resolveUrl(href, pageUrl);
    if (!resolved) return;

    try {
      const resolvedUrl = new URL(resolved);

      // Same-domain check
      if (getBaseDomain(resolvedUrl) !== targetDomain) return;

      // HTTP(S) only
      if (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:") return;

      const normalized = normalizeUrl(resolved);

      // Exclude patterns
      if (shouldExcludeUrl(normalized, excludePatterns)) return;

      links.add(normalized);
    } catch {
      // Invalid URL — skip
    }
  });

  return [...links];
}

/**
 * Extracts the page title from HTML.
 */
function extractTitle($: CheerioAPI): string {
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  if (ogTitle) return ogTitle;

  const h1 = $("h1").first().text().trim();
  if (h1) return h1;

  const headTitle = $("title").first().text().trim();
  if (headTitle) return headTitle;

  return "Untitled Page";
}

/**
 * Estimates meaningful content length (strips nav, boilerplate).
 */
function estimateContentLength($: CheerioAPI): number {
  // Remove non-content elements for size estimation
  const clone = loadHtml($.html() ?? "");
  clone("script, style, noscript, nav, footer, header, iframe, svg").remove();

  const candidateRoots = clone("article, main, [role='main']");
  const root =
    candidateRoots.length > 0 ? candidateRoots.first() : clone("body");

  return root.text().replace(/\s+/g, " ").trim().length;
}

// ── Sitemap.xml Parsing ───────────────────────────────────────────────────────

/**
 * Parses sitemap.xml to discover additional URLs.
 */
async function parseSitemap(
  origin: string,
  sitemapUrls: string[],
  targetDomain: string,
  excludePatterns: string[],
  timeoutMs: number
): Promise<string[]> {
  const urls: Set<string> = new Set();

  // Try default sitemap URL if none provided
  const sitemapsToTry =
    sitemapUrls.length > 0
      ? sitemapUrls
      : [`${origin}/sitemap.xml`];

  for (const sitemapUrl of sitemapsToTry) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { "User-Agent": "ClaraKnowledgeBot/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) continue;

      const xml = await res.text();
      const $ = loadHtml(xml, { xmlMode: true });

      // Handle sitemap index (points to other sitemaps)
      $("sitemap > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) sitemapsToTry.push(loc); // recurse into sub-sitemaps
      });

      // Extract URLs from <url><loc>...</loc></url>
      $("url > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (!loc) return;

        try {
          const locUrl = new URL(loc);
          if (getBaseDomain(locUrl) !== targetDomain) return;

          const normalized = normalizeUrl(loc);
          if (shouldExcludeUrl(normalized, excludePatterns)) return;

          urls.add(normalized);
        } catch {
          // Invalid URL — skip
        }
      });
    } catch {
      console.warn(`[web-crawler] Could not fetch sitemap: ${sitemapUrl}`);
    }
  }

  return [...urls];
}

// ── Concurrency Helper ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple concurrency pool for controlled parallel execution.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        await fn(item);
      }
    }
  });
  await Promise.all(workers);
}

// ── Main Crawl Engine ─────────────────────────────────────────────────────────

/**
 * Crawls a website starting from `rootUrl`, discovering all same-domain sub-URLs.
 *
 * Works with ANY web technology: static HTML, Next.js, Vite, Django, ASP.NET, etc.
 * Falls back to Playwright rendering for JS-heavy SPAs when HTTP fetch yields thin content.
 */
export async function crawlWebsite(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const {
    maxDepth = 3,
    concurrency = 3,
    requestDelayMs = 500,
    pageTimeoutMs = 15_000,
    maxUrls = 200,
    respectRobotsTxt = true,
    parseSitemap: shouldParseSitemap = true,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    onUrlDiscovered,
    onProgress,
  } = options;

  const startTime = Date.now();
  const rootUrlObj = new URL(rootUrl);
  const targetDomain = getBaseDomain(rootUrlObj);
  const origin = rootUrlObj.origin;

  // ── Robots.txt ──────────────────────────────────────────────────────────
  let robotsRules: RobotsRules | null = null;
  if (respectRobotsTxt) {
    robotsRules = await fetchRobotsTxt(origin);
    if (robotsRules?.crawlDelay) {
      console.log(
        `[web-crawler] robots.txt crawl-delay: ${robotsRules.crawlDelay}s`
      );
    }
  }

  // ── State ───────────────────────────────────────────────────────────────
  const visited = new Set<string>();
  const discoveredUrls: DiscoveredUrl[] = [];
  const errors: CrawlError[] = [];

  // BFS queue: [url, depth, parentUrl]
  type QueueItem = { url: string; depth: number; parentUrl: string | null };
  const queue: QueueItem[] = [];
  let lastRequestTime = 0;

  // ── Rate limiter ────────────────────────────────────────────────────────
  const effectiveDelay = robotsRules?.crawlDelay
    ? Math.max(requestDelayMs, robotsRules.crawlDelay * 1000)
    : requestDelayMs;

  async function rateLimitedDelay(): Promise<void> {
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < effectiveDelay) {
      await sleep(effectiveDelay - elapsed);
    }
    lastRequestTime = Date.now();
  }

  // ── Process a single URL ───────────────────────────────────────────────
  async function processUrl(item: QueueItem): Promise<string[]> {
    const { url, depth, parentUrl } = item;
    const normalizedUrl = normalizeUrl(url);

    if (visited.has(normalizedUrl)) return [];
    if (discoveredUrls.length >= maxUrls) return [];

    visited.add(normalizedUrl);

    // robots.txt check
    try {
      const urlObj = new URL(normalizedUrl);
      if (!isUrlAllowed(urlObj.pathname, robotsRules)) {
        console.log(`[web-crawler] blocked by robots.txt: ${normalizedUrl}`);
        return [];
      }
    } catch {
      return [];
    }

    await rateLimitedDelay();

    // Fetch HTML (HTTP first)
    let { html, ok } = await fetchHtml(normalizedUrl, pageTimeoutMs);

    if (!ok || !html) {
      // Try Playwright for non-responsive pages
      const rendered = await renderWithPlaywright(normalizedUrl, pageTimeoutMs);
      if (rendered) {
        html = rendered;
        ok = true;
      }
    }

    if (!ok || !html) {
      const err: CrawlError = {
        url: normalizedUrl,
        message: "Failed to fetch page content",
        depth,
      };
      errors.push(err);

      const discovered: DiscoveredUrl = {
        url: normalizedUrl,
        title: "Error: Could not fetch",
        depth,
        parentUrl,
        contentLength: 0,
        status: "error",
        errorMessage: err.message,
      };
      discoveredUrls.push(discovered);
      onUrlDiscovered?.(discovered);
      return [];
    }

    const $ = loadHtml(html);
    const title = extractTitle($);
    let contentLength = estimateContentLength($);

    // If content is thin via HTTP fetch, try Playwright
    if (contentLength < 200 && html === (await fetchHtml(normalizedUrl, pageTimeoutMs)).html) {
      const rendered = await renderWithPlaywright(normalizedUrl, pageTimeoutMs);
      if (rendered) {
        const $rendered = loadHtml(rendered);
        const renderedLength = estimateContentLength($rendered);
        if (renderedLength > contentLength) {
          // Use Playwright-rendered content for link extraction too
          const renderedLinks = extractLinks(
            $rendered,
            normalizedUrl,
            targetDomain,
            excludePatterns
          );
          contentLength = renderedLength;

          const discovered: DiscoveredUrl = {
            url: normalizedUrl,
            title: extractTitle($rendered),
            depth,
            parentUrl,
            contentLength: renderedLength,
            status: "discovered",
          };
          discoveredUrls.push(discovered);
          onUrlDiscovered?.(discovered);

          onProgress?.({
            crawledCount: visited.size,
            queuedCount: queue.length,
            totalDiscovered: discoveredUrls.length,
          });

          return renderedLinks;
        }
      }
    }

    const discovered: DiscoveredUrl = {
      url: normalizedUrl,
      title,
      depth,
      parentUrl,
      contentLength,
      status: "discovered",
    };
    discoveredUrls.push(discovered);
    onUrlDiscovered?.(discovered);

    onProgress?.({
      crawledCount: visited.size,
      queuedCount: queue.length,
      totalDiscovered: discoveredUrls.length,
    });

    // Extract links for next depth level
    if (depth < maxDepth) {
      return extractLinks($, normalizedUrl, targetDomain, excludePatterns);
    }

    return [];
  }

  // ── BFS Crawl ──────────────────────────────────────────────────────────

  console.log(
    `[web-crawler] Starting crawl of ${rootUrl} (maxDepth=${maxDepth}, maxUrls=${maxUrls})`
  );

  // Seed the queue with the root URL
  queue.push({ url: normalizeUrl(rootUrl), depth: 0, parentUrl: null });

  // If sitemap parsing is enabled, add sitemap URLs
  if (shouldParseSitemap) {
    try {
      const sitemapUrls = await parseSitemap(
        origin,
        robotsRules?.sitemaps ?? [],
        targetDomain,
        excludePatterns,
        pageTimeoutMs
      );
      for (const sitemapUrl of sitemapUrls) {
        if (!visited.has(sitemapUrl) && discoveredUrls.length < maxUrls) {
          queue.push({ url: sitemapUrl, depth: 1, parentUrl: rootUrl });
        }
      }
      if (sitemapUrls.length > 0) {
        console.log(
          `[web-crawler] Found ${sitemapUrls.length} URLs from sitemap.xml`
        );
      }
    } catch {
      console.warn("[web-crawler] sitemap.xml parsing failed, continuing with link crawling");
    }
  }

  // BFS by depth level
  let currentDepth = 0;
  while (currentDepth <= maxDepth && queue.length > 0 && discoveredUrls.length < maxUrls) {
    // Get all items at the current depth
    const currentLevelItems = queue.filter((q) => q.depth === currentDepth);
    // Remove them from queue
    const remaining = queue.filter((q) => q.depth !== currentDepth);
    queue.length = 0;
    queue.push(...remaining);

    if (currentLevelItems.length === 0) {
      currentDepth++;
      continue;
    }

    console.log(
      `[web-crawler] Depth ${currentDepth}: processing ${currentLevelItems.length} URLs`
    );

    // Process URLs at this depth level with concurrency control
    const newLinks: string[] = [];

    await runWithConcurrency(currentLevelItems, concurrency, async (item) => {
      if (discoveredUrls.length >= maxUrls) return;
      const links = await processUrl(item);
      newLinks.push(...links);
    });

    // Add newly discovered links to queue for next depth level
    for (const link of newLinks) {
      const normalized = normalizeUrl(link);
      if (!visited.has(normalized) && discoveredUrls.length + queue.length < maxUrls) {
        queue.push({
          url: normalized,
          depth: currentDepth + 1,
          parentUrl: currentLevelItems[0]?.url ?? rootUrl,
        });
      }
    }

    currentDepth++;
  }

  const crawlDurationMs = Date.now() - startTime;

  console.log(
    `[web-crawler] ✅ Crawl complete: ${discoveredUrls.length} URLs discovered, ` +
    `${errors.length} errors, ${crawlDurationMs}ms`
  );

  return {
    rootUrl: normalizeUrl(rootUrl),
    discoveredUrls,
    totalPages: discoveredUrls.filter((u) => u.status === "discovered").length,
    crawlDurationMs,
    errors,
  };
}
