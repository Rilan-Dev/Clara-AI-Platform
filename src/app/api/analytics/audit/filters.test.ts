import { describe, expect, it } from "vitest";
import { AuditFilterError, parseAuditFilters, parseAuditOrgId } from "./filters";

const now = new Date("2026-10-23T14:00:00.000Z");
const sp = (query: string) => new URLSearchParams(query);
const list = (query: string) => parseAuditFilters(sp(query), now, { defaultLimit: 50, maxLimit: 100, withOffset: true });

describe("platform audit request boundaries", () => {
  it("retains bounded defaults and explicit valid user filters", () => {
    expect(list("")).toMatchObject({ orgId: null, limit: 50, offset: 0, search: "" });
    expect(list("orgId=7edaf8bd-9acd-44ac-83e5-62dd4cd8043e&limit=25&offset=50&q=policy"))
      .toMatchObject({
        orgId: "7edaf8bd-9acd-44ac-83e5-62dd4cd8043e",
        limit: 25, offset: 50, search: "policy",
      });
  });

  it("keeps the original last-seven-days and explicit ISO dates", () => {
    const defaults = list("");
    expect(defaults.toDate.toISOString()).toBe("2026-10-23T14:00:00.000Z");
    expect(defaults.fromDate.toISOString()).toBe("2026-10-16T14:00:00.000Z");
    const dates = list("from=2026-10-01T00%3A00%3A00Z&to=2026-10-20T12%3A00%3A00Z");
    expect(dates.fromDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dates.toDate.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  it.each(["", "not-uuid", "11111111-2222", "q=abc"])("rejects explicitly invalid org filters without widening to all: %s", (orgId) => {
    expect(() => parseAuditOrgId(sp("orgId=" + orgId))).toThrow(AuditFilterError);
  });

  it.each([
    "limit=0", "limit=-1", "limit=2junk", "limit=1.4", "limit=NaN",
    "limit=9007199254740993", "offset=-2", "offset=2junk",
    "offset=1.25", "offset=Infinity", "offset=9007199254740993",
  ])("never sends invalid pagination values to SQL: %s", (query) => {
    expect(() => list(query)).toThrow(AuditFilterError);
  });

  it("caps an otherwise valid limit and preserves an exact offset", () => {
    expect(list("limit=200&offset=150")).toMatchObject({ limit: 100, offset: 150 });
    expect(list("limit=1&offset=0")).toMatchObject({ limit: 1, offset: 0 });
  });

  it.each([
    "from=not-a-date", "to=not-a-date", "from=",
    "from=2026-02-30T00%3A00%3A00Z",
    "from=2026-10-24T00%3A00%3A00Z&to=2026-10-23T00%3A00%3A00Z",
  ])("rejects invalid or inverted audit date filters: %s", (query) => {
    expect(() => list(query)).toThrow(AuditFilterError);
  });

  it("supports CSV export's larger limit without unbounded memory usage", () => {
    const exportOpts = { defaultLimit: 5000, maxLimit: 10000, withOffset: false };
    expect(parseAuditFilters(sp("limit=50000"), now, exportOpts).limit).toBe(10000);
    expect(() => parseAuditFilters(sp("limit=5junk"), now, exportOpts)).toThrow(AuditFilterError);
  });

  it("does not silently interpret the requested orgId as missing", () => {
    expect(parseAuditOrgId(sp(""))).toBeNull();
    expect(parseAuditOrgId(sp("orgId=00000000-0000-0000-0000-000000000001")))
      .toBe("00000000-0000-0000-0000-000000000001");
  });
});
