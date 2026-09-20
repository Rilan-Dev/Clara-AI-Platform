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

async function main() {
  // ── Desktop ──────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  console.log("logged in →", page.url());

  await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/01-chat-tab-desktop.png`, fullPage: true });
  console.log("01 chat tab (desktop) saved");

  const body = await page.textContent("body");

  // Chat tab must NOT contain ElevenLabs provider card
  const chatHasEleven = body.includes("ElevenLabs");
  console.log("chat tab shows ElevenLabs (expect false):", chatHasEleven);

  // Switch to Voice Chat tab
  await page.getByRole("tab", { name: /voice chat/i }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-voicechat-tab-desktop.png`, fullPage: true });
  const vcBody = await page.textContent("body");
  console.log("voice-chat tab shows ElevenLabs (expect true):", vcBody.includes("ElevenLabs"));
  console.log("voice-chat tab shows 'Set as voice chat default' (expect true):", vcBody.includes("Set as voice chat default"));

  // Switch to Realtime Voice tab
  await page.getByRole("tab", { name: /realtime voice/i }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-realtime-tab-desktop.png`, fullPage: true });

  // Open a provider drawer from voice chat tab (OpenAI has realtime + voices)
  await page.getByRole("button", { name: /open provider/i }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/04-drawer-connection-desktop.png` });

  const drawerTabs = await page.getByRole("tab").allTextContents();
  console.log("drawer tabs (realtime):", drawerTabs);

  // Models tab
  await page.getByRole("tab", { name: /models/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/05-drawer-models-desktop.png`, fullPage: true });
  const modelsBody = await page.textContent("body");

  // Voices tab
  const voicesTab = page.getByRole("tab", { name: /voices/i });
  if (await voicesTab.count()) {
    await voicesTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/06-drawer-voices-desktop.png`, fullPage: true });
    console.log("voices tab opened OK");
  } else {
    console.log("voices tab MISSING");
  }

  // Back to Chat tab: drawer must NOT have a Voices tab
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /^chat$/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /open provider/i }).first().click();
  await page.waitForTimeout(1000);
  const chatDrawerTabs = await page.getByRole("tab").allTextContents();
  console.log("drawer tabs (chat):", chatDrawerTabs);
  await page.screenshot({ path: `${OUT}/07-drawer-chat-desktop.png` });

  await ctx.close();

  // ── Mobile ───────────────────────────────────────────────────────────────
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await login(mpage);
  await mpage.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(1200);
  await mpage.screenshot({ path: `${OUT}/08-chat-tab-mobile.png`, fullPage: true });

  // Every tab must be visible/accessible (no horizontal clipping)
  const tabs = mpage.getByRole("tab");
  const tabCount = await tabs.count();
  let allVisible = true;
  for (let i = 0; i < tabCount; i++) {
    const visible = await tabs.nth(i).isVisible();
    const box = await tabs.nth(i).boundingBox();
    const inViewport = box && box.x + box.width <= 391;
    if (!visible || !inViewport) allVisible = false;
    console.log(`  tab ${i}: visible=${visible} box=${JSON.stringify(box)}`);
  }
  console.log("all capability tabs accessible on mobile:", allVisible);

  // Mobile drawer — last tab (Usage) must be reachable
  await mpage.getByRole("button", { name: /open provider/i }).first().click();
  await mpage.waitForTimeout(1000);
  await mpage.screenshot({ path: `${OUT}/09-drawer-mobile.png`, fullPage: true });
  const mDrawerTabs = mpage.getByRole("tab");
  const mCount = await mDrawerTabs.count();
  let mAllVisible = true;
  for (let i = 0; i < mCount; i++) {
    const visible = await mDrawerTabs.nth(i).isVisible();
    const box = await mDrawerTabs.nth(i).boundingBox();
    const inViewport = box && box.x + box.width <= 391;
    if (!visible || !inViewport) mAllVisible = false;
    console.log(`  drawer tab ${i}: visible=${visible} box=${JSON.stringify(box)}`);
  }
  console.log("all drawer tabs accessible on mobile:", mAllVisible);

  // Click the last tab (Usage) to prove reachability
  await mDrawerTabs.nth(mCount - 1).click();
  await mpage.waitForTimeout(500);
  await mpage.screenshot({ path: `${OUT}/10-drawer-last-tab-mobile.png`, fullPage: true });
  console.log("last drawer tab clicked OK");

  await mctx.close();
  await browser.close();
  console.log("DONE");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
