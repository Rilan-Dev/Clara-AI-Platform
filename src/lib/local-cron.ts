/**
 * src/lib/local-cron.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the `crons` from vercel.json on self-hosted deployments (VPS / Docker /
 * `npm start`).
 *
 * Vercel Cron only exists on Vercel. Without this, a self-hosted deployment
 * silently never sent onboarding reminders and never ran the scheduled
 * platform health check. vercel.json stays the single schedule for both
 * deployments; this calls the same routes over loopback with the same
 * `Authorization: Bearer $CRON_SECRET` header Vercel sends.
 *
 *   LOCAL_CRON_ENABLED=false  turns it off (e.g. when an external cron is used)
 *   CRON_SECRET               required — the cron routes reject calls without it
 *
 * Schedules are evaluated in UTC, like Vercel Cron.
 */

import vercelConfig from "../../vercel.json";
import { randomUUID } from "node:crypto";
import { featureForPath, isPlatformFeatureEnabled } from "@/lib/feature-availability";

export type CronJob = { path: string; schedule: string };

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6],  // day of week (0 = Sunday; 7 is accepted as Sunday too)
];

function fieldMatches(field: string, value: number, [min, max]: [number, number]): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    let from: number;
    let to: number;
    if (range === "*") {
      from = min;
      to = max;
    } else if (range.includes("-")) {
      [from, to] = range.split("-").map(Number);
    } else {
      from = Number(range);
      to = stepText ? max : from;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    for (let v = from; v <= to; v += step) {
      if (v === value || (max === 6 && v === 7 && value === 0)) return true;
    }
    return false;
  });
}

/** Standard 5-field cron match against a UTC date. */
export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ];
  const [minute, hour, dom, month, dow] = fields;
  const baseMatch =
    fieldMatches(minute, values[0], FIELD_RANGES[0]) &&
    fieldMatches(hour, values[1], FIELD_RANGES[1]) &&
    fieldMatches(month, values[3], FIELD_RANGES[3]);
  if (!baseMatch) return false;
  // POSIX rule: when both day fields are restricted, either may match.
  const domMatch = fieldMatches(dom, values[2], FIELD_RANGES[2]);
  const dowMatch = fieldMatches(dow, values[4], FIELD_RANGES[4]);
  if (dom !== "*" && dow !== "*") return domMatch || dowMatch;
  return domMatch && dowMatch;
}

export function configuredCronJobs(): CronJob[] {
  const crons = (vercelConfig as { crons?: CronJob[] }).crons ?? [];
  return crons.filter((job) => {
    if (typeof job.path !== "string" || typeof job.schedule !== "string") return false;
    const feature = featureForPath(job.path);
    return !feature || isPlatformFeatureEnabled(feature);
  });
}

let started = false;

export function startLocalCron(): void {
  if (started || process.env.VERCEL) return;
  if ((process.env.LOCAL_CRON_ENABLED ?? "true").toLowerCase() === "false") {
    console.info("[local-cron] disabled via LOCAL_CRON_ENABLED=false");
    return;
  }
  let secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Self-hosted deployments (Docker compose / VPS `npm start`) were silently
    // losing EVERY scheduled job — platform health checks, onboarding
    // reminders, WhatsApp health — because the admin never set CRON_SECRET.
    // The cron routes only need the header to MATCH; they never disclose the
    // value. Generate an internal session secret so the schedule actually
    // runs, and tell the operator how to keep it stable across restarts.
    // External callers cannot guess it, so the routes stay protected.
    secret = randomUUID().replace(/-/g, "");
    process.env.CRON_SECRET = secret;
    console.info(
      "[local-cron] CRON_SECRET was not set — generated an internal session secret so scheduled jobs still run. " +
        "Set CRON_SECRET in .env to keep it stable across restarts.",
    );
  }
  started = true;

  const jobs = configuredCronJobs();
  const port = process.env.PORT || "3000";
  const base = `http://127.0.0.1:${port}`;
  const running = new Set<string>();

  const run = async (job: CronJob) => {
    if (running.has(job.path)) return;
    running.add(job.path);
    const startedAt = Date.now();
    try {
      const res = await fetch(`${base}${job.path}`, {
        headers: { Authorization: `Bearer ${secret}`, "User-Agent": "clara-local-cron/1.0" },
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      console.info(`[local-cron] ${job.path} → HTTP ${res.status} in ${Date.now() - startedAt}ms`);
    } catch (err) {
      console.error(`[local-cron] ${job.path} failed:`, (err as Error).message);
    } finally {
      running.delete(job.path);
    }
  };

  // Tick at the start of every minute.
  const tick = () => {
    const now = new Date();
    for (const job of jobs) {
      if (cronMatches(job.schedule, now)) void run(job);
    }
  };
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  const first = setTimeout(() => {
    tick();
    const timer = setInterval(tick, 60_000);
    if (typeof timer.unref === "function") timer.unref();
  }, msToNextMinute);
  if (typeof first.unref === "function") first.unref();

  console.info(
    `[local-cron] scheduled ${jobs.length} job(s) from vercel.json (UTC): ` +
      jobs.map((j) => `${j.path} "${j.schedule}"`).join(", "),
  );
}
