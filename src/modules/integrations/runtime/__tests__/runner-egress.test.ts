import { describe, expect, it } from "vitest";
import { assertSafeEgressUrl } from "../runner-fetch.js";

describe("integration egress policy", () => {
  it("rejects loopback and private IPv4 destinations", async () => {
    await expect(assertSafeEgressUrl("https://127.0.0.1/internal")).rejects.toThrow(
      "Integration egress destination is not allowed",
    );
    await expect(assertSafeEgressUrl("https://10.0.0.8/internal")).rejects.toThrow(
      "Integration egress destination is not allowed",
    );
    await expect(assertSafeEgressUrl("https://192.168.1.20/internal")).rejects.toThrow(
      "Integration egress destination is not allowed",
    );
  });

  it("rejects loopback and link-local IPv6 destinations", async () => {
    await expect(assertSafeEgressUrl("https://[::1]/internal")).rejects.toThrow(
      "Integration egress destination is not allowed",
    );
    await expect(assertSafeEgressUrl("https://[fe80::1]/internal")).rejects.toThrow(
      "Integration egress destination is not allowed",
    );
  });

  it("rejects non-HTTP protocols and URL credentials", async () => {
    await expect(assertSafeEgressUrl("file:///etc/passwd")).rejects.toThrow(
      "Integration egress protocol is not allowed",
    );
    await expect(assertSafeEgressUrl("https://user:pass@example.com/")).rejects.toThrow(
      "Integration egress URL cannot contain credentials",
    );
  });
});
