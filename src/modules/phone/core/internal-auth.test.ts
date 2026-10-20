import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedPhoneInternal, phoneInternalSecret } from "./internal-auth";

function headers(secret: string | null = null, internal = true): Headers {
  const h = new Headers();
  if (internal) h.set("x-phone-internal", "1");
  if (secret != null) h.set("x-phone-secret", secret);
  return h;
}

describe("phone bridge internal request authentication", () => {
  beforeEach(() => {
    vi.stubEnv("PHONE_INTERNAL_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed if no server-only secret is configured", () => {
    expect(phoneInternalSecret()).toBeNull();
    expect(isAuthorizedPhoneInternal(headers("anything"))).toBe(false);
  });

  it("rejects a forged internal header with no credential", () => {
    vi.stubEnv("PHONE_INTERNAL_SECRET", "dedicated-private-secret");
    expect(isAuthorizedPhoneInternal(headers(null))).toBe(false);
  });

  it("rejects a wrong or partial credential", () => {
    vi.stubEnv("PHONE_INTERNAL_SECRET", "dedicated-private-secret");
    expect(isAuthorizedPhoneInternal(headers("dedicated-private"))).toBe(false);
    expect(isAuthorizedPhoneInternal(headers("wrong-private-secret"))).toBe(false);
  });

  it("requires the internal marker even with a valid credential", () => {
    vi.stubEnv("PHONE_INTERNAL_SECRET", "dedicated-private-secret");
    expect(isAuthorizedPhoneInternal(headers("dedicated-private-secret", false))).toBe(false);
  });

  it("accepts matching dedicated secret", () => {
    vi.stubEnv("PHONE_INTERNAL_SECRET", "dedicated-private-secret");
    expect(isAuthorizedPhoneInternal(headers("dedicated-private-secret"))).toBe(true);
  });

  it("uses existing CRON_SECRET for compatible phone bridge deployments", () => {
    vi.stubEnv("CRON_SECRET", "existing-server-cron-secret");
    expect(phoneInternalSecret()).toBe("existing-server-cron-secret");
    expect(isAuthorizedPhoneInternal(headers("existing-server-cron-secret"))).toBe(true);
  });

  it("prefers a dedicated secret over the cron fallback", () => {
    vi.stubEnv("CRON_SECRET", "existing-server-cron-secret");
    vi.stubEnv("PHONE_INTERNAL_SECRET", "dedicated-private-secret");
    expect(isAuthorizedPhoneInternal(headers("existing-server-cron-secret"))).toBe(false);
    expect(isAuthorizedPhoneInternal(headers("dedicated-private-secret"))).toBe(true);
  });
});
