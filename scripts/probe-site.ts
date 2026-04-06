/**
 * scripts/probe-site.ts
 * Usage: npx tsx scripts/probe-site.ts <url>
 * Probes the raw HTTP response and runs Playwright to diagnose extraction failures.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://zenhealthcareclinic.net/";

async function main() {
  console.log("\n=== HTTP PROBE ===");
  const UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; ClaraKnowledgeBot/2.0; +https://clara.ai/bot)",
  ];
  for (const ua of UAS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      console.log(`UA: ${ua.slice(0, 50)}…`);
      console.log(`  Status: ${res.status}  Content-Type: ${res.headers.get("content-type")}`);
      console.log(`  Body length: ${text.length} chars`);
      console.log(`  First 400 chars:\n${text.slice(0, 400)}\n`);
    } catch (e) {
      console.log(`UA: ${ua.slice(0, 50)}… → FAILED: ${(e as Error).message}\n`);
    }
  }

  console.log("\n=== PLAYWRIGHT PROBE ===");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const networkPayloads: { url: string; status: number; ct: string; len: number }[] = [];
  const page = await context.newPage();

  page.on("response", async (resp) => {
    const ct = resp.headers()["content-type"] ?? "";
    if (ct.includes("json") || ct.includes("text/plain")) {
      const text = await resp.text().catch(() => "");
      if (text.length > 30) {
        networkPayloads.push({ url: resp.url(), status: resp.status(), ct, len: text.length });
      }
    }
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    const html = await page.content();
    const bodyText = await page.evaluate(() => document.body?.innerText?.trim() ?? "");

    console.log(`HTML length: ${html.length}`);
    console.log(`Body text length: ${bodyText.length}`);
    console.log(`Body text first 600 chars:\n${bodyText.slice(0, 600)}\n`);
    console.log(`Network JSON responses captured: ${networkPayloads.length}`);
    for (const p of networkPayloads.slice(0, 5)) {
      console.log(`  [${p.status}] ${p.url.slice(0, 80)} (${p.ct.slice(0, 30)}, ${p.len} chars)`);
    }
    console.log(`\nPage title: ${await page.title()}`);

    // Check for Cloudflare / bot-detection markers in HTML
    const cfMarkers = ["cf-browser-verification", "cf_clearance", "Ray ID", "challenge-platform", "Checking your browser", "__cf_chl", "turnstile"];
    const foundMarkers = cfMarkers.filter(m => html.includes(m));
    if (foundMarkers.length > 0) {
      console.log(`\n⚠️  CLOUDFLARE / BOT DETECTION MARKERS FOUND: ${foundMarkers.join(", ")}`);
    } else {
      console.log(`\n✅ No Cloudflare markers detected`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
