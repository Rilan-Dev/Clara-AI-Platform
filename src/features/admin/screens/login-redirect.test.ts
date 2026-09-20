import { describe, expect, it } from "vitest";
import { AUTH_LOGIN_ENDPOINT, getSafeRedirect } from "./login-redirect";

describe("login redirect handling", () => {
  it("uses the same-origin auth endpoint", () => {
    expect(AUTH_LOGIN_ENDPOINT).toBe("/api/auth/login");
  });

  it("preserves an internal dashboard redirect", () => {
    expect(getSafeRedirect("/dashboard?tab=projects")).toBe("/dashboard?tab=projects");
  });

  it("falls back to dashboard for missing redirects", () => {
    expect(getSafeRedirect(null)).toBe("/dashboard");
    expect(getSafeRedirect("")).toBe("/dashboard");
  });

  it("blocks absolute and protocol-relative redirects", () => {
    expect(getSafeRedirect("https://example.com")).toBe("/dashboard");
    expect(getSafeRedirect("//example.com/dashboard")).toBe("/dashboard");
  });
});
