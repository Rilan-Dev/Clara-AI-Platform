#!/usr/bin/env bash
# verify-immutable-blobs-by-commit.sh
# Phase 7-B sync-resolution evidence: verify every file pinned in the Doable
# immutable-source manifest resolves, in the given COMMIT TREE, to the pinned
# Git blob hash. Equivalent to verify-immutable-blobs-in-worktree.sh, but
# object-database-only (no worktree checkout), so it can verify ANY commit —
# here both the local 7-B tip and the current remote tip.
#
# Usage: verify-immutable-blobs-by-commit.sh <commit-ish> <label>
set -u
COMMIT="${1:?commit-ish required}"
LABEL="${2:-$COMMIT}"
REPO="/home/z/my-project"
MANIFEST_PATH="docs/doable-source/verification/immutable-source-manifest.json"

cd "$REPO" || exit 2

node - "$COMMIT" "$LABEL" "$MANIFEST_PATH" <<'EOF'
const { execFileSync } = require("node:child_process");

const [, , commit, label, manifestPath] = process.argv;
const git = (args) => execFileSync("git", args, { encoding: "utf8", cwd: "/home/z/my-project" }).trim();

const manifestRaw = git(["show", `${commit}:${manifestPath}`]);
const manifest = JSON.parse(manifestRaw);
const files = manifest.files;

let present = 0, verified = 0, absent = 0;
const absentByRoot = new Map();
const mismatched = [];
const absentSamples = [];

for (const entry of files) {
  const inTree = `docs/doable-source/${entry.root}/${entry.path}`;
  let sha = null;
  try {
    sha = git(["rev-parse", `${commit}:${inTree}`]);
  } catch {
    absent++;
    absentByRoot.set(entry.root, (absentByRoot.get(entry.root) ?? 0) + 1);
    if (absentSamples.length < 5) absentSamples.push(inTree);
    continue;
  }
  present++;
  if (sha === entry.sha) {
    verified++;
  } else {
    mismatched.push(`${inTree}: expected ${entry.sha} got ${sha}`);
  }
}

console.log(`=== IMMUTABLE-SOURCE VERIFICATION — ${label} (${commit}) ===`);
console.log(`Pinned files: ${files.length}`);
console.log(`Present: ${present}`);
console.log(`Byte-verified (blob OID match): ${verified}/${present}`);
console.log(`Absent: ${absent} (by root: ${[...absentByRoot.entries()].map(([k, v]) => `${k}=${v}`).join(", ")})`);
console.log(`Mismatches: ${mismatched.length}`);
for (const m of mismatched.slice(0, 10)) console.log("  MISMATCH " + m);
const confined = absentEntries => {
  // reconstruct confinement from manifest: all absent entries must start with mcp-servers
  let all = true, any = false;
  for (const entry of files) {
    let ok;
    try { git(["rev-parse", `${commit}:docs/doable-source/${entry.root}/${entry.path}`]); ok = true; } catch { ok = false; }
    if (!ok) { any = true; if (!entry.path.startsWith("mcp-servers")) all = false; }
  }
  return all && any;
};
console.log(`All absent-file failures confined to mcp-servers family (I-014): ${confined()}`);
console.log(`Manifest blob OID at this commit: ${git(["rev-parse", `${commit}:${manifestPath}`])}`);
process.exitCode = mismatched.length === 0 && verified === present ? 0 : 1;
EOF
