/**
 * src/modules/admin/core/ingest/web-loader.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Robust web page loader — converts any page into RAG-optimised markdown.
 *
 * Fetch strategy waterfall (stops at first strategy yielding ≥ 300 chars):
 *   1. http-fetch          — fast, works for SSR/static sites
 *   2. playwright-load     — domcontentloaded + smart content wait (best for SPAs)
 *   3. playwright-scroll   — full scroll + extra settle, for lazy-load SPAs
 *
 * Key improvements:
 *   • Uses "domcontentloaded" not "load"/"networkidle" — never blocks on CDN assets
 *   • Smart content-ready wait: polls body.innerText length until content appears
 *   • Raw-text nuclear fallback if markdown extraction yields < 200 chars
 *   • Broader findContentRoot selectors covering Arabic / non-English CMSes
 *   • Larger SPA marker set, Arabic locale headers
 *   • Playwright args tuned to avoid bot-detection blocks
 */

import { load as loadHtml, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

// ── Public types ──────────────────────────────────────────────────────────────

export type WebDocument = {
  url:      string;
  title:    string;
  text:     string;
  metadata: WebMetadata;
};

export type WebMetadata = {
  description:    string;
  ogTitle:        string;
  ogDescription:  string;
  canonicalUrl:   string;
  breadcrumbs:    string[];
  retrievedAt:    string;
  contentLength:  number;
  scrapeStrategy: "http-fetch" | "playwright-load" | "playwright-scroll";
};

// ── Noise selectors ───────────────────────────────────────────────────────────

const NOISE_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "canvas",
  "nav", "footer", "header", "aside",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  "[role='complementary']", "[aria-hidden='true']",
  "[class*='cookie']",  "[id*='cookie']",
  "[class*='consent']", "[id*='consent']",
  "[class*='gdpr']",    "[id*='gdpr']",
  "[class*='advertisement']", "[class*='ads-']", "[id*='google_ads']",
  "[class*='newsletter']",    "[class*='signup-modal']",
  "[class*='share-']",        "[class*='social-']",
  "[id*='disqus']",           "[class*='disqus']",
  "[class*='breadcrumb']",
  "a[href^='#']",
  "[class*='print-only']", ".sr-only", ".visually-hidden",
  // Floating / overlay widgets that add noise
  "[class*='chat-widget']", "[id*='chat-widget']",
  "[class*='intercom']",    "[id*='intercom']",
  "[class*='helpdesk']",    "[id*='helpdesk']",
  "[class*='sticky']",      "[class*='floating']",
  "[class*='popup']",       "[class*='modal']",
  "[class*='overlay']",
];

// SPA shell markers (skip straight to Playwright when found)
const SPA_MARKERS = [
  "window.__NUXT__", "window.__NEXT_DATA__", "__vue_app__",
  "data-reactroot", "data-react-helmet",
  "ng-version", "ng-app",
  "<div id=\"app\"></div>",
  "<div id=\"root\"></div>",
  "<div id=\"root\">",        // non-empty but sparse React roots
  "<div id=\"__next\">",
  "<!-- app -->",
  "wp-json",                  // WP with REST rendering
];

// ── HTTP fetch ────────────────────────────────────────────────────────────────

const USER_AGENTS = [
  // Chrome 124 on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Chrome 124 on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Firefox 125 on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Safari 17 on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  // ClaraBot fallback
  "Mozilla/5.0 (compatible; ClaraKnowledgeBot/2.0; +https://clara.ai/bot)",
];

async function httpFetch(url: string, timeoutMs = 25_000): Promise<string | null> {
  for (const ua of USER_AGENTS.slice(0, 3)) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":          ua,
          "Accept":              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":     "ar,en-US;q=0.9,en;q=0.8",
          "Accept-Encoding":     "gzip, deflate, br",
          "Cache-Control":       "no-cache",
          "Pragma":              "no-cache",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest":      "document",
          "Sec-Fetch-Mode":      "navigate",
          "Sec-Fetch-Site":      "none",
          "Sec-Fetch-User":      "?1",
          "DNT":                 "1",
        },
        redirect: "follow",
        signal:   AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        console.warn(`[web-loader] HTTP ${response.status} for ${url} (ua ${ua.slice(0,25)}…)`);
        continue;
      }
      return await response.text();
    } catch (err) {
      console.warn(`[web-loader] HTTP fetch failed (${ua.slice(0, 25)}…): ${(err as Error).message}`);
    }
  }
  return null;
}

// ── Playwright helpers ────────────────────────────────────────────────────────

