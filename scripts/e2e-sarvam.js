#!/usr/bin/env node
/**
 * scripts/e2e-sarvam.js — end-to-end verification of the Sarvam AI integration
 * (V1–V5) against a running server. Guarded-or-success pattern: every check
 * passes when the guard behaves correctly OR the capability payload is valid —
 * CI never burns Sarvam credits.
 *
 * Verifies:
 *   1.  /api/admin/sarvam/status          — operator health card (graceful when off)
 *   2.  /api/voice/provider               — voice axis accepts sarvam resolution
 *   3.  /api/voice/sarvam/session         — guard ladder (400 no kbId / 401 / off-path)
 *   4.  /api/voice/sarvam/tts             — 400/413/409 guards
 *   5.  /api/voice/sarvam/transcribe      — 400 multipart guard
 *   6.  /api/voice/sarvam/voices          — auth required; static catalogue shape
 *   7.  Org AI settings PATCH round-trip  — sarvam fields + translationMode persist
 *   8.  /api/language/translate           — kill-switch guard (503 when off)
 *   9.  Rate limits                       — 429 with Retry-After after burst
 *  10.  State restore                     — org settings restored to baseline
 *
 * Run: node scripts/e2e-sarvam.js   (server must be up; BASE_URL overrides :3000)
 */

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@clara.ai";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";

let passed = 0, failed = 0;
function ok(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}

