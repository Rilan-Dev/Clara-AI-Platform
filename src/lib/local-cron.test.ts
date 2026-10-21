import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());
import { configuredCronJobs, cronMatches } from "./local-cron";

const at = (iso: string) => new Date(iso);

describe("cronMatches (UTC, like Vercel Cron)", () => {
  it("matches fixed minute/hour schedules", () => {
    expect(cronMatches("10 4 * * *", at("2026-09-25T04:10:00Z"))).toBe(true);
    expect(cronMatches("10 4 * * *", at("2026-09-25T04:11:00Z"))).toBe(false);
    expect(cronMatches("30 18 * * *", at("2026-09-25T18:30:00Z"))).toBe(true);
  });

  it("supports steps, ranges and lists", () => {
    expect(cronMatches("*/5 * * * *", at("2026-09-25T10:15:00Z"))).toBe(true);
    expect(cronMatches("*/5 * * * *", at("2026-09-25T10:16:00Z"))).toBe(false);
    expect(cronMatches("0 9-17 * * 1-5", at("2026-09-25T12:00:00Z"))).toBe(true); // Friday
    expect(cronMatches("0 9-17 * * 1-5", at("2026-09-27T12:00:00Z"))).toBe(false); // Sunday
    expect(cronMatches("0 0 1,15 * *", at("2026-09-15T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 * * 7", at("2026-09-27T00:00:00Z"))).toBe(true); // 7 = Sunday
  });

  it("rejects malformed expressions", () => {
    expect(cronMatches("* * *", at("2026-09-25T00:00:00Z"))).toBe(false);
  });

  it("does not schedule disabled WhatsApp jobs on production but keeps unrelated health and onboarding", () => {
    vi.stubEnv("CLARA_ENV", "production");
    const paths = configuredCronJobs().map((job) => job.path);
    expect(paths.some((path) => path.includes("whatsapp"))).toBe(false);
    expect(paths).toContain("/api/platform/services-status");
    expect(paths).toContain("/api/cron/onboarding-reminders");
  });

  it("reads the same schedule Vercel uses when integrations are enabled in development", () => {
    vi.stubEnv("CLARA_ENV", "development");
    const paths = configuredCronJobs().map((job) => job.path);
    expect(paths).toContain("/api/platform/services-status");
    expect(paths).toContain("/api/cron/onboarding-reminders");
    expect(paths).toContain("/api/cron/whatsapp-daily-briefings");
  });
});
