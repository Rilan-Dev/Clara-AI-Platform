import { load as loadHtml } from "cheerio";

const url = process.argv[2] ?? "https://zenhealthcareclinic.net/";

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; ClaraKnowledgeBot/2.0; +https://clara.ai/bot)",
];

const SPA_MARKERS = [
  "window.__NUXT__", "window.__NEXT_DATA__", "__vue_app__",
  "data-reactroot", "data-react-helmet", "ng-version", "ng-app",
  "<div id=\"app\"></div>", "<div id=\"root\"></div>",
  "<div id=\"root\">", "<div id=\"__next\">", "<!-- app -->",
  "wp-json", // ← SUSPECT
];

const NOISE_SELECTORS = [
  "script","style","noscript","iframe","svg","canvas",
  "nav","footer","header","aside",
  "[role='navigation']","[role='banner']","[role='contentinfo']","[role='complementary']",
  "[aria-hidden='true']","[class*='cookie']","[id*='cookie']","[class*='consent']",
  "[id*='consent']","[class*='gdpr']","[id*='gdpr']","[class*='advertisement']",
  "[class*='ads-']","[id*='google_ads']","[class*='newsletter']","[class*='signup-modal']",
  "[class*='share-']","[class*='social-']","[id*='disqus']","[class*='disqus']",
  "[class*='breadcrumb']","a[href^='#']","[class*='print-only']",".sr-only",".visually-hidden",
  "[class*='chat-widget']","[id*='chat-widget']","[class*='intercom']","[id*='intercom']",
  "[class*='helpdesk']","[id*='helpdesk']","[class*='sticky']","[class*='floating']",
  "[class*='popup']","[class*='modal']","[class*='overlay']",
];

const CONTENT_SELECTORS = [
  "article","main","[role='main']",
  ".entry-content,.post-content,.page-content",
  ".content,#content,#main-content,.main-content",
  ".post,#post,.single-post",
  ".docs-content,.documentation,.doc-content,.markdown-body",
  ".container-content,.page-wrapper,.page-body",
  ".wp-block-group,.wp-content,.site-content,#primary",
  "[class*='page-wrap'],[class*='page-body']",
  "[class*='inner-content'],[class*='post-inner']",
  "[class*='about-content'],[class*='services-content']",
  "[class*='wrapper']:not(nav):not(header):not(footer)",
  "[id*='content']:not(nav):not(footer)",
  "[class*='content']:not(nav):not(footer):not([class*='cookie'])",
  ".container:not(nav):not(footer)",
  "[id='app'],[id='root'],[id='__next']",
  "body",
];

async function main() {
  // Fetch raw HTML
  let rawHtml = "";
  for (const ua of UAS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": ua, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
        redirect: "follow", signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) { rawHtml = await res.text(); console.log(`✅ Fetched with UA: ${ua.slice(0,40)}`); break; }
    } catch (e) { console.log(`❌ UA failed: ${ua.slice(0,40)}: ${(e as Error).message}`); }
  }
  if (!rawHtml) { console.log("All fetches failed"); return; }

  console.log(`\nRaw HTML: ${rawHtml.length} chars`);

  // Check SPA markers
  console.log(`\n=== SPA MARKER CHECK ===`);
  const triggered = SPA_MARKERS.filter(m => rawHtml.includes(m));
  console.log(`Triggered markers: ${triggered.length > 0 ? triggered.join(", ") : "NONE"}`);

  const bodyTextLen = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  console.log(`Raw text length (tag-stripped): ${bodyTextLen}`);

  // Now Cheerio extraction
  const $ = loadHtml(rawHtml);
  const cheerioBodyLen = $("body").text().replace(/\s+/g, " ").trim().length;
  console.log(`Cheerio body.text() length: ${cheerioBodyLen}`);

  // What does findContentRoot pick?
  console.log(`\n=== CONTENT ROOT CANDIDATES ===`);
  for (const sel of CONTENT_SELECTORS) {
    try {
      const el = $(sel).first();
      if (el.length > 0) {
        const txt = el.text().replace(/\s+/g, " ").trim();
        console.log(`  "${sel}" → ${txt.length} chars${txt.length > 80 ? " ✅ (would be selected)" : " ✗ (too short)"}`);
        if (txt.length > 80) { console.log(`    First 120: ${txt.slice(0, 120)}`); break; }
      }
    } catch {}
  }

  // After noise removal
  console.log(`\n=== AFTER NOISE REMOVAL ===`);
  const $clean = loadHtml(rawHtml);
  for (const sel of NOISE_SELECTORS) {
    try { $clean(sel).remove(); } catch {}
  }
  const cleanBodyLen = $clean("body").text().replace(/\s+/g, " ").trim().length;
  console.log(`body.text() after noise removal: ${cleanBodyLen} chars`);

  // Re-run findContentRoot on clean DOM
  console.log(`\n=== CONTENT ROOT AFTER NOISE REMOVAL ===`);
  for (const sel of CONTENT_SELECTORS) {
    try {
      const el = $clean(sel).first();
      if (el.length > 0) {
        const txt = el.text().replace(/\s+/g, " ").trim();
        if (txt.length > 80) {
          console.log(`  ✅ "${sel}" → ${txt.length} chars`);
          console.log(`  First 300: ${txt.slice(0, 300)}`);
          break;
        }
      }
    } catch {}
  }

  // Check what wp-json looks like in the HTML
  const wpJsonIdx = rawHtml.indexOf("wp-json");
  if (wpJsonIdx >= 0) {
    console.log(`\n=== wp-json CONTEXT ===`);
    console.log(rawHtml.slice(Math.max(0, wpJsonIdx - 30), wpJsonIdx + 80));
  }
}

main().catch(console.error);
