import { EventEmitter } from "node:events";
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

  function createFakeRequest(options: {
    statusCode?: number;
    responseBody?: string;
    neverRespond?: boolean;
    onLookup?: (address: string, family: number) => void;
  } = {}) {
    return vi.fn(((_url: unknown, requestOptions: unknown, callback: (response: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (error?: Error) => void;
      };
      let destroyed = false;
      req.destroy = (error?: Error) => {
        destroyed = true;
        queueMicrotask(() => {
          if (error) req.emit("error", error);
          req.emit("close");
        });
      };
      req.end = () => {
        const requestConfig = requestOptions as {
          agent?: { options?: { lookup?: (hostname: string, options: unknown, callback: (...args: unknown[]) => void) => void } };
        };
        requestConfig.agent?.options?.lookup?.("mcp.vendor.test", {}, (...args: unknown[]) => {
          if (args[0] instanceof Error) return;
          options.onLookup?.(String(args[1]), Number(args[2]));
        });
        if (options.neverRespond) return;
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
          resume: () => void;
        };
        response.statusCode = options.statusCode ?? 200;
        response.headers = { location: "https://other.vendor.test/" };
        response.resume = () => req.emit("close");
        callback(response);
        if (options.responseBody !== undefined) {
          queueMicrotask(() => {
            response.emit("data", options.responseBody!);
            if (!destroyed) response.emit("end");
          });
        }
      };
      return req;
    }) as never);
  }

  it("refuses redirects from the HTTPS response boundary", async () => {
    const request = createFakeRequest({ statusCode: 302 });
    await expect(
      mcpHttpRequest(
        new URL("https://mcp.vendor.test/mcp"),
        { timeoutMs: 50 },
        { resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }], request },
      ),
    ).rejects.toThrow("redirects are not allowed");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("pins the socket lookup to the address validated for that request", async () => {
    let pinnedAddress = "";
    let pinnedFamily = 0;
    const request = createFakeRequest({
      responseBody: '{"ok":true}',
      onLookup: (address, family) => { pinnedAddress = address; pinnedFamily = family; },
    });
    await expect(
      mcpHttpRequest(
        new URL("https://mcp.vendor.test/mcp"),
        { timeoutMs: 50 },
        { resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }], request },
      ),
    ).resolves.toMatchObject({ status: 200, body: '{"ok":true}' });
    expect(pinnedAddress).toBe("8.8.8.8");
    expect(pinnedFamily).toBe(4);
  });

  it("aborts an active HTTPS request when its deadline expires", async () => {
    const request = createFakeRequest({ neverRespond: true });
    await expect(
      mcpHttpRequest(
        new URL("https://mcp.vendor.test/mcp"),
        { timeoutMs: 5 },
        { resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }], request },
      ),
    ).rejects.toThrow("MCP request timed out");
  });

  it("aborts an active HTTPS request when its signal is cancelled", async () => {
    const controller = new AbortController();
    const request = createFakeRequest({ neverRespond: true });
    const pending = mcpHttpRequest(
      new URL("https://mcp.vendor.test/mcp"),
      { timeoutMs: 500, signal: controller.signal },
      { resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }], request },
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).rejects.toThrow("MCP request cancelled");
  });

  it("destroys a response stream that exceeds the response byte limit", async () => {
    const request = createFakeRequest({ responseBody: "x".repeat(1_048_577) });
    await expect(
      mcpHttpRequest(
        new URL("https://mcp.vendor.test/mcp"),
        { timeoutMs: 50 },
        { resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }], request },
      ),
    ).rejects.toThrow("MCP response exceeded the size limit");
  });

});
