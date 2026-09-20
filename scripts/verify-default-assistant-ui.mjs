import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@clara.ai";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";
const OUT = "/home/z/my-project/tool-results/ui-verify2";
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  console.log("logged in →", page.url());

  // ── 1. Default Assistant workspace: ConfigEditor tabs ─────────────────────
  await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: /default assistant/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01-default-assistant-identity.png`, fullPage: true });

  const tabBtns = await page.locator("button", { hasText: /^(Identity|Behaviour|Language|Voice|Preview)$/ }).allTextContents();
  console.log("editor tab buttons found:", JSON.stringify(tabBtns));

  // Switch through the tabs to confirm each renders
  for (const label of ["Behaviour", "Language", "Voice", "Preview"]) {
    await page.locator("button", { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/02-default-assistant-preview.png`, fullPage: true });

  // Behaviour tab shows the new generation fields
  await page.locator("button", { hasText: /^Behaviour$/ }).first().click();
  await page.waitForTimeout(400);
  const behaviourText = await page.textContent("body");
  console.log("behaviour tab has Temperature:", behaviourText.includes("Temperature"));
  console.log("behaviour tab has Max Response Tokens:", behaviourText.includes("Max Response Tokens"));
  console.log("behaviour tab has Strict Mode:", behaviourText.includes("Strict Mode"));
  await page.screenshot({ path: `${OUT}/03-default-assistant-behaviour.png`, fullPage: true });

  // Identity tab has colours
  await page.locator("button", { hasText: /^Identity$/ }).first().click();
  await page.waitForTimeout(400);
  const identityText = await page.textContent("body");
  console.log("identity tab has Primary Colour:", identityText.includes("Primary Colour"));

  // ── 2. Providers: ElevenLabs now enabled (DB flag flipped) ────────────────
  await page.getByRole("tab", { name: /providers & models/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: /voice chat/i }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04-providers-voicechat.png`, fullPage: true });
  const vcText = await page.textContent("body");
  console.log("ElevenLabs card present in Voice Chat:", vcText.includes("ElevenLabs"));
  console.log("ElevenLabs still kill-switch-disabled:", vcText.includes("operational flag off"));

  // ── 3. Publish screen explore link ────────────────────────────────────────
  const agentId = "a742e522-cf51-4875-a98d-7a766c7d437e";
  const orgId = "03f3b6b9-ed43-4447-80d5-cc63ddc82c7b";
  await page.goto(`${BASE}/orgs/${orgId}/agents/${agentId}/publish`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/05-publish-screen.png`, fullPage: true });
  const pubText = await page.textContent("body");
  console.log("publish screen has 'Access the published agent':", pubText.includes("Access the published agent"));
  console.log("publish screen active deployment listed:", pubText.includes("Live"));
  console.log("platform-admin generate disabled note:", pubText.includes("Platform admins can view but not generate"));

  // ── 4. Mobile responsive check of Default Assistant ───────────────────────
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await login(mpage);
  await mpage.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(800);
  await mpage.getByRole("tab", { name: /default assistant/i }).click();
  await mpage.waitForTimeout(1500);
  await mpage.screenshot({ path: `${OUT}/06-default-assistant-mobile.png`, fullPage: true });
  const mEditorBtns = mpage.locator("button", { hasText: /^(Identity|Behaviour|Language|Voice|Preview)$/ });
  const mCount = await mEditorBtns.count();
  let allVisible = true;
  for (let i = 0; i < mCount; i++) {
    const box = await mEditorBtns.nth(i).boundingBox();
    const visible = await mEditorBtns.nth(i).isVisible();
    if (!visible || !box || box.x + box.width > 391) allVisible = false;
  }
  console.log("mobile editor tabs all accessible:", allVisible);

  // Mobile publish screen
  await mpage.goto(`${BASE}/orgs/${orgId}/agents/${agentId}/publish`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(1200);
  await mpage.screenshot({ path: `${OUT}/07-publish-mobile.png`, fullPage: true });
  console.log("mobile publish screen renders access card:", (await mpage.textContent("body")).includes("Access the published agent"));

  await mctx.close();
  await ctx.close();
  await browser.close();
  console.log("DONE");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
