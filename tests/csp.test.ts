import { describe, expect, it } from "vitest";
import { CSP_HEADER_VALUE as backendCsp } from "../clara-backend/src/security/csp";
import { CSP_HEADER_VALUE as techvisionCsp } from "../clara-techvision/src/server/security-headers";
import { CSP_HEADER_VALUE as omenCsp } from "../clara-omen-insurance/src/server/security-headers";

const forbiddenHosts = [
  "google-analytics.com",
  "overbridgenet.com",
  "googletagmanager.com",
];

const requiredConnectSrc = [
  "connect-src 'self' wss: https://api.openai.com https://realtime.openai.com",
];

describe("CSP headers", () => {
  it("does not allow external analytics hosts", () => {
    for (const header of [backendCsp, techvisionCsp, omenCsp]) {
      for (const host of forbiddenHosts) {
        expect(header).not.toContain(host);
      }
    }
  });

  it("keeps connect-src strict", () => {
    for (const header of [backendCsp, techvisionCsp, omenCsp]) {
      for (const directive of requiredConnectSrc) {
        expect(header).toContain(directive);
      }
    }
  });
});
