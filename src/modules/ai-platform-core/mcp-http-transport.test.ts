import { describe, expect, it, vi } from "vitest";
import {
  MCP_MAX_REQUEST_BYTES,
  mcpHttpRequest,
  type McpTransportDependencies,
} from "./mcp-http-transport";

describe("MCP outbound transport dependency boundary", () => {
  it("rejects a mixed public/private DNS answer set before opening a socket", async () => {
    const request = vi.fn();
    const dependencies: McpTransportDependencies = {
      resolveAddresses: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      request: request as never,
    };

    await expect(
      mcpHttpRequest(new URL("https://mcp.vendor.test/mcp"), {}, dependencies),
    ).rejects.toThrow("non-public address");
    expect(request).not.toHaveBeenCalled();
  });

  it("re-resolves and revalidates DNS on every outbound request", async () => {
    const resolveAddresses = vi.fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.8", family: 4 }]);
    const request = vi.fn();
    const dependencies: McpTransportDependencies = {
      resolveAddresses,
      request: request as never,
    };
    const endpoint = new URL("https://mcp.vendor.test/mcp");

    // The first call reaches the injected HTTPS boundary; its deliberately
    // minimal fake rejects because no response transport is configured.
    await expect(mcpHttpRequest(endpoint, { timeoutMs: 20 }, dependencies)).rejects.toThrow();
    await expect(mcpHttpRequest(endpoint, { timeoutMs: 20 }, dependencies)).rejects.toThrow("non-public address");
    expect(resolveAddresses).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized request bodies before DNS or HTTPS activity", async () => {
    const resolveAddresses = vi.fn();
    const request = vi.fn();
    const dependencies: McpTransportDependencies = {
      resolveAddresses,
      request: request as never,
    };

    await expect(
      mcpHttpRequest(
        new URL("https://mcp.vendor.test/mcp"),
        { body: "x".repeat(MCP_MAX_REQUEST_BYTES + 1) },
        dependencies,
      ),
    ).rejects.toThrow("request exceeded the size limit");
    expect(resolveAddresses).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an already-cancelled request before DNS or HTTPS activity", async () => {
    const controller = new AbortController();
    controller.abort();
    const resolveAddresses = vi.fn();
    const request = vi.fn();
    const dependencies: McpTransportDependencies = {
      resolveAddresses,
      request: request as never,
    };

    await expect(
      mcpHttpRequest(
        new URL("https://mcp.vendor.test/mcp"),
        { signal: controller.signal },
        dependencies,
      ),
    ).rejects.toThrow("cancelled");
    expect(resolveAddresses).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
