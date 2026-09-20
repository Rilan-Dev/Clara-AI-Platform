import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@clara.ai";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";
const ORG_ADMIN_EMAIL = "uitest-explore@clara-test.local";
const ORG_ADMIN_PASSWORD = "UiTest1234!";
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

async function main() {
  // ── 0. Create throwaway workspace as platform admin (API) ────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("platform admin logged in →", page.url());

  const createRes = await page.evaluate(async (body) => {
    const res = await fetch("/api/platform/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, {
    orgName: "UI Test Explore",
    adminEmail: ORG_ADMIN_EMAIL,
    adminFullName: "UI Test Explorer",
    adminPassword: ORG_ADMIN_PASSWORD,
    agentName: "Explore Agent",
    kbName: "Explore KB",
  });
  console.log("workspace create status:", createRes.status);
  if (createRes.status !== 201) {
    console.error("workspace create failed:", JSON.stringify(createRes.body).slice(0, 200));
    process.exit(1);
  }
  const orgId = createRes.body.org.id;
  const agentId = createRes.body.agent.id;
  console.log("org:", orgId, "agent:", agentId);
  await ctx.close();

  // ── 1. Log in as the org admin ───────────────────────────────────────────
  const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const opage = await octx.newPage();
  await login(opage, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD);
  console.log("org admin logged in →", opage.url());

  // ── 2. Publish screen: save version, publish with public access ──────────
  await opage.goto(`${BASE}/orgs/${orgId}/agents/${agentId}/publish`, { waitUntil: "networkidle" });
  await opage.waitForTimeout(1500);
  let body = await opage.textContent("body");
  console.log("access card (pre-publish):", body.includes("Publish a version first"));

  // Save draft as v1 if no versions
  const saveV1 = opage.getByRole("button", { name: /save draft as v1/i });
  if (await saveV1.count()) {
    await saveV1.click();
    await opage.waitForTimeout(2000);
  }
  // Publish v1 (public access default true)
  const publishBtn = opage.getByRole("button", { name: /publish v1/i });
  if (await publishBtn.count()) {
    await publishBtn.click();
    await opage.waitForTimeout(2500);
  }
  await opage.screenshot({ path: `${OUT}/08-publish-after.png`, fullPage: true });
  body = await opage.textContent("body");
  console.log("published message shown:", /Production is now running/i.test(body));
  console.log("access card visible:", body.includes("Access the published agent"));

  // ── 3. Generate explore link ─────────────────────────────────────────────
  const generateBtn = opage.getByRole("button", { name: /generate explore link/i });
  console.log("generate button present:", (await generateBtn.count()) > 0);
  await generateBtn.click();
  await opage.waitForTimeout(2000);
  await opage.screenshot({ path: `${OUT}/09-explore-link.png`, fullPage: true });
  body = await opage.textContent("body");
  console.log("chat widget URL shown:", body.includes("/embed/widget?key="));
  console.log("voice URL shown:", body.includes("/embed/voice?key="));
  console.log("regenerate button:", body.includes("Regenerate link"));

  // Extract the actual widget URL and open it as a visitor
  const widgetUrl = await opage.locator("p.break-all").first().textContent();
  console.log("widget url:", widgetUrl?.slice(0, 80), "…");

  // ── 4. Open the widget URL as an anonymous visitor ───────────────────────
  const vctx = await browser.newContext({ viewport: { width: 420, height: 700 } });
  const vpage = await vctx.newPage();
  await vpage.goto(widgetUrl, { waitUntil: "networkidle" });
  await vpage.waitForTimeout(2500);
  const visitorBody = await vpage.textContent("body");
  console.log("visitor widget renders assistant name:", /Explore Agent|Clara/i.test(visitorBody ?? ""));
  console.log("visitor widget NOT blocked:", !(visitorBody ?? "").includes("disabled for this knowledge base"));
  await vpage.screenshot({ path: `${OUT}/10-visitor-widget.png` });
  await vctx.close();

  // ── 5. Mobile publish screen ─────────────────────────────────────────────
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await login(mpage, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD);
  await mpage.goto(`${BASE}/orgs/${orgId}/agents/${agentId}/publish`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(1500);
  const mBody = await mpage.textContent("body");
  console.log("mobile access card visible:", mBody.includes("Access the published agent"));
  const mGen = mpage.getByRole("button", { name: /generate explore link/i });
  if ((await mGen.count()) > 0) {
    await mGen.click();
    await mpage.waitForTimeout(2000);
  }
  await mpage.screenshot({ path: `${OUT}/11-publish-mobile.png`, fullPage: true });
  console.log("mobile widget URL shown:", (await mpage.textContent("body")).includes("/embed/widget?key="));

  await mctx.close();
  await octx.close();
  await browser.close();

  // Cleanup marker for manual deletion reference
  fs.writeFileSync(`${OUT}/test-workspace.json`, JSON.stringify({ orgId, agentId, orgAdminEmail: ORG_ADMIN_EMAIL }, null, 2));
  console.log("DONE");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
