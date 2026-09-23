/**
 * src/lib/__tests__/runtime-api-base.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the same-origin guard in getApiBaseUrl():
 *
 * NEXT_PUBLIC_API_BASE_URL is a build-time constant baked into EVERY
 * deployment. When it carries the production URL (e.g. set for "All
 * Environments" in Vercel), preview deployments used to call the production
 * API cross-origin — blocked by the static CSP connect-src 'self' directive,
 * which is exactly the "Connecting to 'https://clara.rag…/api/auth/me'
 * violates Content Security Policy" console error seen on previews.
 *
 * The guard: on the CLIENT, when the page hostname differs from the
 * configured API base hostname, fall back to same-origin relative URLs.
 * Production pages (same hostname) keep the absolute URL; SSR keeps the
 * configured value (window is undefined).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, getApiBaseUrl } from "@/lib/runtime";

const PROD_BASE = "https://clara.rag.amazetechclans.com";

function setBrowserHostname(hostname: string) {
  vi.stubGlobal("window", { location: { hostname } });
}

describe("getApiBaseUrl same-origin guard", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = PROD_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("keeps the absolute base when the page is served from the configured host", () => {
    setBrowserHostname("clara.rag.amazetechclans.com");
    expect(getApiBaseUrl()).toBe(PROD_BASE);
  });

  it("falls back to same-origin on a preview branch domain", () => {
    setBrowserHostname("preview.rag.amazetechclans.com");
    expect(getApiBaseUrl()).toBe("");
  });

  it("falls back to same-origin on *.vercel.app deployment URLs", () => {
    setBrowserHostname("clara-backend-i8761o4gy-rilan.vercel.app");
    expect(getApiBaseUrl()).toBe("");
  });

  it("falls back to same-origin on localhost dev servers", () => {
    setBrowserHostname("localhost");
    expect(getApiBaseUrl()).toBe("");
  });

  it("keeps the configured value during SSR (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(getApiBaseUrl()).toBe(PROD_BASE);
  });

  it("ignores a trailing slash on the configured base", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = `${PROD_BASE}/`;
    setBrowserHostname("clara.rag.amazetechclans.com");
    expect(getApiBaseUrl()).toBe(PROD_BASE);
  });

  it("keeps a non-absolute configured value as-is (legacy behaviour)", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "not-a-url";
    setBrowserHostname("preview.rag.amazetechclans.com");
    expect(getApiBaseUrl()).toBe("not-a-url");
  });

  it("returns same-origin when no base is configured at all", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    setBrowserHostname("anything.amazetechclans.com");
    expect(getApiBaseUrl()).toBe("");
  });
});

describe("apiUrl under the same-origin guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("builds relative URLs on preview hosts and absolute URLs on the production host", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = PROD_BASE;

    setBrowserHostname("preview.rag.amazetechclans.com");
    expect(apiUrl("/api/auth/me")).toBe("/api/auth/me");

    setBrowserHostname("clara.rag.amazetechclans.com");
    expect(apiUrl("/api/auth/me")).toBe(`${PROD_BASE}/api/auth/me`);
  });

  it("never rewrites URLs that are already absolute", () => {
    setBrowserHostname("preview.rag.amazetechclans.com");
    expect(apiUrl("https://example.com/x")).toBe("https://example.com/x");
  });
});
