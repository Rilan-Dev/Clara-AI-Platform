/**
 * src/features/admin/layouts/json-diff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for the Raw JSON side-by-side diff shown in the agent
 * workspace "Review changes" dialog (topbar Publish menu → View pending
 * changes → Raw JSON tab).
 *
 * The agent versioning API returns a SEMANTIC diff (field-aware, human
 * labels) — the raw JSON comparison is computed client-side by stringifying
 * both configurations and line-diffing the result, backing the
 * "Expand 637 lines …" advanced view the design calls for.
 *
 * Everything here is framework-free and side-effect-free so it can be
 * unit-tested in the node vitest environment.
 */

/** One visual row of the side-by-side diff. */
export type JsonDiffRow = {
  /** `changed` rows are paired old→new lines shown on both panes. */
  kind: "same" | "removed" | "added" | "changed";
  /** Left pane (published side). Null on pure additions. */
  left: { num: number; text: string } | null;
  /** Right pane (current/draft side). Null on pure removals. */
  right: { num: number; text: string } | null;
};

/**
 * Longest-common-subsequence line diff.
 *
 * Classic DP over line indices using Int32Array rows — agent configs are
 * ~600–1200 pretty-printed lines, so the O(n·m) table (≈1.4M cells worst
 * case) stays comfortably in memory and avoids shipping a diff dependency.
 */
export function diffLines(
  a: string[],
  b: string[],
): Array<{ op: "same" | "del" | "add"; aIdx: number; bIdx: number }> {
  const n = a.length;
  const m = b.length;
  // Intern identical lines so the LCS compares cheap integers.
  const intern = new Map<string, number>();
  const aIds = new Int32Array(n);
  const bIds = new Int32Array(m);
  for (let i = 0; i < n; i++) {
    const id = intern.get(a[i]);
    if (id === undefined) {
      intern.set(a[i], intern.size);
      aIds[i] = intern.size - 1;
    } else aIds[i] = id;
  }
  for (let j = 0; j < m; j++) {
    const id = intern.get(b[j]);
    if (id === undefined) {
      intern.set(b[j], intern.size);
      bIds[j] = intern.size - 1;
    } else bIds[j] = id;
  }

  // Full LCS table kept for the backtrace (n+1 rows × m+1 Int32 cells).
  const table: Int32Array[] = [];
  let prev = new Int32Array(m + 1);
  table.push(prev);
  for (let i = 1; i <= n; i++) {
    const cur = new Int32Array(m + 1);
    for (let j = 1; j <= m; j++) {
      cur[j] =
        aIds[i - 1] === bIds[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], cur[j - 1]);
    }
    table.push(cur);
    prev = cur;
  }

  // Walk back from (n, m) collecting operations, then reverse.
  const ops: Array<{ op: "same" | "del" | "add"; aIdx: number; bIdx: number }> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (aIds[i - 1] === bIds[j - 1]) {
      ops.push({ op: "same", aIdx: i - 1, bIdx: j - 1 });
      i--;
      j--;
    } else if (table[i - 1][j] > table[i][j - 1]) {
      // Strict > : on ties the backward walk takes the "add" side first so
      // the REVERSED output lists deletions before additions (git order).
      ops.push({ op: "del", aIdx: i - 1, bIdx: -1 });
      i--;
    } else {
      ops.push({ op: "add", aIdx: -1, bIdx: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ op: "del", aIdx: i - 1, bIdx: -1 });
    i--;
  }
  while (j > 0) {
    ops.push({ op: "add", aIdx: -1, bIdx: j - 1 });
    j--;
  }
  ops.reverse();
  return ops;
}

/**
 * Builds side-by-side rows from the line diff: each run of deletions and
 * additions is paired row-by-row (a changed line shows old on the left pane,
 * new on the right pane); leftovers keep a single side — matching the
 * "Published version | Current changes" two-column layout.
 */
