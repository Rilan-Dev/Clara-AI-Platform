// Full UI check for the Email Templates workspace:
// login → templates page → Design tab (Monaco) → variable popover → manager dialog.
const { chromium } = require("/home/z/my-project/Clara-AI-Platform/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("dialog", (d) => d.accept().catch(() => {}));

  // Login
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "admin@clara.ai");
  await page.fill('input[type="password"]', "Admin1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // Templates page
  await page.goto("http://localhost:3000/settings/templates", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1) Overview tab visible with preview iframe
  const hasPreview = await page.locator('iframe[title="Email preview"]').count();
  console.log("CHECK overview-preview-iframe:", hasPreview > 0 ? "PASS" : "FAIL");

  // 2) Open the Design tab → Monaco must mount
  await page.getByRole("tab", { name: /Design/ }).click();
  await page.waitForTimeout(4000); // Monaco chunk load
  const monacoCount = await page.locator(".monaco-editor").count();
  console.log("CHECK design-monaco-mounted:", monacoCount > 0 ? "PASS" : `FAIL (${monacoCount})`);
  await page.screenshot({ path: "/home/z/my-project/scripts/ui-design-tab.png" });

  // 3) Variable picker popover opens and lists variables
  await page.getByRole("button", { name: /Insert variable/ }).click();
  await page.waitForTimeout(600);
  const popoverItems = await page.locator("[data-radix-popper-content-wrapper] .font-mono").count();
  console.log("CHECK variable-popover-items:", popoverItems > 0 ? `PASS (${popoverItems} shown)` : "FAIL");
  await page.screenshot({ path: "/home/z/my-project/scripts/ui-variable-popover.png" });
  await page.keyboard.press("Escape");

  // 4) Monaco autocomplete: focus editor, type "{{" and check suggest widget
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.type("{{", { delay: 120 });
  await page.waitForTimeout(1200);
  const suggest = await page.locator(".suggest-widget").count();
  const suggestVisible = suggest > 0 ? await page.locator(".suggest-widget").first().isVisible() : false;
  console.log("CHECK monaco-autocomplete:", suggestVisible ? "PASS" : `FAIL (widget=${suggest})`);
  await page.screenshot({ path: "/home/z/my-project/scripts/ui-monaco-autocomplete.png" });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // 5) Variables manager dialog
  await page.getByRole("button", { name: /Manage variables/ }).click();
  await page.waitForTimeout(1200);
  const dialogVisible = await page.getByText("Template variables").first().isVisible();
  const lockCount = await page.locator('svg.lucide-lock, [data-lucide="lock"]').count().catch(() => 0);
  const systemRow = await page.getByText("{{userName}}").first().isVisible().catch(() => false);
  console.log("CHECK variables-manager-dialog:", dialogVisible ? "PASS" : "FAIL");
  console.log("CHECK system-variables-listed:", systemRow ? "PASS" : "FAIL");
  await page.screenshot({ path: "/home/z/my-project/scripts/ui-variables-manager.png" });

  // 6) Add a custom variable through the UI
  await page.getByRole("button", { name: /New custom variable/ }).click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder="supportEmail"]').fill("uiSmokeVar");
  await page.locator('input[placeholder="support@yourcompany.com"]').fill("ui@smoke.test");
  await page.getByRole("button", { name: /^Add variable$/ }).click();
  await page.waitForTimeout(2500);
  const added = await page.getByText("{{uiSmokeVar}}").count();
  console.log("CHECK custom-variable-created:", added > 0 ? "PASS" : "FAIL");

  // 7) Delete it again (cleanup) via its trash button
  const row = page.locator("li", { hasText: "{{uiSmokeVar}}" }).first();
  await row.getByRole("button", { name: "Delete" }).click();
  await page.waitForTimeout(1200);
  // may hit the used-in confirm; accept it if present
  const gone = (await page.getByText("{{uiSmokeVar}}").count()) === 0;
  console.log("CHECK custom-variable-deleted:", gone ? "PASS" : "FAIL (confirm flow)");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 8) Settings & history tab
  await page.getByRole("tab", { name: /Settings & history/ }).click();
  await page.waitForTimeout(1500);
  const history = await page.getByText("Recent changes").first().isVisible().catch(() => false);
  const switchCount = await page.locator('[data-state], button[role="switch"]').count();
  console.log("CHECK settings-history-tab:", history ? "PASS" : "FAIL");

  console.log("PAGE ERRORS:", logs.length ? logs.join(" | ") : "(none)");
  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
