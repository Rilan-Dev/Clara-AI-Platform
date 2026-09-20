import { describe, expect, it } from "vitest";

import {
  DEMO_EVENT_COUNTS,
  generateSyntheticEvents,
  mulberry32,
} from "@/lib/db/seed/demo";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces values in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("generateSyntheticEvents", () => {
  const FIXED_NOW = new Date("2026-09-17T12:00:00.000Z");

  it("generates the plan-specified totals (Omen 500, TechVision 200)", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    const omenCount = Object.entries(DEMO_EVENT_COUNTS)
      .filter(([id]) => id.endsWith("000000000010") || id.endsWith("000000000011") || id.endsWith("000000000012"))
      .reduce((sum, [, n]) => sum + n, 0);
    const tvCount = Object.entries(DEMO_EVENT_COUNTS)
      .filter(([id]) => id.endsWith("000000000013") || id.endsWith("000000000014"))
      .reduce((sum, [, n]) => sum + n, 0);

    expect(events.length).toBe(700);
    expect(omenCount).toBe(500);
    expect(tvCount).toBe(200);
  });

  it("produces exact per-KB counts", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    for (const [kbId, expected] of Object.entries(DEMO_EVENT_COUNTS)) {
      expect(events.filter((e) => e.kbId === kbId).length).toBe(expected);
    }
  });

  it("always sets org_id (org dashboards aggregate by org_id)", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    for (const ev of events) {
      expect(ev.orgId).toBeTruthy();
    }
  });

  it("keeps every event inside the trailing 30-day window and never in the future", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    const oldest = FIXED_NOW.getTime() - 31 * 86_400_000;
    for (const ev of events) {
      expect(ev.createdAt.getTime()).toBeGreaterThan(oldest);
      expect(ev.createdAt.getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    }
  });

  it("uses only valid surfaces and statuses", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    const surfaces = new Set(events.map((e) => e.surface));
    const statuses = new Set(events.map((e) => e.status));
    for (const s of surfaces) expect(["workspace", "embed", "voice"]).toContain(s);
    for (const s of statuses) expect(["ok", "error"]).toContain(s);
  });

  it("ok events carry answers and token usage; error events do not", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW, seed: 3 });
    const ok = events.filter((e) => e.status === "ok");
    const error = events.filter((e) => e.status === "error");
    expect(ok.length).toBeGreaterThan(600); // ~95% of 700
    for (const ev of ok) {
      expect(ev.answerText).toMatch(/\[S1\]/);
      expect(ev.promptTokens).toBeGreaterThan(0);
      expect(ev.completionTokens).toBeGreaterThan(0);
    }
    for (const ev of error) {
      expect(ev.answerText).toBeNull();
      expect(ev.promptTokens).toBe(0);
    }
  });

  it("computes cost from the fictional token rates", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW, seed: 5 });
    for (const ev of events) {
      expect(Number(ev.costUsdMicros)).toBe(
        Math.round(ev.promptTokens * 2.5 + ev.completionTokens * 10),
      );
    }
  });

  it("is deterministic for a fixed now and seed", () => {
    const a = generateSyntheticEvents({ now: FIXED_NOW, seed: 11 });
    const b = generateSyntheticEvents({ now: FIXED_NOW, seed: 11 });
    expect(a).toEqual(b);
  });

  it("spreads events across all three surfaces", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    const bySurface = events.reduce<Record<string, number>>((acc, ev) => {
      acc[ev.surface] = (acc[ev.surface] ?? 0) + 1;
      return acc;
    }, {});
    expect(bySurface.workspace).toBeGreaterThan(200);
    expect(bySurface.embed).toBeGreaterThan(50);
    expect(bySurface.voice).toBeGreaterThan(10);
  });

  it("assigns workspace-surface events to org users (active-user analytics)", () => {
    const events = generateSyntheticEvents({ now: FIXED_NOW });
    const workspace = events.filter((e) => e.surface === "workspace");
    const withUser = workspace.filter((e) => e.userId !== null);
    expect(withUser.length).toBeGreaterThan(workspace.length * 0.5);
    for (const ev of withUser) {
      expect(ev.userId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