async function playwrightLoad(
  url: string,
  scroll   = false,
  timeoutMs = 50_000
): Promise<string | null> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--lang=ar,en-US",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    try {
      const context = await browser.newContext({
        userAgent: USER_AGENTS[0],
        locale:    "ar-SA",
        extraHTTPHeaders: {
          "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        viewport:          { width: 1280, height: 900 },
        // Ignore HTTPS errors (common on .sa / .edu.sa domains)
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();

      // ── Block resource-heavy assets — only fetch HTML + XHR/fetch ──────────
      // This is the key performance fix: don't wait for fonts, images, CSS CDNs
      await page.route("**/*", (route) => {
        const rt = route.request().resourceType();
        if (["image", "media", "font", "stylesheet", "other"].includes(rt)) {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });

      // ── Navigate: use domcontentloaded — fires MUCH faster than "load" ─────
      // "load" waits for all resources. "domcontentloaded" fires as soon as HTML
      // is parsed. Combined with resource blocking above, this is very fast.
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout:   timeoutMs,
      });

      // ── Smart content-ready wait ───────────────────────────────────────────
      // Poll until body has meaningful text, or 12 s max.
      // This handles React/Vue hydration without a fixed sleep.
      await page.waitForFunction(
        () => (document.body?.innerText?.trim().length ?? 0) > 200,
        { timeout: 12_000 }
      ).catch(() => {
        // Best-effort: continue even if body is still sparse
      });

      // Fixed settle for any remaining JS rendering
      await page.waitForTimeout(2_000);

      if (scroll) {
        // Scroll through the entire page to trigger lazy-loaded content
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance  = 400;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 60);
          });
        }).catch(() => { /* ignore */ });

        // Wait for lazy content to render after scroll
        await page.waitForTimeout(3_000);
      }

      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn(
      `[web-loader] Playwright fallback failed: ${(err as Error).message.split("\n")[0]}`
    );
    return null;
  }
}

// ── SPA detection ─────────────────────────────────────────────────────────────

function isSpaShell(html: string): boolean {
  const hasSpaMarker   = SPA_MARKERS.some((m) => html.includes(m));
  const textContent    = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  const hasMinimalText = textContent < 600;
  const hasFramework   = /react|angular|vue\.js|ember|backbone|nextjs|nuxt/i.test(html.slice(0, 10_000));
  return hasSpaMarker || (hasMinimalText && hasFramework);
}

// ── Metadata extraction ───────────────────────────────────────────────────────

function extractMeta($: CheerioAPI, pageUrl: string): WebMetadata {
  const getMeta = (selector: string, attr = "content") =>
    $(selector).attr(attr)?.trim() ?? "";

  const breadcrumbs: string[] = [];
  try {
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw  = $(el).html() ?? "";
      const data = JSON.parse(raw);
      const list =
        data?.["@type"] === "BreadcrumbList"
          ? data.itemListElement
          : data?.breadcrumb?.itemListElement;
      if (Array.isArray(list)) {
        list.forEach((item: { name?: string }) => {
          if (item.name) breadcrumbs.push(item.name.trim());
        });
      }
    });
  } catch { /* ignore malformed JSON-LD */ }

  if (breadcrumbs.length === 0) {
    $("[class*='breadcrumb'] a, [aria-label*='breadcrumb'] a").each((_, el) => {
      const text = $(el).text().trim();
      if (text) breadcrumbs.push(text);
    });
  }

  return {
    description:    getMeta("meta[name='description']"),
    ogTitle:        getMeta("meta[property='og:title']"),
    ogDescription:  getMeta("meta[property='og:description']"),
    canonicalUrl:   getMeta("link[rel='canonical']", "href") || pageUrl,
    breadcrumbs,
    retrievedAt:    new Date().toISOString(),
    contentLength:  0,
    scrapeStrategy: "http-fetch",
  };
}

function extractTitle($: CheerioAPI): string {
  return (
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1").first().text().trim()                          ||
    $("title").first().text().trim()                       ||
    "Untitled Page"
  );
}

// ── DOM → Markdown ────────────────────────────────────────────────────────────

