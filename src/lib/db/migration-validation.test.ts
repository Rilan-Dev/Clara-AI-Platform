import { describe, expect, it } from "vitest";
import { findDuplicateMigrationNumbers } from "./migration-validation";

describe("findDuplicateMigrationNumbers", () => {
  it("accepts unique migration prefixes", () => {
    expect(findDuplicateMigrationNumbers(["063_payment.sql", "064_voice.sql", "065_oauth.sql"])).toEqual([]);
  });

  it("returns duplicated prefixes once in sorted order", () => {
    expect(findDuplicateMigrationNumbers(["065_oauth.sql", "063_payment.sql", "065_oauth_copy.sql", "063_payment_copy.sql"])).toEqual(["063", "065"]);
  });
});
