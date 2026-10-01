#!/usr/bin/env bash
# verify-immutable-blobs-in-worktree.sh
# Phase 7-A evidence: verify every file pinned in the Doable immutable-source
# manifest is present in the Clara worktree with the pinned Git blob hash
# (equivalent to the planning session's scratch harness, reconstructed in this
# workspace after the prior harness was not carried over between sessions).
#
# Expected result: 771/771 present pinned blobs byte-identical; all failures
# confined to the absent mcp-servers/ family (issue I-014, OPEN).

set -u
WT="/home/z/my-project/.worktrees/vc"
MANIFEST="$WT/docs/doable-source/verification/immutable-source-manifest.json"
LIBROOT="$WT/docs/doable-source"

node - "$MANIFEST" "$LIBROOT" <<'EOF'
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const [, , manifestPath, libRoot] = process.argv;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const files = manifest.files;

let present = 0;
let verified = 0;
let absent = 0;
const absentEntries = [];
const absentByRoot = new Map();
const mismatched = [];

for (const entry of files) {
  const abs = path.join(libRoot, entry.root, entry.path);
  if (!fs.existsSync(abs)) {
    absent++;
    absentEntries.push(entry);
    absentByRoot.set(entry.root, (absentByRoot.get(entry.root) ?? 0) + 1);
    continue;
  }
  present++;
  const hash = execFileSync("git", ["hash-object", abs], { encoding: "utf8" }).trim();
  if (hash === entry.sha) {
    verified++;
  } else {
    mismatched.push(`${entry.root}/${entry.path}: expected ${entry.sha} got ${hash}`);
  }
}

console.log(`Pinned files: ${files.length}`);
console.log(`Present: ${present}`);
console.log(`Byte-verified (blob hash match): ${verified}/${present}`);
console.log(`Absent: ${absent} (by root: ${[...absentByRoot.entries()].map(([k, v]) => `${k}=${v}`).join(", ")})`);
console.log(`Mismatches: ${mismatched.length}`);
for (const m of mismatched.slice(0, 10)) console.log("  MISMATCH " + m);
const allFailuresConfinedToMcpServers = absentEntries.every((entry) => entry.path.startsWith("mcp-servers"));
console.log(`All absent-file failures confined to mcp-servers family (I-014): ${allFailuresConfinedToMcpServers && absentByRoot.size > 0}`);
process.exitCode = mismatched.length === 0 && verified === present ? 0 : 1;
EOF
