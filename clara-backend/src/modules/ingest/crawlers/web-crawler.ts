/**
 * src/modules/ingest/crawlers/web-crawler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal website crawler — discovers all sub-URLs from a root URL.
 *
 * Design goals:
 *   1. Works with ANY web stack: static HTML, VitePress, Next.js, Django, etc.
 *   2. Path-prefix scoping: https://vite.dev/guide/ → finds ONLY /guide/* pages
 *   3. Redirect-safe: tracks final URL after redirects so domain-filter never
 *      drops links that are absolute to the real (redirected) domain
 *   4. Sitemap-first: pulls ALL matching URLs instantly for sites with sitemaps
 *   5. BFS link crawling: follows <a href> for sites without sitemaps
 *   6. Playwright fallback: shared browser pool + networkidle wait for SPAs
 *   7. Correct extension exclusion: endsWith check, never substring includes
 *   8. Deduplication: normalizeUrl + visited/queued sets prevent re-crawling
 *   9. Filter-param deduplication: ?category=X URLs skipped (duplicate content)
 */

import { load as loadHtml, type CheerioAPI } from "cheerio";
import { fetchRobotsTxt, isUrlAllowed, type RobotsRules } from "./robots-parser";

// ── Public types ──────────────────────────────────────────────────────────────

export type CrawlOptions = {
  /** BFS depth from root. Default: 3 */
  maxDepth?: number;
  /** Max concurrent fetches. Default: 3 */
  concurrency?: number;
  /** ms between requests. Default: 300 */
  requestDelayMs?: number;
  /** Per-page fetch timeout ms. Default: 45000 */
  pageTimeoutMs?: number;
  /** Maximum URLs to discover. Default: 500 */
  maxUrls?: number;
  /** Respect robots.txt. Default: true */
  respectRobotsTxt?: boolean;
  /** Use sitemap.xml for fast discovery. Default: true */
  parseSitemap?: boolean;
  /**
   * Scope to input path prefix (default: true).
   *   https://vite.dev/guide/  → only /guide/* pages
   *   https://vite.dev/        → entire site (prefix = "/")
   */
  scopeToInputPath?: boolean;
  onUrlDiscovered?: (url: DiscoveredUrl) => void;
  onProgress?: (progress: CrawlProgress) => void;
  shouldAbort?: () => Promise<boolean> | boolean;
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

export type CrawlError    = { url: string; message: string; depth: number };
export type CrawlProgress = { crawledCount: number; queuedCount: number; totalDiscovered: number };

export type CrawlResult = {
  rootUrl: string;
  /** Path prefix used to scope the crawl e.g. "/guide/" */
  pathPrefix: string;
  discoveredUrls: DiscoveredUrl[];
  totalPages: number;
  crawlDurationMs: number;
  errors: CrawlError[];
};

// ── Asset extensions ──────────────────────────────────────────────────────────
// Checked via endsWith on the last path segment — NEVER via substring includes.
// This prevents "/guide/api-javascript" from being blocked by a ".js" rule.

const ASSET_EXTENSIONS = new Set([
  "css", "js", "mjs", "cjs",
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "tiff",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "tar", "gz", "7z", "rar", "tgz",
  "mp4", "mp3", "webm", "ogg", "avi", "mov",
  "map", "br", "zst", "pdf",
]);

// ── Path exclusions ───────────────────────────────────────────────────────────
// Checked via pathname.startsWith — NOT via pathname.includes.

const EXCLUDE_PATH_PREFIXES = [
  "/login", "/logout", "/signup", "/register",
  "/auth/", "/signin", "/signout",
  "/reset-password", "/forgot-password",
  "/_next/", "/_nuxt/", "/__/",
  "/cdn-cgi/",
  "/wp-admin/", "/wp-json/", "/wp-content/uploads/",
  "/feed", "/rss", "/atom",
  "/print", "/share",
  "/checkout", "/cart",
];

// ── Filter-only query param exclusion ─────────────────────────────────────────
//
// Sites like exceliya.edu.sa expose the same content at both:
//   /courses                             ← canonical listing page (crawled)
//   /courses?category=cyber-security     ← filtered subset (duplicate — skipped)
//
// Rule: if ALL query params belong to the known UI-filter set, skip the URL.
// A URL mixing filter params with meaningful params (e.g. ?category=X&id=Y) is kept.

const FILTER_ONLY_PARAMS = new Set([
  "category", "tag", "tags", "filter", "filters",
  "sort", "order", "dir", "direction",
  "page", "p", "pg", "per_page", "limit", "offset",
  "view", "tab", "type", "status",
  "lang", "locale", "currency",
  "q", "search",
]);

function isFilterOnlyUrl(urlStr: string): boolean {
  try {
    const keys = [...new URL(urlStr).searchParams.keys()];
    if (keys.length === 0) return false;
    return keys.every(k => FILTER_ONLY_PARAMS.has(k.toLowerCase()));
  } catch { return false; }
}

// ── URL utilities ─────────────────────────────────────────────────────────────

/** Strips www., lowercases host. www.vite.dev === vite.dev */
function normHost(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.hash  = "";
    const TRACKING = [
      "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
      "ref","fbclid","gclid","msclkid",
    ];
    const p = new URLSearchParams(url.searchParams);
    for (const t of TRACKING) p.delete(t);
    const sorted = new URLSearchParams([...p.entries()].sort(([a],[b]) => a.localeCompare(b)));
    url.search = sorted.toString() ? `?${sorted}` : "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/"))
      url.pathname = url.pathname.slice(0, -1);
    if (url.pathname.endsWith("/index.html"))
      url.pathname = url.pathname.slice(0, -"/index.html".length) || "/";
    return url.toString();
  } catch { return urlStr; }
}

