/**
 * Verify: (1) agent workspace "Assistant & AI" 3-surface AI model selector with
 * INDEPENDENT Voice Chat and Realtime Voice provider picks; (2) mic
 * pause/resume (mute) buttons on the embed voice surfaces — widget voice-chat,
 * standalone realtime voice page, and the landing voice iframe.
 *
 * Read-only against real data except a throwaway org-admin user (cleaned up).
 * Vendor sessions are mocked at the network layer — no real provider calls.
 */
import { chromium } from "playwright";
import pg from "pg";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const scryptAsync = promisify(scrypt);

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT = "/home/z/my-project/tool-results/ui-verify";
readFileSync; // (unused placeholder removed below)

const ORG_ID = "03f3b6b9-ed43-4447-80d5-cc63ddc82c7b"; // Rilan Test Org (Pro plan)
const TEST_EMAIL = "verify.micmute@clara.ai";
const TEST_PASSWORD = "VerifyMic123!x";

const { agentId, embedKey } = JSON.parse(
  readFileSync("/home/z/my-project/tool-results/verify-env.json", "utf8"),
);

function dbUrl() {
  const raw = readFileSync("/home/z/my-project/.env", "utf8");
  return raw
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="))
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function createTestUser() {
  const pool = new pg.Pool({ connectionString: dbUrl(), ssl: false });
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, status, email_verified)
     VALUES ($1, $2, 'Mic Mute Verifier', 'active', true)
     RETURNING id`,
    [TEST_EMAIL, passwordHash],
  );
  const userId = rows[0].id;
  const { rows: role } = await pool.query(`SELECT id FROM roles WHERE name = 'org_admin' LIMIT 1`);
  await pool.query(
    `INSERT INTO org_members (org_id, user_id, role_id) VALUES ($1, $2, $3)`,
    [ORG_ID, userId, role[0].id],
  );
  await pool.end();
  return userId;
}

async function cleanupTestUser(userId) {
  const pool = new pg.Pool({ connectionString: dbUrl(), ssl: false });
  await pool.query(`DELETE FROM org_members WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await pool.end();
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"], form button').last().click();
  await page.waitForURL(/dashboard|orgs|agents|settings|admin/i, { timeout: 20000 });
}

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗ FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
};

