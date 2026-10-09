import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("WhatsApp messaging recovery UI", () => {
  it("offers explicit reconnect guidance for unhealthy saved connections", () => {
    const source = readFileSync(resolve(__dirname, "agent-messaging-screen.tsx"), "utf8");
    expect(source).toContain("Reconnect business number");
    expect(source).toContain("Reconnect WhatsApp Business");
    expect(source).toContain("Daily briefings remain disabled until the connection and webhook are healthy.");
  });
});