/**
 * True if this URL should be skipped entirely.
 * Checks (in order):
 *   1. Asset extension (endsWith on last path segment only)
 *   2. Excluded path prefix (startsWith, not includes)
 *   3. Filter-only query params (?category=X style duplicates)
 */
function shouldExclude(urlStr: string): boolean {
  try {
    const url  = new URL(urlStr);
    const path = url.pathname.toLowerCase();
    const last = path.split("/").pop() ?? "";

    // 1. Asset extension — only the LAST segment
    if (last.includes(".")) {
      const ext = last.split(".").pop() ?? "";
      if (ASSET_EXTENSIONS.has(ext)) return true;
    }

    // 2. Excluded path prefixes
    for (const prefix of EXCLUDE_PATH_PREFIXES) {
      if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?"))
        return true;
    }

    // 3. Filter-only query params
    if (isFilterOnlyUrl(urlStr)) return true;

    return false;
  } catch { return true; }
}

function derivePathPrefix(rootUrl: string): string {
  try {
    const url = new URL(rootUrl);
    let path  = url.pathname;
    const last = path.split("/").pop() ?? "";
    if (last.includes(".")) path = path.slice(0, path.lastIndexOf("/") + 1);
    if (!path.endsWith("/")) path += "/";
    return path;
  } catch { return "/"; }
}

function matchesPrefix(urlStr: string, prefix: string): boolean {
  if (prefix === "/") return true;
  try {
    const url  = new URL(urlStr);
    const path = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
    return path.startsWith(prefix);
  } catch { return false; }
}

function resolveHref(href: string, base: string): string | null {
  try {
    if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(href)) return null;
    return new URL(href, base).toString();
  } catch { return null; }
}

// ── HTTP fetch — returns FINAL URL after redirects ────────────────────────────

type FetchResult = { html: string; ok: boolean; finalUrl: string };

async function fetchHtml(url: string, timeoutMs: number): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClaraKnowledgeBot/1.0; +https://clara.ai/bot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const finalUrl = res.url || url;
    if (!res.ok) return { html: "", ok: false, finalUrl };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml"))
      return { html: "", ok: false, finalUrl };
    return { html: await res.text(), ok: true, finalUrl };
  } catch {
    return { html: "", ok: false, finalUrl: url };
  }
}

