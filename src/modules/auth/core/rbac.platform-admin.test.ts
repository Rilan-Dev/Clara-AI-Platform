import { describe, expect, it } from "vitest";
import { requireTenantScope } from "./rbac";
import type { AuthContext } from "./models";

const superAdmin = {
  user: { isSuperAdmin: true },
} as AuthContext;

const tenantUser = {
  user: { isSuperAdmin: false },
} as AuthContext;

describe("platform admin tenant isolation", () => {
  it("denies platform admins from tenant-scoped resources", () => {
    expect(() => requireTenantScope(superAdmin)).toThrow();
  });

  it("allows tenant users through the tenant scope guard", () => {
    expect(() => requireTenantScope(tenantUser)).not.toThrow();
  });
});
