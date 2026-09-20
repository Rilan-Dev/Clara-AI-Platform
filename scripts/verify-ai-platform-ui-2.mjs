import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@clara.ai";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";
const OUT = "/home/z/my-project/tool-results/ui-verify";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
});

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"], form button').last().click();
  await page.waitForURL(/dashboard|orgs|settings|admin/i, { timeout: 20000 }).catch(() => {});
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await login(page);
await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// Voice Chat tab → open Sarvam AI (has 36 voices + TTS/STT models)
await page.getByRole("tab", { name: /voice chat/i }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /open provider/i }).filter({ hasText: "" }).nth(0);
const sarvamCard = page.locator("article", { hasText: "Sarvam AI" }).first();
await sarvamCard.getByRole("button", { name: /open provider/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/11-sarvam-vc-connection.png` });

const tabs = await page.getByRole("tab").allTextContents();
console.log("sarvam voice-chat drawer tabs:", tabs);

// Models tab — should show TTS/STT models only (no voices mixed)
await page.getByRole("tab", { name: /models/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/12-sarvam-vc-models.png`, fullPage: true });

// Voices tab — should show the 36 Sarvam speakers
await page.getByRole("tab", { name: /voices/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/13-sarvam-vc-voices.png`, fullPage: true });

// Scroll to bottom of the voice list to check long-list reachability
await page.locator('[role="dialog"] > div').last();
const scrollContainer = page.locator("div.overflow-y-auto").last();
await scrollContainer.evaluate((el) => (el.scrollTop = el.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/14-sarvam-voices-bottom.png` });

const body = await page.textContent("body");
console.log("voices list contains 'Shubh':", body.includes("Shubh"));
console.log("voices list contains 'Rupali' (last seeded):", body.includes("Rupali"));

// Mobile: Sarvam voices tab
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mpage = await mctx.newPage();
await login(mpage);
await mpage.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(1200);
await mpage.getByRole("tab", { name: /voice chat/i }).click();
await mpage.waitForTimeout(600);
const mSarvam = mpage.locator("article", { hasText: "Sarvam AI" }).first();
await mSarvam.getByRole("button", { name: /open provider/i }).click();
await mpage.waitForTimeout(1000);
await mpage.getByRole("tab", { name: /voices/i }).click();
await mpage.waitForTimeout(600);
await mpage.screenshot({ path: `${OUT}/15-sarvam-voices-mobile.png`, fullPage: true });

// Verify a voice row's full name is NOT truncated (scroll into view of a long name)
const rowWithLongName = mpage.locator("li", { hasText: "Ashutosh" }).first();
await rowWithLongName.scrollIntoViewIfNeeded();
await mpage.screenshot({ path: `${OUT}/16-sarvam-voice-row-mobile.png` });
const rowBox = await rowWithLongName.boundingBox();
console.log("voice row box:", JSON.stringify(rowBox));
const rowText = await rowWithLongName.textContent();
console.log("row text:", rowText?.trim());

await mctx.close();
await ctx.close();
await browser.close();
console.log("DONE");
