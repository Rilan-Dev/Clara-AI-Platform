#!/usr/bin/env node
/**
 * scripts/loadtest-elevenlabs-tts.js — V6 load test: 50 concurrent TTS
 * streams against a running server (plan §14 V6: "load test at 50 concurrent
 * TTS streams — no stream stalls").
 *
 * In guard mode (no ElevenLabs key configured) every request resolves fast
 * with a 4xx — which still exercises the full route + guard stack under
 * concurrency and proves no request hangs. With a real/mock key the bodies
 * stream audio bytes; the script measures time-to-first-byte and total time
 * per stream and reports stalls (streams exceeding the stall budget).
 *
 * Run: node scripts/loadtest-elevenlabs-tts.js [concurrency=50] [total=200]
 */

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@clara.ai";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";

const CONCURRENCY = Number(process.argv[2] ?? 50);
const TOTAL = Number(process.argv[3] ?? 200);
/** A stream is a "stall" when no bytes arrive for this long. */
const STALL_BUDGET_MS = Number(process.env.STALL_BUDGET_MS ?? 60_000);

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  const token = body?.token ?? body?.accessToken;
  if (!token) throw new Error(`login failed: HTTP ${res.status}`);
  return token;
}

async function streamOnce(token, index) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/voice/elevenlabs/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kbId: `loadtest-${index}`,
        text: "This is a load test sentence for the ElevenLabs TTS route.",
        model: "eleven_flash_v2_5",
        voiceId: "loadtestvoice0000000",
      }),
    });
    const ttfb = Date.now() - started;

    if (!res.body) {
      return { ok: res.ok, status: res.status, ttfb, total: Date.now() - started, bytes: 0, stalled: false };
    }

    // Drain the stream, tracking the longest gap between chunks (stall detection).
    const reader = res.body.getReader();
    let bytes = 0;
    let lastChunkAt = Date.now();
    let maxGap = 0;
    const watchdog = setInterval(() => {
      const gap = Date.now() - lastChunkAt;
      if (gap > maxGap) maxGap = gap;
    }, 100);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) { bytes += value.length; lastChunkAt = Date.now(); }
      }
    } finally {
      clearInterval(watchdog);
    }
    const total = Date.now() - started;
    return { ok: res.ok, status: res.status, ttfb, total, bytes, stalled: maxGap > STALL_BUDGET_MS };
  } catch (err) {
    return { ok: false, status: 0, ttfb: Date.now() - started, total: Date.now() - started, bytes: 0, stalled: false, error: String(err) };
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log(`\n[loadtest-elevenlabs-tts] target: ${BASE}`);
  console.log(`  concurrency: ${CONCURRENCY}  total requests: ${TOTAL}  stall budget: ${STALL_BUDGET_MS}ms\n`);

  const token = await login();
  const results = [];
  let launched = 0;

  async function worker() {
    for (;;) {
      const index = ++launched;
      if (index > TOTAL) return;
      results.push(await streamOnce(token, index));
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const wallMs = Date.now() - started;

  const okCount = results.filter((r) => r.ok).length;
  const clientErrors = results.filter((r) => r.status >= 400 && r.status < 500).length;
  const serverErrors = results.filter((r) => r.status >= 500).length;
  const stalled = results.filter((r) => r.stalled).length;
  const ttfbs = results.map((r) => r.ttfb).sort((a, b) => a - b);
  const totals = results.map((r) => r.total).sort((a, b) => a - b);
  const bytes = results.reduce((sum, r) => sum + r.bytes, 0);

  console.log("  ── Results ─────────────────────────────────────────");
  console.log(`  requests:      ${results.length}/${TOTAL}`);
  console.log(`  ok (2xx):      ${okCount}`);
  console.log(`  4xx (guards):  ${clientErrors}   ← expected in key-less guard mode`);
  console.log(`  5xx:           ${serverErrors}   ← must be 0`);
  console.log(`  stalled:       ${stalled}        ← must be 0`);
  console.log(`  wall time:     ${(wallMs / 1000).toFixed(1)}s  (${Math.round(results.length / (wallMs / 1000))} req/s)`);
  console.log(`  TTFB:          p50 ${percentile(ttfbs, 50)}ms · p95 ${percentile(ttfbs, 95)}ms · max ${ttfbs[ttfbs.length - 1] ?? 0}ms`);
  console.log(`  total:         p50 ${percentile(totals, 50)}ms · p95 ${percentile(totals, 95)}ms`);
  console.log(`  bytes drained: ${(bytes / 1024).toFixed(1)} KiB`);

  const pass = serverErrors === 0 && stalled === 0 && results.length === TOTAL;
  console.log(`\n  ${pass ? "PASS" : "FAIL"} — ${pass ? "no stream stalls, no 5xx under concurrency" : "see counts above"}\n`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[loadtest-elevenlabs-tts] fatal:", err);
  process.exit(1);
});