function nodeToMarkdown(
  $: CheerioAPI,
  node: AnyNode,
  listDepth = 0,
  orderedCounters: number[] = []
): string {
  if (node.type === "text") {
    return ((node as { data: string }).data ?? "").replace(/\s+/g, " ");
  }
  if (node.type !== "tag") return "";

  const tagName  = ((node as { tagName?: string }).tagName ?? "").toLowerCase();
  const children = (node as { children?: AnyNode[] }).children ?? [];

  const inner = (depth = listDepth, counters = orderedCounters) =>
    children.map((c) => nodeToMarkdown($, c, depth, counters)).join("").trim();

  switch (tagName) {
    case "h1": return `\n\n# ${inner()}\n\n`;
    case "h2": return `\n\n## ${inner()}\n\n`;
    case "h3": return `\n\n### ${inner()}\n\n`;
    case "h4": return `\n\n#### ${inner()}\n\n`;
    case "h5": return `\n\n##### ${inner()}\n\n`;
    case "h6": return `\n\n###### ${inner()}\n\n`;

    case "strong": case "b": { const t = inner(); return t ? `**${t}**` : ""; }
    case "em":     case "i": { const t = inner(); return t ? `_${t}_`   : ""; }
    case "del":    case "s": { const t = inner(); return t ? `~~${t}~~` : ""; }
    case "mark":             { const t = inner(); return t ? `==${t}==` : ""; }
    case "sup":              { const t = inner(); return t ? `^${t}^`   : ""; }
    case "sub":              { const t = inner(); return t ? `~${t}~`   : ""; }

    case "code": { const t = inner(); return t ? `\`${t}\`` : ""; }
    case "pre": {
      const codeEl = $(node).find("code").first();
      const langClass = codeEl.attr("class") ?? "";
      const lang   = langClass.match(/language-(\S+)/)?.[1] ?? "";
      const code   = codeEl.length > 0 ? codeEl.text() : $(node).text();
      return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
    }

    case "a": {
      const href = (node as { attribs?: Record<string, string> }).attribs?.href ?? "";
      const text = inner();
      if (!text) return "";
      if (!href || href.startsWith("#")) return text;
      return `[${text}](${href})`;
    }

    case "img": {
      const attribs = (node as { attribs?: Record<string, string> }).attribs ?? {};
      const alt     = attribs.alt?.trim() ?? "";
      const src     = attribs.src?.trim() ?? "";
      if (!alt || alt.length < 3) return "";
      return `![${alt}](${src})`;
    }

    case "p": { const t = inner(); return t ? `\n\n${t}\n\n` : ""; }
    case "blockquote": {
      const t = inner();
      return t ? "\n\n" + t.split("\n").map((l) => `> ${l}`).join("\n") + "\n\n" : "";
    }
    case "hr": return "\n\n---\n\n";
    case "br": return "  \n";

    case "ul": {
      const items = children
        .filter((c) => (c as { tagName?: string }).tagName?.toLowerCase() === "li")
        .map((c) => nodeToMarkdown($, c, listDepth + 1, []))
        .join("");
      return items ? `\n${items}\n` : "";
    }
    case "ol": {
      const counters = [0];
      const items = children
        .filter((c) => (c as { tagName?: string }).tagName?.toLowerCase() === "li")
        .map((c) => nodeToMarkdown($, c, listDepth + 1, counters))
        .join("");
      return items ? `\n${items}\n` : "";
    }
    case "li": {
      const indent = "  ".repeat(Math.max(0, listDepth - 1));
      const t      = inner(listDepth, orderedCounters);
      if (!t) return "";
      if (orderedCounters.length > 0) {
        orderedCounters[0] = (orderedCounters[0] ?? 0) + 1;
        return `${indent}${orderedCounters[0]}. ${t}\n`;
      }
      return `${indent}- ${t}\n`;
    }

    case "table": return convertTable($, node);
    case "dt": return `\n\n**${inner()}**`;
    case "dd": return `: ${inner()}\n`;

    case "article": case "main": case "section": case "div":
    case "figure":  case "figcaption": case "details": case "summary": {
      const t = children
        .map((c) => nodeToMarkdown($, c, listDepth, orderedCounters))
        .join("");
      return `\n${t}\n`;
    }
    case "span": case "label": case "td": case "th":
      return children
        .map((c) => nodeToMarkdown($, c, listDepth, orderedCounters))
        .join("");

    default: return inner();
  }
}

// ── Table converter ───────────────────────────────────────────────────────────

