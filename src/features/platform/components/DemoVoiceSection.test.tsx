import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("DemoVoiceSection client boundary", () => {
  it("does not import the server-only database module", () => {
    const source = readFileSync(
      resolve(__dirname, "DemoVoiceSection.tsx"),
      "utf8",
    );

    expect(source).not.toContain("@/modules/phone/core/db");
  });

  it("loads demo configuration through the public embed config route", () => {
    const source = readFileSync(
      resolve(__dirname, "DemoVoiceSection.tsx"),
      "utf8",
    );

    expect(source).toContain("/api/embed/demo-config");
  });
});
