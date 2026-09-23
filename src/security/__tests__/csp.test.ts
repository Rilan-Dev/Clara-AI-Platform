import { afterEach, describe, expect, it } from "vitest";
import {
  CSP_HEADER_VALUE,
  getCspHeaderValue,
  getEmbedWidgetCspHeaderValue,
} from "../csp";

describe("CSP header", () => {
  it("keeps connect-src strict", () => {
    expect(CSP_HEADER_VALUE).toContain(
      "connect-src 'self' wss:",
    );
    expect(CSP_HEADER_VALUE).toContain(
      "https://api.openai.com",
    );
    expect(CSP_HEADER_VALUE).toContain(
      "https://realtime.openai.com",
    );
  });

  it("includes CSP violation reporting", () => {
    expect(CSP_HEADER_VALUE).toContain("report-uri /api/csp-report");
  });

  it("allows the first-party Vercel toolbar origin on preview deployments", () => {
    // vercel.live is Vercel's own toolbar/feedback script, injected into
    // preview deployments only. Allowed in both script-src (the injected
    // <script>) and connect-src (toolbar signalling) to keep preview
    // consoles free of CSP violations.
    expect(CSP_HEADER_VALUE).toContain(
      "blob: https://checkout.razorpay.com https://vercel.live",
    );
    expect(CSP_HEADER_VALUE).toContain("https://api.razorpay.com https://vercel.live");
  });

  it("does not allow blocked analytics domains", () => {
    expect(CSP_HEADER_VALUE).not.toContain("google-analytics.com");
    expect(CSP_HEADER_VALUE).not.toContain("overbridgenet.com");
  });
});

describe("CSP Mode B gating (ElevenLabs Conversational AI)", () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED;
  });

  it("excludes the vendor websocket origin while Mode B is off", () => {
    delete process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED;
    expect(getCspHeaderValue()).not.toContain("api.elevenlabs.io");
    expect(getEmbedWidgetCspHeaderValue()).not.toContain("api.elevenlabs.io");
  });

  it("adds the vendor websocket origin only while Mode B is on", () => {
    process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED = "true";
    expect(getCspHeaderValue()).toContain("wss://api.elevenlabs.io https://api.elevenlabs.io");
    expect(getEmbedWidgetCspHeaderValue()).toContain("wss://api.elevenlabs.io https://api.elevenlabs.io");
  });

  it("keeps every other directive unchanged when Mode B is on", () => {
    process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED = "true";
    const on = getCspHeaderValue();
    delete process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED;
    const off = getCspHeaderValue();
    // The ONLY difference is the appended Mode-B origins on connect-src.
    expect(on.replace(" wss://api.elevenlabs.io https://api.elevenlabs.io", "")).toBe(off);
  });
});
