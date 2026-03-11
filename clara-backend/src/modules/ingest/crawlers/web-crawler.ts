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
 *   6. Playwright fallback: per-page, independent — failure never blocks others
 *   7. Correct extension exclusion: endsWith check, never substring includes
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
  /** Per-page fetch timeout ms. Default: 20000 */
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
// This prevents "/guide/api-plugin" from being blocked by an "/api/" rule.

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

// ── URL utilities ─────────────────────────────────────────────────────────────

/** Strips www., lowercases. www.vite.dev === vite.dev */
function normHost(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.hash  = "";
    const TRACKING = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","ref","fbclid","gclid"];
    const p = new URLSearchParams(url.searchParams);
    for (const t of TRACKING) p.delete(t);
    const sorted = new URLSearchParams([...p.entries()].sort(([a],[b]) => a.localeCompare(b)));
    url.search = sorted.toString() ? `?${sorted}` : "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/"))
      url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch { return urlStr; }
}

/**
 * True if this URL should be skipped.
 * - Extension: only checks the suffix of the last path segment (endsWith).
 * - Path prefix: checks pathname.startsWith, not .includes.
 */
function shouldExclude(urlStr: string): boolean {
  try {
    const url  = new URL(urlStr);
    const path = url.pathname.toLowerCase();
    const last = path.split("/").pop() ?? "";
    if (last.includes(".")) {
      const ext = last.split(".").pop() ?? "";
      if (ASSET_EXTENSIONS.has(ext)) return true;
    }
    for (const prefix of EXCLUDE_PATH_PREFIXES) {
      if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?")) return true;
    }
    return false;
  } catch { return true; }
}

/**
 * Derives path prefix from root URL:
 *   https://vite.dev/guide/         → "/guide/"
 *   https://vite.dev/guide          → "/guide/"
 *   https://vite.dev/guide/index.html → "/guide/"
 *   https://vite.dev/               → "/"
 */
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

    // res.url is the FINAL URL after all redirects — critical for domain tracking
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

// ── Playwright fallback ───────────────────────────────────────────────────────

async function renderWithPlaywright(
  url: string,
  timeoutMs: number
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const playwright = await import("playwright");
    const browser    = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        "User-Agent": "Mozilla/5.0 (compatible; ClaraKnowledgeBot/1.0; +https://clara.ai/bot)",
      });
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      await page.waitForTimeout(1500); // extra settle time for heavy SPAs
      return { html: await page.content(), finalUrl: response?.url() ?? url };
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn(`[web-crawler] Playwright failed for ${url}: ${(err as Error).message.split("\n")[0]}`);
    return null;
  }
}

// ── Content helpers ───────────────────────────────────────────────────────────

function contentLength($: CheerioAPI): number {
  const clone = loadHtml($.html() ?? "");
  clone("script,style,noscript,nav,footer,header,aside,iframe,svg").remove();
  const root = clone("article,main,[role='main']");
  return (root.length ? root.first() : clone("body")).text().replace(/\s+/g, " ").trim().length;
}

/** True when the page is a client-side SPA shell with no meaningful content */
function isSpaShell($: CheerioAPI, chars: number): boolean {
  if (chars > 600) return false;
  // SPA mount points used by React/Vue/Next.js/Nuxt/VitePress
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

/**
 * Extracts all crawlable links from a parsed page.
 *
 * pageUrl must be the FINAL URL after redirects so that relative paths
 * resolve to the real domain, and absolute links to the real domain are
 * accepted even if they differ from the original input domain.
 */
function extractLinks(
  $: CheerioAPI,
  pageUrl: string,
  inputDomain: string,
  redirectedDomain: string,
  pathPrefix: string,
): string[] {
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;

    const resolved = resolveHref(href, pageUrl);
    if (!resolved) return;

    try {
      const u    = new URL(resolved);
      const host = normHost(u);

      // Accept links on EITHER the original input domain OR the redirected domain
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

/**
 * Fetches sitemap.xml (and sitemap index files) and returns all page URLs
 * that match the target domain + path prefix.
 *
 * This is the fastest discovery method — a single HTTP request often yields
 * hundreds of URLs that BFS crawling would take minutes to find.
 */
async function discoverViaSitemap(
  origin: string,
  pathPrefix: string,
  inputDomain: string,
  redirectedDomain: string,
  robotsSitemaps: string[],
  timeoutMs: number,
): Promise<string[]> {
  const found = new Set<string>();

  // Start with sitemaps from robots.txt, then try common paths
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

      // Sitemap index → queue child sitemaps (for...of loop picks up new Set entries)
      $("sitemap > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && !toFetch.has(loc)) toFetch.add(loc);
      });

      // Regular sitemap → collect page URLs
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
      console.warn(`[web-crawler] sitemap fetch failed (${sitemapUrl}): ${(err as Error).message.split("\n")[0]}`);
    }
  }

  return [...found];
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  const q = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, q.length) }, async () => {
      while (q.length > 0) { const item = q.shift(); if (item !== undefined) await fn(item); }
    })
  );
}