// ── Shared Playwright browser pool ────────────────────────────────────────────
//
// ONE browser is launched for the entire crawl. Each page gets its own
// isolated BrowserContext, closed immediately after use.
//
// Speed tuning (based on real profiling of exceliya.edu.sa — pure React SPA):
//
//   Old timing per page:  networkidle(10s) + waitForFunction(5s) + settle(500ms)
//     → worst case 15.5s/page × 100 pages / 3 concurrency ≈ 516s
//
//   New timing per page:  networkidle(3s) + waitForFunction(3s) + settle(200ms)
//     → worst case  6.2s/page × 87 real pages / 3 concurrency ≈ 180s  (~3 min)
//
// Why networkidle(3s) is safe:
//   The React app fetches route-specific data from its own API (same-origin).
//   In practice networkidle fires in 1–2s once the API response arrives.
//   3s is a safety net for slow backends, not the common case.

type Browser = import("playwright").Browser;

class PlaywrightPool {
  private browser: Browser | null = null;
  private initialized              = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const playwright = await import("playwright");
      this.browser = await playwright.chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--disable-web-security",
          "--lang=ar,en-US",
        ],
      });
      console.log("[web-crawler] 🌐 Playwright browser started (shared pool)");
    } catch (err) {
      console.warn(`[web-crawler] Playwright unavailable: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  async renderPage(
    url: string,
    timeoutMs: number
  ): Promise<{ html: string; finalUrl: string } | null> {
    if (!this.browser) return null;

    let context: import("playwright").BrowserContext | null = null;
    try {
      context = await this.browser.newContext({
        userAgent: "Mozilla/5.0 (compatible; ClaraKnowledgeBot/1.0; +https://clara.ai/bot)",
        locale:    "ar-SA",
        extraHTTPHeaders: { "Accept-Language": "ar,en-US;q=0.9,en;q=0.8" },
        viewport:         { width: 1280, height: 900 },
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();

      // Block heavy binary assets only — keep stylesheets so React CSS-in-JS works.
      await page.route("**/*", (route) => {
        const rt = route.request().resourceType();
        if (["image", "media", "font"].includes(rt)) route.abort().catch(() => {});
        else route.continue().catch(() => {});
      });

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout:   timeoutMs,
      });

      // ── Phase 1: networkidle (3s timeout) ─────────────────────────────────
      // Waits until ≤500ms of no network activity. For React SPAs this fires
      // once the route-specific API call (course data, blog content) resolves.
      // Timeout cut from 10s → 3s: API responds in <2s in practice.
      await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});

      // ── Phase 2: content threshold (3s timeout) ────────────────────────────
      // After networkidle the component has re-rendered with API data.
      // 300 chars fires immediately on any real page (nav alone ≈ 200 chars).
      await page.waitForFunction(
        () => (document.body?.innerText?.trim().length ?? 0) > 300,
        { timeout: 3_000 }
      ).catch(() => {});

      // ── Phase 3: settle (200ms) ────────────────────────────────────────────
      // Minimal fixed wait for final synchronous re-renders.
      // Reduced from 500ms → 200ms (saves ~30s across 100 pages).
      await page.waitForTimeout(200);

      const html     = await page.content();
      const finalUrl = response?.url() ?? url;
      return { html, finalUrl };
    } catch (err) {
      console.warn(
        `[web-crawler] Playwright failed for ${url}: ${(err as Error).message.split("\n")[0]}`
      );
      return null;
    } finally {
      await context?.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      console.log("[web-crawler] 🌐 Playwright browser closed");
    }
  }

  get available(): boolean { return this.browser !== null; }
}

// ── Content helpers ───────────────────────────────────────────────────────────

/**
 * Estimates meaningful text length after stripping nav/chrome noise.
 * Tries multiple content-area selectors in priority order, falls through
 * to full body — prevents false 0-char readings on pages with empty <main>.
 */
function contentLength($: CheerioAPI): number {
  const clone = loadHtml($.html() ?? "");
  clone("script,style,noscript,nav,footer,header,aside,iframe,svg,button").remove();

  const CONTENT_SELECTORS = [
    "article", "main", "[role='main']",
    ".content", "#content", ".main-content", "#main-content",
    ".page-content", "#page-content", ".post-content",
    ".entry-content", ".docs-content", ".documentation",
  ];

  for (const sel of CONTENT_SELECTORS) {
    try {
      const el = clone(sel).first();
      if (!el.length) continue;
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 80) return text.length;
    } catch { /* invalid selector */ }
  }

  return clone("body").text().replace(/\s+/g, " ").trim().length;
}

/**
 * True when the HTTP response is an SPA shell with no meaningful content.
 * Threshold 300: typical SPA nav+header is 200–400 chars.
 */
function isSpaShell($: CheerioAPI, chars: number): boolean {
  if (chars > 300) return false;
  return !!$("#app,#root,#__next,#__nuxt,[data-app],[data-v-app]").length;
}

function extractTitle($: CheerioAPI): string {
  return (
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    "Untitled Page"
  );
}

// ── Link extraction ───────────────────────────────────────────────────────────

function extractLinks(
  $: CheerioAPI,
  pageUrl: string,
  inputDomain: string,
  redirectedDomain: string,
  pathPrefix: string,
): string[] {
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href     = $(el).attr("href")?.trim();
    if (!href) return;
    const resolved = resolveHref(href, pageUrl);
    if (!resolved) return;

    try {
      const u    = new URL(resolved);
      const host = normHost(u);
      if (host !== inputDomain && host !== redirectedDomain) return;
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      const norm = normalizeUrl(resolved);
      if (shouldExclude(norm)) return;
      if (!matchesPrefix(norm, pathPrefix)) return;
      links.add(norm);
    } catch { /* skip */ }
  });

  return [...links];
}

// ── Sitemap discovery ─────────────────────────────────────────────────────────

async function discoverViaSitemap(
  origin: string,
  pathPrefix: string,
  inputDomain: string,
  redirectedDomain: string,
  robotsSitemaps: string[],
  timeoutMs: number,
): Promise<string[]> {
  const found   = new Set<string>();
  const toFetch = new Set<string>(
    robotsSitemaps.length > 0
      ? robotsSitemaps
      : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]
  );

  for (const sitemapUrl of toFetch) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { "User-Agent": "ClaraKnowledgeBot/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const $   = loadHtml(xml, { xmlMode: true });

      $("sitemap > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && !toFetch.has(loc)) toFetch.add(loc);
      });

      $("url > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (!loc) return;
        try {
          const u    = new URL(loc);
          const host = normHost(u);
          if (host !== inputDomain && host !== redirectedDomain) return;
          if (shouldExclude(loc)) return;
          if (!matchesPrefix(loc, pathPrefix)) return;
          found.add(normalizeUrl(loc));
        } catch { /* skip */ }
      });
    } catch (err) {
      console.warn(
        `[web-crawler] sitemap fetch failed (${sitemapUrl}): ${(err as Error).message.split("\n")[0]}`
      );
    }
  }

  return [...found];
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function concPool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const q = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, q.length) }, async () => {
      while (q.length > 0) {
        const item = q.shift();
        if (item !== undefined) await fn(item);
      }
    })
  );
}

// ── Main crawl engine ─────────────────────────────────────────────────────────

export async function crawlWebsite(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const {
    maxDepth         = 3,
    concurrency      = 3,
    requestDelayMs   = 300,
    pageTimeoutMs    = 45_000,
    maxUrls          = 500,
    respectRobotsTxt = true,
    parseSitemap     = true,
    scopeToInputPath = true,
    onUrlDiscovered,
    onProgress,
    shouldAbort,
  } = options;

  const throwIfAborted = async () => {
    if (await shouldAbort?.()) {
      throw new Error("Crawl cancelled");
    }
  };

  const pwPool = new PlaywrightPool();
  await pwPool.init();

  const t0              = Date.now();
  const rootUrlObj      = new URL(rootUrl);
  const inputDomain     = normHost(rootUrlObj);
  const origin          = rootUrlObj.origin;
  const pathPrefix      = scopeToInputPath ? derivePathPrefix(rootUrl) : "/";
  let   redirectedDomain = inputDomain;

  console.log(`\n[web-crawler] ───────────────────────────────────────────────────`);
  console.log(`[web-crawler] Root:    ${rootUrl}`);
  console.log(`[web-crawler] Domain:  ${inputDomain}`);
  console.log(`[web-crawler] Scope:   ${pathPrefix === "/" ? "(entire site)" : pathPrefix + "*"}`);
  console.log(`[web-crawler] maxDepth=${maxDepth}  maxUrls=${maxUrls}  concurrency=${concurrency}  delay=${requestDelayMs}ms`);

  // ── robots.txt ───────────────────────────────────────────────────────────────
  let robots: RobotsRules | null = null;
  if (respectRobotsTxt) {
    robots = await fetchRobotsTxt(origin);
    if (robots?.crawlDelay)
      console.log(`[web-crawler] robots crawl-delay: ${robots.crawlDelay}s`);
  }
  const effectiveDelay = robots?.crawlDelay
    ? Math.max(requestDelayMs, robots.crawlDelay * 1000)
    : requestDelayMs;

  // ── Step 1: Probe root URL to capture redirect target ────────────────────────
  {
    const probe = await fetchHtml(normalizeUrl(rootUrl), pageTimeoutMs);
    if (probe.finalUrl && probe.finalUrl !== normalizeUrl(rootUrl)) {
      try {
        const fd = normHost(new URL(probe.finalUrl));
        if (fd !== inputDomain) {
          console.log(`[web-crawler] Redirect: ${inputDomain} → ${fd}`);
          redirectedDomain = fd;
        }
      } catch { /* ignore */ }
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  const visited         = new Set<string>();
  const queued          = new Set<string>();
  const discoveredUrls: DiscoveredUrl[] = [];
  const errors:         CrawlError[]   = [];
  let   lastRequest     = 0;

  const rateLimit = async () => {
    const wait = effectiveDelay - (Date.now() - lastRequest);
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
  };

  type QItem = { url: string; depth: number; parent: string | null };
  const bfsQueue: QItem[] = [];

  const enqueue = (url: string, depth: number, parent: string | null) => {
    const n = normalizeUrl(url);
    if (visited.has(n) || queued.has(n)) return;
    if (shouldExclude(n)) return;
    if (!matchesPrefix(n, pathPrefix)) return;
    try {
      const u = new URL(n);
      const h = normHost(u);
      if (h !== inputDomain && h !== redirectedDomain) return;
      if (!isUrlAllowed(u.pathname, robots)) return;
    } catch { return; }
    queued.add(n);
    bfsQueue.push({ url: n, depth, parent });
  };

  // ── Step 2: Sitemap discovery ─────────────────────────────────────────────────
  if (parseSitemap) {
    const origins = [...new Set([
      origin,
      redirectedDomain !== inputDomain ? `https://${redirectedDomain}` : null,
    ].filter(Boolean))] as string[];

    for (const sOrigin of origins) {
      await throwIfAborted();
      const sitemapUrls = await discoverViaSitemap(
        sOrigin, pathPrefix, inputDomain, redirectedDomain,
        robots?.sitemaps ?? [], pageTimeoutMs
      );
      if (sitemapUrls.length > 0) {
        console.log(`[web-crawler] Sitemap (${sOrigin}): ${sitemapUrls.length} URLs under ${pathPrefix}*`);
        for (const su of sitemapUrls) enqueue(su, 1, rootUrl);
        break;
      }
    }
  }

  // ── Step 3: BFS seed ──────────────────────────────────────────────────────────
  enqueue(normalizeUrl(rootUrl), 0, null);

  // ── Process one URL ───────────────────────────────────────────────────────────
  const processUrl = async (item: QItem): Promise<void> => {
    await throwIfAborted();
    if (discoveredUrls.length >= maxUrls) return;
    const { url, depth, parent } = item;
    visited.add(url);
    await rateLimit();

    let html = "", ok = false, finalUrl = url, usedPW = false;

    // Attempt 1: plain HTTP fetch
    const fetched = await fetchHtml(url, pageTimeoutMs);
    html = fetched.html; ok = fetched.ok; finalUrl = fetched.finalUrl;
    await throwIfAborted();

    if (ok && html) {
      const $ = loadHtml(html);
      const cl = contentLength($);
      if (isSpaShell($, cl)) {
        console.log(`[web-crawler] HTTP gave SPA shell (${cl} chars) for ${url} — upgrading to Playwright`);
        const pw = await pwPool.renderPage(url, pageTimeoutMs);
        if (pw) { html = pw.html; finalUrl = pw.finalUrl; usedPW = true; }
      }
    } else if (!ok) {
      // HTTP failed entirely — try Playwright as direct fallback
      const pw = await pwPool.renderPage(url, pageTimeoutMs);
      if (pw) { html = pw.html; finalUrl = pw.finalUrl; ok = true; usedPW = true; }
    }

    if (!ok || !html) {
      const msg = "Fetch failed (HTTP error; Playwright unavailable or also failed)";
      errors.push({ url, message: msg, depth });
      const d: DiscoveredUrl = {
        url, title: "Fetch error", depth, parentUrl: parent,
        contentLength: 0, status: "error", errorMessage: msg,
      };
      discoveredUrls.push(d);
      onUrlDiscovered?.(d);
      return;
    }

    const $ = loadHtml(html);
    const cl = contentLength($);

    try {
      const fd = normHost(new URL(finalUrl));
      if (fd !== inputDomain && fd !== redirectedDomain) redirectedDomain = fd;
    } catch { /* ignore */ }

    const d: DiscoveredUrl = {
      url, title: extractTitle($), depth,
      parentUrl: parent, contentLength: cl, status: "discovered",
    };
    discoveredUrls.push(d);
    onUrlDiscovered?.(d);

    if (usedPW) console.log(`[web-crawler] ✅ [Playwright] D${depth} ${url} (${cl} chars)`);
    onProgress?.({
      crawledCount: visited.size,
      queuedCount: bfsQueue.length,
      totalDiscovered: discoveredUrls.length,
    });

    if (depth < maxDepth) {
      const links = extractLinks($, finalUrl, inputDomain, redirectedDomain, pathPrefix);
      for (const link of links) {
        if (discoveredUrls.length + bfsQueue.length < maxUrls)
          enqueue(link, depth + 1, url);
      }
    }
  };

  // ── BFS loop ──────────────────────────────────────────────────────────────────
  let currentDepth = 0;
  while (currentDepth <= maxDepth && bfsQueue.length > 0 && discoveredUrls.length < maxUrls) {
    await throwIfAborted();
    const level = bfsQueue.filter(q => q.depth === currentDepth);
    bfsQueue.splice(0, bfsQueue.length, ...bfsQueue.filter(q => q.depth !== currentDepth));

    if (level.length === 0) { currentDepth++; continue; }

    console.log(`[web-crawler] Depth ${currentDepth}: ${level.length} URL(s)  (found so far: ${discoveredUrls.length})`);
    await concPool(level, concurrency, processUrl);
    currentDepth++;
  }

  await pwPool.close();

  const ms  = Date.now() - t0;
  const okN = discoveredUrls.filter(u => u.status === "discovered").length;
  console.log(`[web-crawler] ✅ Done: ${okN} pages, ${errors.length} errors, ${ms}ms\n`);

  return {
    rootUrl:         normalizeUrl(rootUrl),
    pathPrefix,
    discoveredUrls,
    totalPages:      okN,
    crawlDurationMs: ms,
    errors,
  };
}
