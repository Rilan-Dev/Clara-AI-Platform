// Browser verification of the ElevenLabs V4–V6 admin surfaces:
// login → org settings (Mode B panel: bindings/disclosure/studio/history)
//      → settings/ai (status card flag chips).
const { chromium } = require("/home/z/my-project/Clara-AI-Platform/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  // Login
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "admin@clara.ai");
  await page.fill('input[type="password"]', "Admin1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // Discover an org from the orgs list API (page uses JS navigation, not anchors)
  const orgsResponse = await page.evaluate(async () => {
    const res = await fetch("/api/platform/orgs", { headers: { "Content-Type": "application/json" } , credentials: "include"});
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.orgs?.[0]?.id ?? null;
  });
  const orgId = orgsResponse;
  console.log("CHECK org-discovered:", orgId ? `PASS (${orgId})` : "FAIL");

  // ── Org settings: Mode B panel ────────────────────────────────────────────
  await page.goto(`http://localhost:3000/orgs/${orgId}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const modeBPanel = await page.getByText("Conversational AI (Mode B)", { exact: false }).count();
  console.log("CHECK modeb-panel-rendered:", modeBPanel > 0 ? "PASS" : "FAIL");

  const bindingsHeading = await page.getByText("Agent bindings", { exact: true }).count();
  console.log("CHECK modeb-bindings-section:", bindingsHeading > 0 ? "PASS" : "FAIL");

  const historyHeading = await page.getByText("Recent conversations", { exact: true }).count();
  console.log("CHECK modeb-history-section:", historyHeading > 0 ? "PASS" : "FAIL");

  const studioHeading = await page.getByText("Voice studio", { exact: true }).count();
  console.log("CHECK modeb-studio-section:", studioHeading > 0 ? "PASS" : "FAIL");

  const cloneEntry = await page.getByText("Clone a voice", { exact: true }).count();
  console.log("CHECK studio-clone-card:", cloneEntry > 0 ? "PASS" : "FAIL");

  const designEntry = await page.getByText("Design a voice", { exact: true }).count();
  console.log("CHECK studio-design-card:", designEntry > 0 ? "PASS" : "FAIL");

  // The "Bind an agent" button opens the create form
  await page.getByRole("button", { name: /Bind an agent/ }).click().catch(() => {});
  await page.waitForTimeout(600);
  const createForm = await page.getByText("Knowledge base (RAG source)", { exact: false }).count();
  console.log("CHECK modeb-create-form-opens:", createForm > 0 ? "PASS" : "FAIL");
  await page.screenshot({ path: "/home/z/my-project/scripts/ui-modeb-panel.png", fullPage: true });

  // ── Settings → AI Configuration: status card flag chips ───────────────────
  await page.goto("http://localhost:3000/settings/ai", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const flagChip = await page.getByText(/Conversational AI \(Mode B\): (on|off)/).count();
  console.log("CHECK statuscard-modeb-flag-chip:", flagChip > 0 ? "PASS" : "FAIL");

  const cloneChip = await page.getByText(/Cloning: (on|off)/).count();
  console.log("CHECK statuscard-cloning-flag-chip:", cloneChip > 0 ? "PASS" : "FAIL");

  const designChip = await page.getByText(/Voice Design: (on|off)/).count();
  console.log("CHECK statuscard-design-flag-chip:", designChip > 0 ? "PASS" : "FAIL");

  // The env panel lists the new Mode B keys — unset fields are hidden until
  // the "show empty fields" switch is on (established panel UX).
  await page.locator("#show-empty").click().catch(async () => {
    // The switch may need its card scrolled into view first.
    await page.getByText("Haven't filled in yet", { exact: false }).scrollIntoViewIfNeeded().catch(() => {});
    await page.locator("#show-empty").click();
  });
  await page.waitForTimeout(800);

  const toolSecretField = await page.getByText("Mode-B Tool Secret", { exact: false }).count();
  console.log("CHECK envpanel-tool-secret-field:", toolSecretField > 0 ? "PASS" : "FAIL");

  const webhookSecretField = await page.getByText("Post-call Webhook Secret", { exact: false }).count();
  console.log("CHECK envpanel-webhook-secret-field:", webhookSecretField > 0 ? "PASS" : "FAIL");

  await page.screenshot({ path: "/home/z/my-project/scripts/ui-settings-ai-flags.png", fullPage: true });

  // Zero page errors across both screens
  console.log("CHECK zero-page-errors:", logs.length === 0 ? "PASS" : `FAIL (${logs.slice(0, 3).join(" | ")})`);

  await browser.close();
})().catch((err) => { console.error("FATAL:", err); process.exit(1); });
