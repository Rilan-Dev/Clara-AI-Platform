import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./DemoAssistantFAB.tsx", import.meta.url),
  "utf8",
);

describe("DemoAssistantFAB client boundary", () => {
  it("does not import the server-only phone database module", () => {
    expect(source).not.toContain('from "@/modules/phone/core/db"');
    expect(source).not.toContain("from '@/modules/phone/core/db'");
  });

  it("keeps browser state inside a synchronous client component", () => {
    expect(source).not.toMatch(/export default async function DemoAssistantFAB/);
  });
});
