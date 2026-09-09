import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("worker entrypoint", () => {
  it("does not use top-level await with the CommonJS worker tsconfig", () => {
    const source = readFileSync(resolve(__dirname, "worker-entry.ts"), "utf8");

    expect(source).not.toMatch(/^await\s+/m);
  });
});