function convertTable($: CheerioAPI, tableNode: AnyNode): string {
  const $table = $(tableNode);
  const rows: string[][] = [];

  $table.find("tr").each((_, tr) => {
    const cells: string[] = [];
    $(tr).find("th, td").each((_, cell) => {
      const text    = $(cell).text().replace(/\s+/g, " ").trim();
      const colspan = parseInt($(cell).attr("colspan") ?? "1", 10);
      for (let i = 0; i < colspan; i++) cells.push(text);
    });
    if (cells.length > 0) rows.push(cells);
  });

  if (rows.length === 0) return "";
  const colCount   = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  const lines: string[] = [];
  lines.push("| " + normalized[0].join(" | ") + " |");
  lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < normalized.length; i++) {
    lines.push("| " + normalized[i].join(" | ") + " |");
  }
  return `\n\n${lines.join("\n")}\n\n`;
}

// ── Content root detection ────────────────────────────────────────────────────
// Ordered by specificity: most specific/semantic first, body last.

function findContentRoot($: CheerioAPI): Cheerio<AnyNode> {
  const candidates: Cheerio<AnyNode>[] = [
    // Semantic HTML5
    $("article").first(),
    $("main").first(),
    $("[role='main']").first(),

    // Common CMS / framework content wrappers
    $(".entry-content, .post-content, .page-content").first(),
    $(".content, #content, #main-content, .main-content").first(),
    $(".post, #post, .single-post").first(),

    // Docs / developer portals
    $(".docs-content, .documentation, .doc-content, .markdown-body").first(),
    $(".container-content, .page-wrapper, .page-body").first(),

    // WordPress
    $(".wp-block-group, .wp-content, .site-content, #primary").first(),

    // Arabic / RTL site patterns  (common in .sa / .ae / .eg CMSes)
    $("[class*='page-wrap'], [class*='page-body']").first(),
    $("[class*='inner-content'], [class*='post-inner']").first(),
    $("[class*='about-content'], [class*='services-content']").first(),
    $("[class*='wrapper']:not(nav):not(header):not(footer)").first(),

    // Generic containers — fallback chain
    $("[id*='content']:not(nav):not(footer)").first(),
    $("[class*='content']:not(nav):not(footer):not([class*='cookie'])").first(),
    $(".container:not(nav):not(footer)").first(),
    $("[id='app'], [id='root'], [id='__next']").first(),  // SPA mounts after render

    // Final fallback
    $("body").first(),
  ];

  for (const candidate of candidates) {
    if (candidate.length > 0 && candidate.text().trim().length > 80) {
      return candidate;
    }
  }
  return $("body").first();
}

// ── Raw-text nuclear fallback ─────────────────────────────────────────────────
// Used when the markdown converter yields < 200 chars (empty SPA shell or
// highly JS-dynamic content that Cheerio cannot parse into markdown).

function extractRawText($: CheerioAPI): string {
  // Remove all noise elements first
  NOISE_SELECTORS.forEach((sel) => {
    try { $(sel).remove(); } catch { /* ignore */ }
  });

  // Try the best semantic container first, fall back to full body
  const root = findContentRoot($);
  const text  = root.text().replace(/\s+/g, " ").trim();

  if (text.length > 100) {
    // Format as plain paragraphs: split on 2+ spaces / punctuation
    return text
      .split(/(?<=[.!?؟،])\s{2,}|\s{3,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20)
      .join("\n\n");
  }

  // Last-resort: grab ALL text nodes from the entire document
  return $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s{3,}/)
    .filter((s) => s.trim().length > 20)
    .join("\n\n");
}

// ── Markdown cleaner ──────────────────────────────────────────────────────────

