import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./DemoWebsiteFrame.tsx", import.meta.url),
  "utf8",
);

describe("DemoWebsiteFrame client boundary", () => {
  it("is a client component", () => {
    expect(source).toContain('"use client"');
  });

  it("does not import server-only modules", () => {
    expect(source).not.toContain('from "@/lib/db');
    expect(source).not.toContain('from "@/modules/admin/core');
    expect(source).not.toContain('from "@/modules/embed/core');
  });

  it("injects the real deployable clara.js script with customer attributes", () => {
    expect(source).toContain('"/embed/clara.js"');
    expect(source).toContain('"data-key"');
    expect(source).toContain('"data-position"');
    expect(source).toContain('"bottom-right"');
    expect(source).toContain('"data-theme"');
  });

  it("cleans up the injected script and widget host on unmount", () => {
    expect(source).toContain('script.remove()');
    expect(source).toContain('getElementById("clara-widget-host")');
  });

  it("falls back to the platform demo-config key", () => {
    expect(source).toContain('"/api/embed/demo-config"');
  });
});

describe("DemoWebsiteFrame Phase 4 demo content", () => {
  it("renders a convincing landing page structure (hero, features, testimonials)", () => {
    expect(source).toMatch(/hero|Ship intelligent products/i);
    expect(source).toMatch(/Loved by teams that ship|Testimonials|testimonial/i);
    expect(source).toMatch(/FEATURES\s*=/);
    expect(source).toMatch(/TESTIMONIALS\s*=/);
    expect(source).toContain("TechVision");
  });

  it("uses the TechVision slate + sky branding from the plan", () => {
    expect(source).toMatch(/slate-950|slate-900/);
    expect(source).toMatch(/sky-400|sky-500/);
  });

  it("shows the one-line embed snippet that customers copy", () => {
    expect(source).toContain("SNIPPET_LINES");
    expect(source).toMatch(/clara\.js/);
    expect(source).toMatch(/clr_your_kb_api_key/);
  });

  it("surfaces a visible warning when no embed key is available", () => {
    expect(source).toContain("keyError");
    expect(source).toMatch(/No embed API key configured/);
  });
});
