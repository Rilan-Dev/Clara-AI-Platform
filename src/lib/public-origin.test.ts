import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrivateOrLocalHostname, oauthRequestOriginMatches, resolvePublicOrigin } from "./public-origin";

const APP_URL_ENV = "NEXT_PUBLIC_APP_URL";
let appUrlEnvBackup: string | undefined;
beforeAll(() => {
  appUrlEnvBackup = process.env[APP_URL_ENV];
  delete process.env[APP_URL_ENV];
});
afterAll(() => {
  if (appUrlEnvBackup === undefined) delete process.env[APP_URL_ENV];
  else process.env[APP_URL_ENV] = appUrlEnvBackup;
});

function requestAt(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("isPrivateOrLocalHostname", () => {
  it.each([
    ["localhost", true],
    ["app.localhost", true],
    ["printer.local", true],
    ["db.internal", true],
    ["0.0.0.0", true], // bind address surfaced by Host-rewriting reverse proxies
    ["127.0.0.1", true],
    ["127.8.9.10", true],
    ["10.1.2.3", true],
    ["172.16.0.9", true],
    ["172.31.255.255", true],
    ["192.168.1.5", true],
    ["169.254.169.254", true], // cloud metadata endpoint
    ["::", true],
    ["::1", true],
    ["[::1]", true],
    ["[::]", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:127.0.0.1", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["clara.example", false],
    ["clara.ai.amazetechclans.com", false],
    ["172.32.0.1", false], // just outside the 172.16.0.0/12 block
    ["8.8.8.8", false],
    ["2606:4700::6810:84e5", false],
    ["", true],
  ])("%s → %s", (hostname, expected) => {
    expect(isPrivateOrLocalHostname(hostname)).toBe(expected);
  });
});

describe("oauthRequestOriginMatches", () => {
  it("matches when the request's public origin equals the state-bound origin", () => {
    expect(
      oauthRequestOriginMatches("https://clara.example", requestAt("https://clara.example/api/integrations/oauth/callback", { host: "clara.example" })),
    ).toBe(true);
  });

  it("matches when forwarded headers identify the public origin behind a proxy", () => {
    expect(
      oauthRequestOriginMatches(
        "https://clara.example",
        requestAt("https://0.0.0.0:3000/api/integrations/oauth/callback", {
          "x-forwarded-host": "clara.example",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe(true);
  });

  it("tolerates a private/bind request host as an unverifiable reverse-proxy hop", () => {
    // nginx default `proxy_set_header Host $proxy_host` surfaces the bind
    // address; the browser is actually on the state-bound public origin.
    expect(
      oauthRequestOriginMatches(
        "https://clara.example",
        requestAt("https://0.0.0.0:3000/api/integrations/oauth/callback", { host: "0.0.0.0:3000", "x-forwarded-proto": "https" }),
      ),
    ).toBe(true);
    expect(
      oauthRequestOriginMatches(
        "https://clara.example",
        requestAt("http://127.0.0.1:3000/api/integrations/oauth/callback", { host: "127.0.0.1:3000" }),
      ),
    ).toBe(true);
  });

  it("fails closed when the request's public origin is a genuinely different public host", () => {
    expect(
      oauthRequestOriginMatches("https://clara.example", requestAt("https://attacker.example/api/integrations/oauth/callback", { host: "attacker.example" })),
    ).toBe(false);
  });
});

describe("resolvePublicOrigin (unchanged priorities)", () => {
  it("prefers NEXT_PUBLIC_APP_URL when configured", () => {
    process.env[APP_URL_ENV] = "https://clara.ai.amazetechclans.com";
    try {
      expect(resolvePublicOrigin(requestAt("https://0.0.0.0:3000/x", { host: "0.0.0.0:3000" }))).toBe(
        "https://clara.ai.amazetechclans.com",
      );
    } finally {
      delete process.env[APP_URL_ENV];
    }
  });

  it("derives https from a forwarded host without a port", () => {
    expect(
      resolvePublicOrigin(requestAt("https://0.0.0.0:3000/x", { "x-forwarded-host": "clara.example" })),
    ).toBe("https://clara.example");
  });

  it("keeps the dev fallback for localhost hosts", () => {
    expect(resolvePublicOrigin(requestAt("http://localhost:3000/x", { host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });
});