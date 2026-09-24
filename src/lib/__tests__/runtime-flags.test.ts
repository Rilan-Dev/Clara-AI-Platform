import { describe, expect, it } from "vitest";
import { describeRuntimeFlags } from "@/lib/runtime-flags";

const find = (env: Record<string, string>, key: string) =>
  describeRuntimeFlags(env).flatMap((g) => g.flags).find((f) => f.key === key)!;

describe("describeRuntimeFlags", () => {
  it("flags the fail-open quota default for review", () => {
    const f = find({}, "PLAN_GUARD_FAIL_MODE");
    expect(f.value).toBe("Fail open (allow)");
    expect(f.isDefault).toBe(true);
    expect(f.attention).toBe(true);
  });

  it("reports fail-closed without attention", () => {
    const f = find({ PLAN_GUARD_FAIL_MODE: "closed" }, "PLAN_GUARD_FAIL_MODE");
    expect(f.attention).toBeFalsy();
  });

  it("never returns secret values", () => {
    const f = find({ VIRUS_SCAN_API_KEY: "super-secret" }, "VIRUS_SCAN_API_KEY");
    expect(f.value).toBe("Configured");
    expect(JSON.stringify(describeRuntimeFlags({ VIRUS_SCAN_API_KEY: "super-secret" }))).not.toContain("super-secret");
  });
});
