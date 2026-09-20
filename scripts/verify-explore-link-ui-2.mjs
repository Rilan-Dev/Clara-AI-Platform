import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ORG_ADMIN_EMAIL = "uitest-explore@clara-test.local";
const ORG_ADMIN_PASSWORD = "UiTest1234!";
const ORG_ID = "8c4d5690-5332-4cc1-876d-2c2f3d696f6d";
const AGENT_ID = "4c0bccc5-d56e-41ac-baf3-3c754481492a";
const OUT = "/home/z/my-project/tool-results/ui-verify2";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
});

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(2500);
}

const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const opage = await octx.newPage();
await login(opage, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD);

await opage.goto(`${BASE}/orgs/${ORG_ID}/agents/${AGENT_ID}/publish`, { waitUntil: "networkidle" });
await opage.waitForTimeout(1800);
const body0 = await opage.textContent("body");
console.log("access card visible (deployed):", body0.includes("Access the published agent"));
console.log("generate button present:", (await opage.getByRole("button", { name: /generate explore link/i }).count()) > 0);

await opage.getByRole("button", { name: /generate explore link/i }).click();
await opage.waitForTimeout(2200);
await opage.screenshot({ path: `${OUT}/09-explore-link.png`, fullPage: true });
const body = await opage.textContent("body");
console.log("chat widget URL shown:", body.includes("/embed/widget?key="));
console.log("voice URL shown:", body.includes("/embed/voice?key="));
console.log("regenerate button:", body.includes("Regenerate link"));
console.log("kb note:", body.includes("Explore KB"));

const widgetUrl = await opage.locator("p.break-all").first().textContent();
console.log("widget url head:", widgetUrl?.slice(0, 60));

// ── Anonymous visitor opens the widget URL ────────────────────────────────
const vctx = await browser.newContext({ viewport: { width: 420, height: 700 } });
const vpage = await vctx.newPage();
await vpage.goto(widgetUrl, { waitUntil: "networkidle" });
await vpage.waitForTimeout(3000);
const visitorBody = await vpage.textContent("body");
console.log("visitor widget renders:", /Explore Agent|Clara/i.test(visitorBody ?? ""));
console.log("visitor not blocked:", !(visitorBody ?? "").includes("disabled for this knowledge base"));
await vpage.screenshot({ path: `${OUT}/10-visitor-widget.png` });
await vctx.close();

// ── Regenerate: old key stops working, new key works ─────────────────────
const regen = opage.getByRole("button", { name: /regenerate link/i });
await regen.click();
await opage.waitForTimeout(2200);
const newUrl = await opage.locator("p.break-all").first().textContent();
console.log("regenerated url differs:", newUrl !== widgetUrl);
const vctx2 = await browser.newContext({ viewport: { width: 420, height: 700 } });
const vpage2 = await vctx2.newPage();
await vpage2.goto(widgetUrl, { waitUntil: "networkidle" }); // OLD url
await vpage2.waitForTimeout(2500);
const oldKeyBody = await vpage2.textContent("body");
console.log("old key now rejected:", (oldKeyBody ?? "").includes("Invalid API key") || (oldKeyBody ?? "").toLowerCase().includes("invalid"));
await vctx2.close();

// ── Mobile publish screen with link ──────────────────────────────────────
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mpage = await mctx.newPage();
await login(mpage, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD);
await mpage.goto(`${BASE}/orgs/${ORG_ID}/agents/${AGENT_ID}/publish`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(1800);
const mGen = mpage.getByRole("button", { name: /generate explore link/i });
if ((await mGen.count()) > 0) {
  await mGen.click();
  await mpage.waitForTimeout(2200);
}
await mpage.screenshot({ path: `${OUT}/11-publish-mobile.png`, fullPage: true });
console.log("mobile shows link:", (await mpage.textContent("body")).includes("/embed/widget?key="));

await mctx.close();
await octx.close();
await browser.close();
console.log("DONE");