function cleanMarkdown(md: string): string {
  let result = md
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\t/g, "    ");

  result = result.replace(/[^\S\n]+$/gm, "");

  const segments = result.split(/(```[\s\S]*?```)/g);
  result = segments.map((seg, i) => {
    if (i % 2 === 1) return seg;
    return seg
      .replace(/([^\n]) {2,}([^\n])/g, "$1 $2")
      .replace(/\| {2,}/g, "| ")
      .replace(/ {2,}\|/g, " |");
  }).join("");

  result = result.replace(/^[^\S\n]*([^\w\s#>\-*|`]){1,2}[^\S\n]*$/gm, "");
  result = result.replace(/^(?![#>\-*`|])(.{0,2})$/gm, (match, content) => {
    return content.trim().length === 0 ? "" : match;
  });

  const lines  = result.split("\n");
  const deduped: string[] = [];
  let streak = 0;
  for (const line of lines) {
    const prev = deduped[deduped.length - 1] ?? null;
    if (line.trim().length > 0 && line.trim().length < 60 && line === prev) {
      streak++;
      if (streak >= 2) continue;
    } else {
      streak = 0;
    }
    deduped.push(line);
  }
  result = deduped.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/(^#{1,6} .+)\n{2,}(?=\S)/gm, "$1\n");

  return result.trim();
}

function measureTextLength(html: string): number {
  return loadHtml(html)("body").text().replace(/\s+/g, " ").trim().length;
}

// ── Core extractor ────────────────────────────────────────────────────────────

export function extractMarkdownFromHtml(html: string, pageUrl = ""): {
  title:    string;
  markdown: string;
  metadata: WebMetadata;
} {
  const $ = loadHtml(html);
  const metadata = extractMeta($, pageUrl);
  const title    = extractTitle($);

  // Remove noise
  NOISE_SELECTORS.forEach((sel) => {
    try { $(sel).remove(); } catch { /* ignore */ }
  });

  const root  = findContentRoot($);
  const rawMd = root.get(0)
    ? nodeToMarkdown($, root.get(0)!)
    : $("body").text();

  let markdown = cleanMarkdown(rawMd);

  // ── Nuclear fallback: if markdown is tiny, try raw-text extraction ─────────
  if (markdown.length < 200) {
    console.log("[web-loader] Markdown too sparse — trying raw-text fallback");
    // Re-parse because we already mutated $ above
    const $fresh  = loadHtml(html);
    const rawText = extractRawText($fresh);
    if (rawText.length > markdown.length) {
      markdown = rawText;
      console.log(`[web-loader] Raw-text fallback yielded ${rawText.length} chars`);
    }
  }

  return { title, markdown, metadata: { ...metadata, contentLength: markdown.length } };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Multi-strategy loader:
 *   1. HTTP fetch  (fast, SSR/static sites)
 *   2. Playwright domcontentloaded + smart wait  (SPAs, JS-rendered)
 *   3. Playwright domcontentloaded + scroll  (lazy-load heavy SPAs)
 */
export async function loadWebPage(url: string): Promise<WebDocument> {
  type Candidate = { html: string; strategy: WebMetadata["scrapeStrategy"] };
  const candidates: Candidate[] = [];

  // ── Strategy 1: HTTP fetch ─────────────────────────────────────────────────
  const rawHtml = await httpFetch(url);

  if (rawHtml) {
    const charCount = measureTextLength(rawHtml);
    const isSpa     = isSpaShell(rawHtml);
    console.log(`[web-loader] HTTP fetch: ${charCount} text chars | SPA shell: ${isSpa}`);

    if (charCount >= 300 && !isSpa) {
      candidates.push({ html: rawHtml, strategy: "http-fetch" });
    }
  } else {
    console.warn("[web-loader] HTTP fetch returned null — upgrading to Playwright");
  }

  // ── Strategy 2: Playwright (domcontentloaded + smart wait) ────────────────
  const bestSoFar = () =>
    candidates.length > 0 ? measureTextLength(candidates[0].html) : 0;

  if (bestSoFar() < 300) {
    console.log("[web-loader] Trying Playwright (domcontentloaded + smart wait)…");
    const rendered = await playwrightLoad(url, false);
    if (rendered) {
      const charCount = measureTextLength(rendered);
      console.log(`[web-loader] Playwright load: ${charCount} text chars`);
      if (charCount > bestSoFar()) {
        candidates.unshift({ html: rendered, strategy: "playwright-load" });
      }
    }
  }

  // ── Strategy 3: Playwright + scroll (lazy-load fallback) ──────────────────
  if (bestSoFar() < 300) {
    console.log("[web-loader] Trying Playwright (scroll + 3s settle)…");
    const scrolled = await playwrightLoad(url, true);
    if (scrolled) {
      const charCount = measureTextLength(scrolled);
      console.log(`[web-loader] Playwright scroll: ${charCount} text chars`);
      if (charCount > bestSoFar()) {
        candidates.unshift({ html: scrolled, strategy: "playwright-scroll" });
      }
    }
  }

  // ── Use best candidate ─────────────────────────────────────────────────────
  if (candidates.length === 0) {
    throw new Error(
      `All fetch strategies failed for ${url}. ` +
      `The site may block bots or require authentication.`
    );
  }

  const best = candidates[0];
  const { title, markdown, metadata } = extractMarkdownFromHtml(best.html, url);

  console.log(
    `[web-loader] ✅ Strategy: ${best.strategy} | ` +
    `raw HTML chars: ${best.html.length.toLocaleString()} | ` +
    `markdown chars: ${markdown.length.toLocaleString()}`
  );

  return {
    url,
    title,
    text:     markdown,
    metadata: { ...metadata, scrapeStrategy: best.strategy },
  };
}
