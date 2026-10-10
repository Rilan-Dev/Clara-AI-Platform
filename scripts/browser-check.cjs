// Quick browser check: does the login page hydrate?
const { chromium } = require("/home/z/my-project/Clara-AI-Platform/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(4000);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 200));
  console.log("BODY TEXT:", JSON.stringify(text));
  console.log("LOGS:", logs.length ? logs.slice(0, 20).join("\n") : "(none)");

  // If login form is present, try logging in and navigating to templates
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (emailInput) {
    await emailInput.fill("admin@clara.ai");
    await page.fill('input[type="password"]', "Admin1234!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await page.goto("http://localhost:3000/settings/templates", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(6000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log("TEMPLATES PAGE:", JSON.stringify(t.slice(0, 400)));
    const hasMonaco = await page.evaluate(() => document.querySelectorAll(".monaco-editor").length);
    console.log("MONaco present:", hasMonaco);
    await page.screenshot({ path: "/home/z/my-project/scripts/templates-page.png", fullPage: false });
    console.log("screenshot saved");
  }
  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