// ── Main crawl engine ─────────────────────────────────────────────────────────

/**
 * Crawls a website starting from rootUrl, discovering all reachable pages
 * within the same path prefix.
 *
 * Example:
 *   crawlWebsite("https://vite.dev/guide/")
 *   → discovers https://vite.dev/guide/api-plugin
 *                https://vite.dev/guide/api-hmr
 *                https://vite.dev/guide/api-javascript
 *                ... (all /guide/* pages)
 *
 * Strategy (in order):
 *   1. Follow root URL redirect → track real domain (e.g. vite.dev→vitejs.dev)
 *   2. Parse sitemap.xml → instant full URL list for docs sites
 *   3. BFS <a href> crawl → fills gaps for sites without sitemaps
 *   4. Playwright per-page → fallback for JS-rendered SPA shells
 */
export async function crawlWebsite(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const {
    maxDepth         = 3,
    concurrency      = 3,
    requestDelayMs   = 300,
    pageTimeoutMs    = 20_000,
    maxUrls          = 500,
    respectRobotsTxt = true,
    parseSitemap     = true,
    scopeToInputPath = true,
    onUrlDiscovered,
    onProgress,
  } = options;

  const t0           = Date.now();
  const rootUrlObj   = new URL(rootUrl);
  const inputDomain  = normHost(rootUrlObj);
  const origin       = rootUrlObj.origin;
  const pathPrefix   = scopeToInputPath ? derivePathPrefix(rootUrl) : "/";

  // Tracks the real domain after a redirect (e.g. vite.dev → vitejs.dev)
  let redirectedDomain = inputDomain;

  console.log(`\n[web-crawler] ───────────────────────────────────────────────────`);
  console.log(`[web-crawler] Root:    ${rootUrl}`);
  console.log(`[web-crawler] Domain:  ${inputDomain}`);
  console.log(`[web-crawler] Scope:   ${pathPrefix === "/" ? "(entire site)" : pathPrefix + "*"}`);
  console.log(`[web-crawler] maxDepth=${maxDepth}  maxUrls=${maxUrls}  delay=${requestDelayMs}ms`);

  // ── robots.txt ──────────────────────────────────────────────────────────────
  let robots: RobotsRules | null = null;
  if (respectRobotsTxt) {
    robots = await fetchRobotsTxt(origin);
    if (robots?.crawlDelay) console.log(`[web-crawler] robots crawl-delay: ${robots.crawlDelay}s`);
  }
  const effectiveDelay = robots?.crawlDelay
    ? Math.max(requestDelayMs, robots.crawlDelay * 1000)
    : requestDelayMs;

  // ── Step 1: Probe root URL to discover redirect target ──────────────────────
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

  // ── State ────────────────────────────────────────────────────────────────────
  const visited        = new Set<string>();
  const queued         = new Set<string>();
  const discoveredUrls: DiscoveredUrl[] = [];
  const errors:         CrawlError[]   = [];
  let   lastRequest    = 0;

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
      // Accept both original and redirected domain
      if (h !== inputDomain && h !== redirectedDomain) return;
      if (!isUrlAllowed(u.pathname, robots)) return;
    } catch { return; }
    queued.add(n);
    bfsQueue.push({ url: n, depth, parent });
  };

  // ── Step 2: Sitemap discovery ────────────────────────────────────────────────
  if (parseSitemap) {
    // Try origin of both domains (in case sitemap is on the redirected domain)
    const origins = [...new Set([
      origin,
      redirectedDomain !== inputDomain ? `https://${redirectedDomain}` : null,
    ].filter(Boolean))] as string[];

    for (const sOrigin of origins) {
      const sitemapUrls = await discoverViaSitemap(
        sOrigin, pathPrefix, inputDomain, redirectedDomain,
        robots?.sitemaps ?? [], pageTimeoutMs
      );
      if (sitemapUrls.length > 0) {
        console.log(`[web-crawler] Sitemap (${sOrigin}): ${sitemapUrls.length} URLs under ${pathPrefix}*`);
        for (const su of sitemapUrls) enqueue(su, 1, rootUrl);
        break; // one working sitemap is enough
      }
    }
  }

  // ── Step 3: BFS seed ─────────────────────────────────────────────────────────
  enqueue(normalizeUrl(rootUrl), 0, null);

  // ── Process one URL ──────────────────────────────────────────────────────────
  const processUrl = async (item: QItem): Promise<void> => {
    if (discoveredUrls.length >= maxUrls) return;
    const { url, depth, parent } = item;
    visited.add(url);

    await rateLimit();

    let html     = "";
    let ok       = false;
    let finalUrl = url;
    let usedPW   = false;

    // Attempt 1: HTTP fetch
    const fetched = await fetchHtml(url, pageTimeoutMs);
    html     = fetched.html;
    ok       = fetched.ok;
    finalUrl = fetched.finalUrl; // real domain after redirect

    if (ok && html) {
      const $ = loadHtml(html);
      const cl = contentLength($);
      // Playwright fallback: only if content is suspiciously thin (SPA shell)
      if (isSpaShell($, cl)) {
        console.log(`[web-crawler] SPA shell at ${url} (${cl} chars) — trying Playwright`);
        const pw = await renderWithPlaywright(url, pageTimeoutMs);
        if (pw && contentLength(loadHtml(pw.html)) > cl) {
          html = pw.html; finalUrl = pw.finalUrl; usedPW = true;
        }
      }
    } else if (!ok) {
      // Attempt 2: Playwright when HTTP fails entirely
      const pw = await renderWithPlaywright(url, pageTimeoutMs);
      if (pw) { html = pw.html; finalUrl = pw.finalUrl; ok = true; usedPW = true; }
    }

    if (!ok || !html) {
      const msg = "Fetch failed (HTTP error; Playwright unavailable or also failed)";
      errors.push({ url, message: msg, depth });
      const d: DiscoveredUrl = { url, title: "Fetch error", depth, parentUrl: parent, contentLength: 0, status: "error", errorMessage: msg };
      discoveredUrls.push(d);
      onUrlDiscovered?.(d);
      return;
    }

    const $ = loadHtml(html);
    const cl = contentLength($);

    // Keep redirectedDomain current as we discover more of the real domain
    try {
      const fd = normHost(new URL(finalUrl));
      if (fd !== inputDomain && fd !== redirectedDomain) redirectedDomain = fd;
    } catch { /* ignore */ }

    const d: DiscoveredUrl = { url, title: extractTitle($), depth, parentUrl: parent, contentLength: cl, status: "discovered" };
    discoveredUrls.push(d);
    onUrlDiscovered?.(d);

    if (usedPW) console.log(`[web-crawler] ✅ [Playwright] D${depth} ${url} (${cl} chars)`);

    onProgress?.({ crawledCount: visited.size, queuedCount: bfsQueue.length, totalDiscovered: discoveredUrls.length });

    // Extract links — use finalUrl as base so relative paths resolve to real domain
    if (depth < maxDepth) {
      const links = extractLinks($, finalUrl, inputDomain, redirectedDomain, pathPrefix);
      for (const link of links) {
        if (discoveredUrls.length + bfsQueue.length < maxUrls) enqueue(link, depth + 1, url);
      }
    }
  };

  // ── BFS loop ─────────────────────────────────────────────────────────────────
  let currentDepth = 0;
  while (currentDepth <= maxDepth && bfsQueue.length > 0 && discoveredUrls.length < maxUrls) {
    const level = bfsQueue.filter(q => q.depth === currentDepth);
    bfsQueue.splice(0, bfsQueue.length, ...bfsQueue.filter(q => q.depth !== currentDepth));

    if (level.length === 0) { currentDepth++; continue; }

    console.log(`[web-crawler] Depth ${currentDepth}: ${level.length} URL(s)  (found so far: ${discoveredUrls.length})`);
    await pool(level, concurrency, processUrl);
    currentDepth++;
  }

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
