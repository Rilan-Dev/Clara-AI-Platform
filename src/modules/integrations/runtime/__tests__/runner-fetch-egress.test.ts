import { describe, expect, it } from "vitest";
import { assertSafeEgressUrl } from "../runner-fetch.js";

describe("integration egress policy", () => {
  it("rejects dotted IPv4-mapped IPv6 loopback destinations", async () => {
    await expect(
      assertSafeEgressUrl("http://[::ffff:127.0.0.1]/metadata"),
    ).rejects.toThrow("Integration egress destination is not allowed");
  });

  it("rejects hexadecimal IPv4-mapped IPv6 loopback destinations", async () => {
    await expect(
      assertSafeEgressUrl("http://[::ffff:7f00:1]/metadata"),
    ).rejects.toThrow("Integration egress destination is not allowed");
  });

  it("rejects hexadecimal IPv4-mapped IPv6 private destinations", async () => {
    await expect(
      assertSafeEgressUrl("http://[::ffff:c0a8:0101]/metadata"),
    ).rejects.toThrow("Integration egress destination is not allowed");
  });
});
