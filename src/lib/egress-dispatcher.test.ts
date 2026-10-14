import { afterEach, describe, expect, it, vi } from "vitest";

// installEgressDispatcher swaps the process-global fetch dispatcher, so undici
// is mocked here (the pure describeNetworkError tests live in egress.test.ts
// against the real module). vi.resetModules() + dynamic import gives each test
// a fresh module instance so the idempotence guard does not skip the install.
const captured = vi.hoisted(() => ({
  dispatcher: null as unknown,
  agentOptions: [] as Array<Record<string, unknown>>,
  proxyOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock("undici", () => {
  class FakeAgent {
    constructor(options: Record<string, unknown>) {
      captured.agentOptions.push(options);
    }
  }
  class FakeEnvHttpProxyAgent {
    constructor(options: Record<string, unknown>) {
      captured.proxyOptions.push(options);
    }
  }
  return {
    Agent: FakeAgent,
    EnvHttpProxyAgent: FakeEnvHttpProxyAgent,
    setGlobalDispatcher: (dispatcher: unknown) => {
      captured.dispatcher = dispatcher;
    },
  };
});

async function freshInstall(env: Record<string, string> = {}): Promise<void> {
  vi.resetModules();
  captured.agentOptions.length = 0;
  captured.proxyOptions.length = 0;
  captured.dispatcher = null;
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  const mod = await import("@/lib/egress");
  mod.installEgressDispatcher();
}

describe("installEgressDispatcher", () => {
  afterEach(() => {
    for (const key of [
      "EGRESS_CONNECT_TIMEOUT_MS",
      "HTTPS_PROXY", "https_proxy",
      "HTTP_PROXY", "http_proxy",
      "ALL_PROXY", "all_proxy",
      "NO_PROXY", "no_proxy",
    ]) {
      delete process.env[key];
    }
  });

  it("installs a dual-stack dispatcher with the default connect timeout", async () => {
    await freshInstall();
    expect(captured.agentOptions).toHaveLength(1);
    const options = captured.agentOptions[0]!;
    expect((options.connect as Record<string, unknown>).timeout).toBe(20_000);
    // Happy-eyeballs must be version-independent: an IPv6 blackhole must not
    // turn into a 10-20s connect timeout on runtimes without the Node 20+
    // autoSelectFamily default (the production Gemini failure mode).
    expect(options.autoSelectFamily).toBe(true);
    expect(options.autoSelectFamilyAttemptTimeout).toBe(500);
  });

  it("honours EGRESS_CONNECT_TIMEOUT_MS", async () => {
    await freshInstall({ EGRESS_CONNECT_TIMEOUT_MS: "3500" });
    const options = captured.agentOptions[0]!;
    expect((options.connect as Record<string, unknown>).timeout).toBe(3500);
    expect(options.autoSelectFamily).toBe(true);
  });

  it("routes through EnvHttpProxyAgent with HTTPS_PROXY and keeps loopback direct", async () => {
    await freshInstall({ HTTPS_PROXY: "http://proxy.internal:3128" });
    expect(captured.agentOptions).toHaveLength(0);
    expect(captured.proxyOptions).toHaveLength(1);
    const options = captured.proxyOptions[0]!;
    expect((options.connect as Record<string, unknown>).timeout).toBe(20_000);
    expect(options.autoSelectFamily).toBe(true);
    expect(String(process.env.NO_PROXY)).toContain("localhost");
    expect(String(process.env.NO_PROXY)).toContain("127.0.0.1");
    expect(String(process.env.NO_PROXY)).toContain("::1");
  });
});