export function buildSideBySideRows(a: string[], b: string[]): JsonDiffRow[] {
  const ops = diffLines(a, b);
  const rows: JsonDiffRow[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].op === "same") {
      const op = ops[k];
      rows.push({
        kind: "same",
        left: { num: op.aIdx + 1, text: a[op.aIdx] },
        right: { num: op.bIdx + 1, text: b[op.bIdx] },
      });
      k++;
      continue;
    }
    // Collect the full del/add run starting at k.
    const dels: number[] = [];
    const adds: number[] = [];
    while (k < ops.length && (ops[k].op === "del" || ops[k].op === "add")) {
      if (ops[k].op === "del") dels.push(ops[k].aIdx);
      else adds.push(ops[k].bIdx);
      k++;
    }
    const pairs = Math.min(dels.length, adds.length);
    for (let p = 0; p < pairs; p++) {
      rows.push({
        kind: "changed",
        left: { num: dels[p] + 1, text: a[dels[p]] },
        right: { num: adds[p] + 1, text: b[adds[p]] },
      });
    }
    for (let r = pairs; r < dels.length; r++) {
      rows.push({ kind: "removed", left: { num: dels[r] + 1, text: a[dels[r]] }, right: null });
    }
    for (let r = pairs; r < adds.length; r++) {
      rows.push({ kind: "added", left: null, right: { num: adds[r] + 1, text: b[adds[r]] } });
    }
  }
  return rows;
}

/**
 * Collapses long runs of unchanged rows into expandable segments
 * (GitHub-style "Expand N lines …"), keeping `context` unchanged rows on
 * each side of every change hunk. Leading/trailing runs only keep the rows
 * adjacent to a hunk. Runs at or below `threshold` are shown in full.
 *
 * Collapsed segments carry the rows they hide so the UI can expand them
 * in place without recomputing the diff.
 */
export type JsonDiffSegment =
  | { kind: "rows"; rows: JsonDiffRow[] }
  | { kind: "collapsed"; count: number; rows: JsonDiffRow[] };

export function collapseUnchangedRuns(
  rows: JsonDiffRow[],
  context = 4,
  threshold = 12,
): JsonDiffSegment[] {
  const segments: JsonDiffSegment[] = [];
  const isChange = (r: JsonDiffRow) => r.kind !== "same";

  let i = 0;
  while (i < rows.length) {
    if (isChange(rows[i])) {
      // Emit the change hunk (consecutive change rows) in full.
      let j = i;
      while (j < rows.length && isChange(rows[j])) j++;
      segments.push({ kind: "rows", rows: rows.slice(i, j) });
      i = j;
      continue;
    }
    // An unchanged run [i, j).
    let j = i;
    while (j < rows.length && !isChange(rows[j])) j++;
    const run = rows.slice(i, j);
    const hasPrevHunk = i > 0;
    const hasNextHunk = j < rows.length;

    if (run.length > threshold) {
      if (hasPrevHunk && hasNextHunk) {
        // Middle run — keep context on both sides, collapse the middle.
        const head = run.slice(0, context);
        const tail = run.slice(run.length - context);
        const middle = run.slice(context, run.length - context);
        if (head.length > 0) segments.push({ kind: "rows", rows: head });
        if (middle.length > 0) segments.push({ kind: "collapsed", count: middle.length, rows: middle });
        if (tail.length > 0) segments.push({ kind: "rows", rows: tail });
      } else if (hasNextHunk) {
        // Leading run — keep only the tail adjacent to the next hunk.
        const tail = run.slice(Math.max(0, run.length - context));
        const head = run.slice(0, Math.max(0, run.length - context));
        if (head.length > 0) segments.push({ kind: "collapsed", count: head.length, rows: head });
        if (tail.length > 0) segments.push({ kind: "rows", rows: tail });
      } else if (hasPrevHunk) {
        // Trailing run — keep only the head adjacent to the previous hunk.
        const head = run.slice(0, context);
        const tail = run.slice(context);
        if (head.length > 0) segments.push({ kind: "rows", rows: head });
        if (tail.length > 0) segments.push({ kind: "collapsed", count: tail.length, rows: tail });
      } else {
        // No changes at all — collapse the middle of the whole file.
        const head = run.slice(0, context);
        const tail = run.slice(Math.max(0, run.length - context));
        const middle = run.slice(context, Math.max(context, run.length - context));
        if (head.length > 0) segments.push({ kind: "rows", rows: head });
        if (middle.length > 0) segments.push({ kind: "collapsed", count: middle.length, rows: middle });
        if (tail.length > 0) segments.push({ kind: "rows", rows: tail });
      }
    } else if (run.length > 0) {
      segments.push({ kind: "rows", rows: run });
    }
    i = j;
  }
  return segments;
}

/** Pretty-prints a configuration for diffing (2-space indentation). */
export function stringifyForDiff(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
