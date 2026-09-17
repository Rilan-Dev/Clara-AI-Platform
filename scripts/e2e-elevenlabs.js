#!/usr/bin/env node
/**
 * scripts/e2e-elevenlabs.js — end-to-end verification of the ElevenLabs
 * voice integration (V0–V3) against a running server.
 *
 * Verifies:
 *   1.  /api/admin/elevenlabs/status      — operator health card (no key → graceful)
 *   2.  /api/voice/provider               — voice-provider axis in the response
 *   3.  /api/voice/elevenlabs/session     — 400 when ElevenLabs not enabled
 *   4.  /api/voice/elevenlabs/tts         — 400/409 guards without config
 *   5.  Org AI settings PATCH round-trip  — voiceProvider + elevenlabs fields persist
 *   6.  /api/voice/elevenlabs/voices      — auth required, catalog shape
 *   7.  Settings pages render (SSR)      — /settings/ai + /orgs/[id]/settings
 *
 * Run: node scripts/e2e-elevenlabs.js   (server must be up on :3000)
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
  console.log(`\n[e2e-elevenlabs] target: ${BASE}\n`);

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

  // ── 1. ElevenLabs status endpoint (no key configured → graceful) ────────
  const status = await jfetch("/api/admin/elevenlabs/status", { headers: authHeaders });
  ok("status: 200 + connected flag present", status.res.ok && typeof status.body?.connected === "boolean",
    `status ${status.res.status}`);
  ok("status: kill-switch reason when off", !status.body?.connected || status.body?.tier != null);

  // ── 2. Org list → first org for config round-trip ───────────────────────
  const orgs = await jfetch("/api/platform/workspaces", { method: "POST", headers: authHeaders, body: JSON.stringify({}) });
  let orgId = null;
  if (orgs.res.ok && Array.isArray(orgs.body) && orgs.body.length > 0) {
    orgId = orgs.body[0].id;
  } else {
    const orgList = await jfetch("/api/admin/orgs", { headers: authHeaders });
    if (orgList.res.ok && Array.isArray(orgList.body)) orgId = orgList.body[0]?.id ?? null;
  }
  ok("found an org for testing", Boolean(orgId), orgs.res.status);

  if (orgId) {
    // ── 5. Org AI settings GET (super admin now allowed) + PATCH round-trip ─
    const before = await jfetch(`/api/orgs/${orgId}/ai-settings`, { headers: authHeaders });
    ok("org ai-settings GET (super admin allowed)", before.res.ok, `status ${before.res.status}`);

    if (before.res.ok) {
      const original = {
        voiceProvider: before.body.voiceProvider ?? null,
        allowedVoiceProviders: before.body.allowedVoiceProviders,
      };
      const patched = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          voiceProvider: "elevenlabs",
          allowedVoiceProviders: ["openai", "gemini", "elevenlabs"],
          elevenlabsTtsModel: "eleven_turbo_v2_5",
          elevenlabsSttModel: "scribe_v1",
        }),
      });
      ok("org ai-settings PATCH voiceProvider=elevenlabs", patched.res.ok, JSON.stringify(patched.body).slice(0, 200));
      ok("PATCH persisted voiceProvider", patched.body?.voiceProvider === "elevenlabs");
      ok("PATCH persisted elevenlabsTtsModel", patched.body?.elevenlabsTtsModel === "eleven_turbo_v2_5");
      ok("PATCH persisted allowedVoiceProviders", Array.isArray(patched.body?.allowedVoiceProviders) && patched.body.allowedVoiceProviders.includes("elevenlabs"));

      // Invalid TTS model rejected
      const badModel = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ elevenlabsTtsModel: "gpt-4o-mini" }),
      });
      ok("invalid ElevenLabs TTS model rejected (400)", badModel.res.status === 400, `status ${badModel.res.status}`);

      // ── 2b. voice provider resolution surface ────────────────────────────
      const kbs = await jfetch("/api/kbs/all", { headers: authHeaders }).catch(() => null);
      let kbId = null;
      if (kbs && kbs.res.ok && Array.isArray(kbs.body) && kbs.body.length > 0) {
        kbId = kbs.body[0].id ?? kbs.body[0].kbId;
      }
      if (!kbId) {
        const agentList = await jfetch("/api/agents", { headers: authHeaders }).catch(() => null);
        if (agentList && agentList.res.ok && Array.isArray(agentList.body) && agentList.body.length > 0) {
          const agentKbs = await jfetch(`/api/agents/${agentList.body[0].id}/kbs`, { headers: authHeaders }).catch(() => null);
          if (agentKbs && agentKbs.res.ok && Array.isArray(agentKbs.body)) kbId = agentKbs.body[0]?.id;
        }
      }
      if (kbId) {
        const vp = await jfetch("/api/voice/provider", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ kbId }),
        });
        ok("voice provider endpoint responds", vp.res.ok || vp.res.status === 400, `status ${vp.res.status}`);
        if (vp.res.ok) {
          ok("voice provider carries voiceProvider field", typeof vp.body?.voiceProvider === "string",
            JSON.stringify(vp.body).slice(0, 120));
          ok("voice provider resolved elevenlabs (org override)", vp.body?.voiceProvider === "elevenlabs",
            `got ${vp.body?.voiceProvider}`);
        } else {
          // Expected when ElevenLabs is not enabled on the platform: the
          // resolver throws the kill-switch message as a 400.
          ok("voice provider 400 carries the kill-switch reason", /not available|not enabled|ELEVENLABS/i.test(String(vp.body?.error)),
            String(vp.body?.error).slice(0, 140));
        }

        // ── 3. ElevenLabs session guards ──────────────────────────────────
        const session = await jfetch("/api/voice/elevenlabs/session", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ kbId }),
        });
        ok("elevenlabs session: guarded (400 kill-switch while platform key absent)",
          session.res.status === 400 && /ELEVENLABS|not available|not enabled/i.test(String(session.body?.error)),
          `status ${session.res.status} ${String(session.body?.error).slice(0, 140)}`);

        // ── 4. TTS guards ──────────────────────────────────────────────────
        const tts = await jfetch("/api/voice/elevenlabs/tts", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ kbId, text: "Hello world." }),
        });
        ok("elevenlabs tts: guarded without config (400/409)",
          tts.res.status === 400 || tts.res.status === 409,
          `status ${tts.res.status}`);
      } else {
        console.log("  (no KB found — skipping KB-scoped checks)");
      }

      // Restore original org state.
      const restore = await jfetch(`/api/orgs/${orgId}/ai-settings`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          voiceProvider: original.voiceProvider,
          allowedVoiceProviders: original.allowedVoiceProviders,
        }),
      });
      ok("org state restored", restore.res.ok && (restore.body?.voiceProvider ?? null) === original.voiceProvider);
    }
  }

  // ── 6. Voices catalog requires auth ─────────────────────────────────────
  const voicesNoAuth = await jfetch("/api/voice/elevenlabs/voices");
  ok("voices catalog requires auth (401)", voicesNoAuth.res.status === 401, `status ${voicesNoAuth.res.status}`);
  const voicesAuth = await jfetch(`/api/voice/elevenlabs/voices?orgId=${orgId ?? "00000000-0000-0000-0000-000000000000"}`, { headers: authHeaders });
  ok("voices catalog responds with shape", voicesAuth.res.ok && Array.isArray(voicesAuth.body?.voices),
    `status ${voicesAuth.res.status}`);

  // ── 7. Settings pages render (SSR html) ─────────────────────────────────
  const aiPage = await fetch(`${BASE}/settings/ai`);
  ok("settings/ai page renders", aiPage.ok, `status ${aiPage.status}`);
  if (orgId) {
    const orgSettings = await fetch(`${BASE}/orgs/${orgId}/settings`);
    ok("org settings page renders", orgSettings.ok, `status ${orgSettings.status}`);
  }

  console.log(`\n[e2e-elevenlabs] ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("[e2e-elevenlabs] fatal:", err.message); process.exit(1); });
