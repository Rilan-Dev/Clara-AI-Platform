// Focused debug: add-variable flow inside the Variables manager dialog.
const { chromium } = require("/home/z/my-project/Clara-AI-Platform/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") console.log("[console-error]", m.text()); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  let apiCalls = [];
  page.on("request", (r) => { if (r.url().includes("email-variables")) apiCalls.push(`${r.method()} ${r.url().split("/api")[1]} ${r.postData() ?? ""}`); });
  page.on("response", async (r) => {
    if (r.url().includes("/api/")) {
      const body = await r.text().catch(() => "");
      console.log(`[resp] ${r.request().method()} ${r.url().split("localhost:3000")[1]?.slice(0, 60)} → ${r.status()} ${body.slice(0, 150)}`);
    }
  });

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "admin@clara.ai");
  await page.fill('input[type="password"]', "Admin1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  await page.goto("http://localhost:3000/settings/templates", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: /Manage variables/ }).click();
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /New custom variable/ }).click();
  await page.waitForTimeout(500);

  // Debug: dump the form state
  const nameInput = page.locator('input[placeholder="supportEmail"]');
  const valueInput = page.locator('input[placeholder="support@yourcompany.com"]');
  console.log("name input count:", await nameInput.count());
  console.log("value input count:", await valueInput.count());

  await nameInput.fill("uiSmokeVar");
  await valueInput.fill("ui@smoke.test");
  console.log("name value:", await nameInput.inputValue());
  console.log("value filled:", await valueInput.inputValue());

  const addBtn = page.getByRole("button", { name: /^Add variable$/ });
  console.log("add button count:", await addBtn.count());
  console.log("add button disabled:", await addBtn.isDisabled());

  await addBtn.click();
  await page.waitForTimeout(3500);
  console.log("API CALLS:", JSON.stringify(apiCalls, null, 2));
  await page.screenshot({ path: "/home/z/my-project/scripts/ui-debug-add-var.png" });

  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
