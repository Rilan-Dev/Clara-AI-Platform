import { describe, expect, it } from "vitest";
import {
  buildSideBySideRows,
  collapseUnchangedRuns,
  diffLines,
  stringifyForDiff,
} from "./json-diff";

describe("diffLines (LCS line diff)", () => {
  it("marks identical inputs as all-same", () => {
    const ops = diffLines(["a", "b"], ["a", "b"]);
    expect(ops.map((o) => o.op)).toEqual(["same", "same"]);
  });

  it("detects a pure addition", () => {
    const ops = diffLines(["a"], ["a", "b"]);
    expect(ops).toEqual([
      { op: "same", aIdx: 0, bIdx: 0 },
      { op: "add", aIdx: -1, bIdx: 1 },
    ]);
  });

  it("detects a pure removal", () => {
    const ops = diffLines(["a", "b"], ["a"]);
    expect(ops).toEqual([
      { op: "same", aIdx: 0, bIdx: 0 },
      { op: "del", aIdx: 1, bIdx: -1 },
    ]);
  });

  it("detects a changed line as del+add", () => {
    const ops = diffLines(["x"], ["y"]);
    expect(ops).toEqual([{ op: "del", aIdx: 0, bIdx: -1 }, { op: "add", aIdx: -1, bIdx: 0 }]);
  });

  it("handles empty sides", () => {
    expect(diffLines([], ["a"])).toEqual([{ op: "add", aIdx: -1, bIdx: 0 }]);
    expect(diffLines(["a"], [])).toEqual([{ op: "del", aIdx: 0, bIdx: -1 }]);
    expect(diffLines([], [])).toEqual([]);
  });
});

describe("buildSideBySideRows", () => {
  it("pairs del+add runs into changed rows with both line numbers", () => {
    const rows = buildSideBySideRows(["old"], ["new"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("changed");
    expect(rows[0].left).toEqual({ num: 1, text: "old" });
    expect(rows[0].right).toEqual({ num: 1, text: "new" });
  });

  it("keeps unpaired deletions and additions on a single side", () => {
    const rows = buildSideBySideRows(["a", "b", "c"], ["a", "x", "y", "z"]);
    const kinds = rows.map((r) => r.kind);
    // a same, b→x changed, c→y changed, z added
    expect(kinds).toEqual(["same", "changed", "changed", "added"]);
    expect(rows[3].left).toBeNull();
    expect(rows[3].right?.text).toBe("z");
  });

  it("numbers lines per side", () => {
    const rows = buildSideBySideRows(["1", "2", "3"], ["1", "3"]);
    // 1 same, 2 removed, 3 same
    expect(rows[0].left?.num).toBe(1);
    expect(rows[0].right?.num).toBe(1);
    expect(rows[1].kind).toBe("removed");
    expect(rows[1].left?.num).toBe(2);
    expect(rows[2].right?.num).toBe(2);
  });
});

describe("collapseUnchangedRuns", () => {
  const same = (n: number) =>
    ({ kind: "same", left: { num: n, text: `l${n}` }, right: { num: n, text: `l${n}` } }) as const;
  const changed = () =>
    ({ kind: "changed", left: { num: 0, text: "a" }, right: { num: 0, text: "b" } }) as const;

  it("keeps short runs fully visible", () => {
    const rows = [same(1), same(2), changed(), same(3), same(4)];
    const segments = collapseUnchangedRuns(rows);
    // run-before-hunk, hunk, run-after-hunk — all shown in full.
    expect(segments).toHaveLength(3);
    expect(segments.every((s) => s.kind === "rows")).toBe(true);
    expect(segments[1].kind === "rows" && segments[1].rows[0].kind).toBe("changed");
  });

  it("collapses a long leading run, keeping context near the hunk", () => {
    const rows = [same(1), same(2), same(3), changed(), same(5)];
    // force collapse: 30 leading same rows
    const many = Array.from({ length: 30 }, (_, i) => same(i + 1));
    const segments = collapseUnchangedRuns([...many, changed(), same(99)], 4, 12);
    const collapsed = segments.find((s) => s.kind === "collapsed");
    expect(collapsed).toBeDefined();
    expect(collapsed?.kind === "collapsed" && collapsed.count).toBe(26); // 30 - 4 context
    // first segment should be the collapsed head (26 hidden), then 4 context rows, then the hunk
    expect(segments[0].kind).toBe("collapsed");
    expect(segments[1].kind === "rows" && segments[1].rows).toHaveLength(4);
    expect(segments[2].kind === "rows" && segments[2].rows[0].kind).toBe("changed");
    expect(rows).toHaveLength(5); // sanity: untouched input
  });

  it("collapses the middle of a long run between two hunks", () => {
    const many = Array.from({ length: 40 }, () => same(0));
    const rows = [changed(), ...many, changed()];
    const segments = collapseUnchangedRuns(rows, 4, 12);
    // hunk, 4 rows, collapsed(32), 4 rows, hunk
    expect(segments.map((s) => s.kind)).toEqual(["rows", "rows", "collapsed", "rows", "rows"]);
    const collapsed = segments[2];
    expect(collapsed.kind === "collapsed" && collapsed.count).toBe(32);
    expect(collapsed.kind === "collapsed" && collapsed.rows).toHaveLength(32);
  });

  it("collapses a long trailing run", () => {
    const many = Array.from({ length: 20 }, () => same(0));
    const rows = [changed(), ...many];
    const segments = collapseUnchangedRuns(rows, 4, 12);
    expect(segments.map((s) => s.kind)).toEqual(["rows", "rows", "collapsed"]);
    const collapsed = segments[2];
    expect(collapsed.kind === "collapsed" && collapsed.count).toBe(16);
  });

  it("collapses the middle when there are no changes at all", () => {
    const many = Array.from({ length: 20 }, (_, i) => same(i + 1));
    const segments = collapseUnchangedRuns(many, 4, 12);
    expect(segments.map((s) => s.kind)).toEqual(["rows", "collapsed", "rows"]);
    const collapsed = segments[1];
    expect(collapsed.kind === "collapsed" && collapsed.count).toBe(12);
  });

  it("returns a single rows segment when nothing exceeds the threshold", () => {
    const rows = [same(1), same(2)];
    expect(collapseUnchangedRuns(rows)).toEqual([{ kind: "rows", rows }]);
  });
});

describe("stringifyForDiff", () => {
  it("pretty-prints with 2-space indentation", () => {
    expect(stringifyForDiff({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