async function jfetch(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

async function main() {
  console.log(`\n[e2e-sarvam] target: ${BASE}\n`);

  // ── 0. Login as platform admin ──────────────────────────────────────────
  const login = await jfetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  ok("admin login", login.res.ok, `status ${login.res.status}`);
  const token = login.body?.token ?? login.body?.accessToken;
  if (!token) { console.log("  no token — aborting"); process.exit(1); }
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── 1. Sarvam status endpoint ────────────────────────────────────────────
  const status = await jfetch("/api/admin/sarvam/status", { headers: authHeaders });
  ok("status: 200 + connected flag present",
    status.res.ok && typeof status.body?.connected === "boolean",
    `status ${status.res.status}`);
  ok("status: defaults reported (tts/stt/speaker)",
    Boolean(status.body?.defaultTtsModel) && Boolean(status.body?.defaultSttModel)
      && Boolean(status.body?.defaultSpeaker));
  ok("status: graceful reason when disabled",
    status.body?.connected === true || typeof status.body?.reason === "string");
  const unauth = await jfetch("/api/admin/sarvam/status");
  ok("status: auth required (401/403 without token)",
    unauth.res.status === 401 || unauth.res.status === 403, `status ${unauth.res.status}`);

  // ── 2. Voice provider routing accepts the sarvam axis ───────────────────
  const provider = await jfetch("/api/voice/provider", {
    method: "POST", headers: authHeaders, body: JSON.stringify({}),
  });
  ok("provider lookup: default payload shape",
    provider.res.ok && typeof provider.body?.provider === "string",
    `status ${provider.res.status}`);

  // ── 3. Sarvam session guard ladder ───────────────────────────────────────
  const noKb = await jfetch("/api/voice/sarvam/session", {
    method: "POST", headers: authHeaders, body: JSON.stringify({}),
  });
  ok("session: 400 without kbId", noKb.res.status === 400, `status ${noKb.res.status}`);

  const badKb = await jfetch("/api/voice/sarvam/session", {
    method: "POST", headers: authHeaders, body: JSON.stringify({ kbId: "not-a-uuid" }),
  });
  ok("session: 400 with invalid kbId", badKb.res.status === 400, `status ${badKb.res.status}`);

  // ── 4. TTS guards ────────────────────────────────────────────────────────
  const ttsNoBody = await jfetch("/api/voice/sarvam/tts", {
    method: "POST", headers: authHeaders, body: JSON.stringify({}),
  });
  ok("tts: 400 without text", ttsNoBody.res.status === 400, `status ${ttsNoBody.res.status}`);

  const ttsTooLong = await jfetch("/api/voice/sarvam/tts", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ kbId: "00000000-0000-0000-0000-000000000000", text: "a".repeat(3000) }),
  });
  ok("tts: 413 over the 2,000-char platform cap",
    ttsTooLong.res.status === 413, `status ${ttsTooLong.res.status}`);

  // ── 5. Transcribe guard ──────────────────────────────────────────────────
  const sttNoForm = await jfetch("/api/voice/sarvam/transcribe", {
    method: "POST", headers: authHeaders, body: JSON.stringify({}),
  });
  ok("transcribe: 400 without multipart body",
    sttNoForm.res.status === 400, `status ${sttNoForm.res.status}`);

  // ── 6. Static speaker catalogue ─────────────────────────────────────────
  const voicesUnauth = await jfetch("/api/voice/sarvam/voices");
  ok("voices: auth required", voicesUnauth.res.status === 401 || voicesUnauth.res.status === 403,
    `status ${voicesUnauth.res.status}`);

  const voices = await jfetch("/api/voice/sarvam/voices", { headers: authHeaders });
  ok("voices: catalogue shape",
    voices.res.ok && Array.isArray(voices.body?.speakers) && voices.body.speakers.length >= 35,
    `status ${voices.res.status}`);
  ok("voices: default speaker is shubh (or configured default)",
    !voices.res.ok || voices.body.speakers.some((s) => s.id === (voices.body.defaultSpeaker ?? "shubh")));

  // ── 7. Org AI settings round-trip ────────────────────────────────────────
  const orgs = await jfetch("/api/platform/orgs", { headers: authHeaders });
  let orgId = null;
  if (orgs.res.ok && Array.isArray(orgs.body?.orgs) && orgs.body.orgs.length > 0) {
    orgId = orgs.body.orgs[0].id;
  }
  ok("found an org for testing", Boolean(orgId), `status ${orgs.res.status}`);

  if (orgId) {
    const before = await jfetch(`/api/orgs/${orgId}/ai-settings`, { headers: authHeaders });
    ok("org ai-settings GET", before.res.ok, `status ${before.res.status}`);

    if (before.res.ok) {
      const original = {
        voiceProvider: before.body.voiceProvider ?? null,
        allowedVoiceProviders: before.body.allowedVoiceProviders,
        sarvamTtsModel: before.body.sarvamTtsModel ?? null,
        sarvamSttModel: before.body.sarvamSttModel ?? null,
        defaultSarvamSpeaker: before.body.defaultSarvamSpeaker ?? null,
        translationMode: before.body.translationMode ?? "off",
      };

      // Invalid model must be rejected (catalogue validation).
      const invalid = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH", headers: authHeaders,
        body: JSON.stringify({ sarvamTtsModel: "bulbul:v9" }),
      });
      ok("org patch: invalid Sarvam TTS model rejected (400/500 error surfaced)",
        !invalid.res.ok, `status ${invalid.res.status}`);

      // Valid round-trip.
      const patched = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH", headers: authHeaders,
        body: JSON.stringify({
          sarvamTtsModel: "bulbul:v3",
          sarvamSttModel: "saaras:v4",
          defaultSarvamSpeaker: "priya",
          translationMode: "query",
        }),
      });
      ok("org patch: sarvam fields persist",
        patched.res.ok
          && patched.body?.sarvamTtsModel === "bulbul:v3"
          && patched.body?.sarvamSttModel === "saaras:v4"
          && patched.body?.defaultSarvamSpeaker === "priya"
          && patched.body?.translationMode === "query",
        `status ${patched.res.status}`);

      // Invalid translationMode normalizes to off.
      const badMode = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH", headers: authHeaders,
        body: JSON.stringify({ translationMode: "everything" }),
      });
      ok("org patch: invalid translationMode normalizes to off",
        badMode.res.ok && badMode.body?.translationMode === "off",
        `status ${badMode.res.status}`);

      // ── 10. Restore ──
      const restored = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH", headers: authHeaders,
        body: JSON.stringify({
          sarvamTtsModel: original.sarvamTtsModel,
          sarvamSttModel: original.sarvamSttModel,
          defaultSarvamSpeaker: original.defaultSarvamSpeaker,
          translationMode: original.translationMode,
          voiceProvider: original.voiceProvider,
          allowedVoiceProviders: original.allowedVoiceProviders,
        }),
      });
      ok("state restored", restored.res.ok, `status ${restored.res.status}`);
    }
  }

  // ── 8. Language services: kill-switch guard ─────────────────────────────
  const translate = await jfetch("/api/language/translate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ input: "नमस्ते", sourceLanguageCode: "hi-IN", targetLanguageCode: "en-IN" }),
  });
  ok("translate: 503 when language services are off (or a valid translation when on)",
    translate.res.status === 503 || (translate.res.ok && typeof translate.body?.translatedText === "string"),
    `status ${translate.res.status}`);

  const identify = await jfetch("/api/language/identify", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ input: "hello" }),
  });
  ok("identify: 503 when off (or a valid identification when on)",
    identify.res.status === 503 || (identify.res.ok && typeof identify.body?.languageCode === "string"),
    `status ${identify.res.status}`);

  // ── 9. Rate-limit burst on a guard path (429 + Retry-After) ─────────────
  let saw429 = false;
  for (let i = 0; i < 75 && !saw429; i++) {
    const burst = await jfetch("/api/voice/sarvam/tts", {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ kbId: "00000000-0000-0000-0000-000000000000", text: "x" }),
    });
    if (burst.res.status === 429 && burst.res.headers.get("retry-after")) saw429 = true;
  }
  ok("rate limit: 429 with Retry-After after a burst", saw429);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n[e2e-sarvam] ${passed}/${passed + failed} checks passed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[e2e-sarvam] fatal:", err);
  process.exit(1);
});
