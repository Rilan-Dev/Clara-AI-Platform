import { describe, expect, it } from "vitest";
import { isMcpPublicIpAddress, validateMcpEndpoint } from "./mcp-streamable-http-resolver";

describe("Streamable HTTP MCP endpoint guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.10",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.2",
    "224.0.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2001:0000::1",
    "2002::1",
    "3fff::1",
    "not-an-ip",
  ])("rejects non-public or invalid address %s", (address) => {
    expect(isMcpPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts globally routable address %s",
    (address) => expect(isMcpPublicIpAddress(address)).toBe(true),
  );

  it.each([
    "http://mcp.example.com",
    "https://localhost/mcp",
    "https://internal.local/mcp",
    "https://user:password@mcp.example.com",
    "https://mcp.example.com/path?token=secret",
    "https://mcp.example.com/path#fragment",
    "https://127.0.0.1/mcp",
    "https://[::1]/mcp",
    "https://2130706433/mcp",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(() => validateMcpEndpoint(endpoint)).toThrow();
  });

  it("accepts a DNS-hosted HTTPS endpoint without embedded credentials", () => {
    const endpoint = validateMcpEndpoint("https://mcp.vendor.com/mcp");
    expect(endpoint.protocol).toBe("https:");
    expect(endpoint.hostname).toBe("mcp.vendor.com");
  });
});