// ─────────────────────────────────────────────────────────────────────────────
async function verifyWorkspace(page) {
  await page.goto(`${BASE}/orgs/${ORG_ID}/agents/${agentId}/config`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/ws-01-ai-models-chat.png`, fullPage: true });

  const body = await page.textContent("body");

  // The old single-card UI ("Follow voice-chat") must NOT exist anymore.
  check("workspace: legacy 'Follow voice-chat' option gone", !body.includes("Follow voice-chat"));

  // The three capability surfaces render as tabs/segmented buttons.
  check("workspace: 'AI runtime configuration' card present", body.includes("AI runtime configuration"));
  check("workspace: 'independent capability slots' hint present", body.includes("independent capability slots"));

  // ── Voice Chat surface must offer its OWN provider selection ──────────────
  await page.getByRole("button", { name: /voice chat/i }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/ws-02-voice-chat-surface.png`, fullPage: true });
  const vcBody = await page.textContent("body");
  check("voice-chat surface: provider row present", vcBody.includes("Provider"));
  check("voice-chat surface: ElevenLabs offered", vcBody.includes("ElevenLabs"));
  check("voice-chat surface: Sarvam AI offered", vcBody.includes("Sarvam AI"));
  check("voice-chat surface: STT/TTS/speaker slots present",
    vcBody.includes("Voice Chat STT") && vcBody.includes("Voice Chat TTS") && vcBody.includes("Voice Chat speaker"));

  // Pick ElevenLabs for voice chat (independent selection).
  await page.getByRole("button", { name: /^ElevenLabs$/ }).first().click();
  await page.waitForTimeout(300);

  // ── Realtime surface: independent provider selection ─────────────────────
  await page.getByRole("button", { name: /realtime voice/i }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/ws-03-realtime-surface.png`, fullPage: true });
  const rtBody = await page.textContent("body");
  check("realtime surface: OpenAI offered", rtBody.includes("OpenAI"));
  check("realtime surface: ElevenLabs offered", rtBody.includes("ElevenLabs"));
  check("realtime surface: Sarvam AI offered", rtBody.includes("Sarvam AI"));
  check("realtime surface: independent slots present",
    rtBody.includes("Realtime LLM") && rtBody.includes("Realtime STT") && rtBody.includes("Realtime TTS") && rtBody.includes("Realtime speaker"));

  // Pick Sarvam for realtime — different from voice-chat's ElevenLabs.
  await page.getByRole("button", { name: /^Sarvam AI$/ }).first().click();
  await page.waitForTimeout(300);

  // ── Switch back to voice chat: the ElevenLabs pick must be retained ───────
  await page.getByRole("button", { name: /voice chat/i }).first().click();
  await page.waitForTimeout(600);
  const vcSelected = await page.getByRole("button", { name: /^ElevenLabs$/ }).first().getAttribute("class");
  check("independence: voice-chat keeps ElevenLabs while realtime picks Sarvam",
    /primary\/40|bg-primary/.test(vcSelected ?? ""));
  await page.screenshot({ path: `${OUT}/ws-04-independence-kept.png`, fullPage: true });
}

// ─────────────────────────────────────────────────────────────────────────────
async function verifyEmbedMute(page, url, screenshotPrefix, startButton) {
  // Keep the vendor SDP exchange hanging → status stays "connecting" AFTER
  // getUserMedia, so the mute control is live without any real provider call.
  await page.route("**/api/embed/session*", async (route) => {
    const calls = (page.__sessionCalls ?? 0) + 1;
    page.__sessionCalls = calls;
    if (calls === 1) {
      // useVoiceClient.resolveProvider — OpenAI pipeline, voice enabled.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ provider: "openai", flags: { voiceEnabled: true, realtimeEnabled: true } }),
      });
    } else {
      // useOpenAIRealtime session bootstrap — fake ephemeral key.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ client_secret: { value: "sk-test-ephemeral" }, voice: "alloy" }),
      });
    }
  });
  await page.route("**/api.openai.com/v1/realtime/calls*", async (route) => {
    await new Promise((r) => setTimeout(r, 60_000));
    await route.fulfill({ status: 504, body: "{}" });
  });
  await page.route("**/api/embed/voice-connect*", async (route) => {
    await new Promise((r) => setTimeout(r, 60_000));
    await route.fulfill({ status: 504, body: "{}" });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Start the voice session (widget: mic button; voice pages: big start button).
  const btn = page.locator(startButton).first();
  await btn.click();
  await page.waitForTimeout(2500); // getUserMedia + ICE gather

  // Mute control must now be present.
  const muteBtn = page.locator('[aria-label="Pause microphone"], [aria-label="Resume microphone"]').first();
  const muteVisible = await muteBtn.count() > 0 && await muteBtn.isVisible().catch(() => false);
  check(`${screenshotPrefix}: pause-mic button rendered while session connects`, muteVisible);

  if (muteVisible) {
    await page.screenshot({ path: `${OUT}/${screenshotPrefix}-1-session-live.png` });
    await muteBtn.click();
    await page.waitForTimeout(400);
    const pressed = await muteBtn.getAttribute("aria-pressed");
    check(`${screenshotPrefix}: aria-pressed=true after pause`, pressed === "true");

    // The real mic track (fake device) must be disabled — end-to-end proof.
    const disabled = await page.evaluate(() =>
      (window.__probeTracks ?? []).every((t) => t.enabled === false) && (window.__probeTracks ?? []).length > 0,
    );
    check(`${screenshotPrefix}: mic track.enabled=false end-to-end`, disabled);
    await page.screenshot({ path: `${OUT}/${screenshotPrefix}-2-muted.png` });

    // Resume.
    await muteBtn.click();
    await page.waitForTimeout(400);
    const pressedAfter = await muteBtn.getAttribute("aria-pressed");
    const enabled = await page.evaluate(() =>
      (window.__probeTracks ?? []).every((t) => t.enabled === true),
    );
    check(`${screenshotPrefix}: resume restores track.enabled=true and aria-pressed=false`,
      pressedAfter === "false" && enabled);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({
    executablePath: "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  let userId = null;
  try {
    // ── Part 1: workspace 3-surface selector ────────────────────────────────
    userId = await createTestUser();
    const wsCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wsPage = await wsCtx.newPage();
    await login(wsPage, TEST_EMAIL, TEST_PASSWORD);
    console.log("workspace login OK →", wsPage.url());
    await verifyWorkspace(wsPage);
    await wsCtx.close();

    // ── Part 2: embed mute controls ─────────────────────────────────────────
    const mkPage = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        window.__probeTracks = [];
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const stream = await orig(constraints);
          for (const t of stream.getAudioTracks()) window.__probeTracks.push(t);
          return stream;
        };
      });
      return { ctx, page };
    };

    // 2a. Chat widget with voice (voice chat mode in iframe)
    {
      const { ctx, page } = await mkPage();
      await verifyEmbedMute(
        page,
        `${BASE}/embed/widget?key=${embedKey}`,
        "widget",
        'button[title="Start voice"], .clara-voice-btn',
      );
      await ctx.close();
    }

    // 2b. Standalone realtime voice page
    {
      const { ctx, page } = await mkPage();
      await verifyEmbedMute(
        page,
        `${BASE}/embed/voice?key=${embedKey}`,
        "voicepage",
        'button:has-text("Start Voice Session")',
      );
      await ctx.close();
    }

    // 2c. Landing voice iframe (raw WebRTC implementation)
    {
      const { ctx, page } = await mkPage();
      await verifyEmbedMute(
        page,
        `${BASE}/embed/landing-demo?key=${embedKey}&mode=voice`,
        "landing",
        'button:has-text("Start Voice Session")',
      );
      await ctx.close();
    }
  } finally {
    if (userId) await cleanupTestUser(userId).catch((e) => console.error("cleanup:", e.message));
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══ ${results.length - failed.length}/${results.length} checks passed ═══`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(" | "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
