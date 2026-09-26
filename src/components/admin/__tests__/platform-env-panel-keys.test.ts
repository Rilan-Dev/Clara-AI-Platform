import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the Environment page once rendered ~25 fields (provider
// API keys, default models) that were missing from CATEGORY_KEYS, so every
// edit to them was silently dropped on Save.
const source = readFileSync(join(__dirname, "..", "PlatformEnvPanel.tsx"), "utf8");
const keysBlock = source.slice(
  source.indexOf("const CATEGORY_KEYS"),
  source.indexOf("};", source.indexOf("const CATEGORY_KEYS")),
);
const saved = [...keysBlock.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]);

describe("PlatformEnvPanel", () => {
  it("saves every key its editors let you change", () => {
    const edited = new Set(
      [...source.matchAll(/(?:setDraftValue|boolToggle|clearSecret\?\.)\(\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]),
    );
    expect(edited.size).toBeGreaterThan(10);
    expect([...edited].filter((key) => !saved.includes(key))).toEqual([]);
  });

  it("gives each key exactly one home in this panel", () => {
    expect(saved.length).toBeGreaterThan(10);
    expect(new Set(saved).size).toBe(saved.length);
  });

  it("does not re-host settings owned by other pages", () => {
    for (const owned of ["OPENAI_API_KEY", "STRIPE_SECRET_KEY", "RAZORPAY_KEY_SECRET", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_LANDING_EMBED_API_KEY"]) {
      expect(saved).not.toContain(owned);
    }
  });
});
