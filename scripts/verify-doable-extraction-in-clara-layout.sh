#!/usr/bin/env bash
# verify-doable-extraction-in-clara-layout.sh
# Phase 7 planning evidence harness (developer-reported evidence; agent workspace, outside the repository).
#
# Purpose: the Doable-source library's own verifier (docs/doable-source/verification/verify-extraction.mjs)
# resolves its root as "<cwd>/ai-platform-core" and queries "HEAD:ai-platform-core/<rel>" in the current git
# repo. In the Clara repository the library is vendored at "docs/doable-source/", so an in-place run produces
# false negatives ("actual: null"). This harness materializes a scratch git repo from the COMMITTED tree of a
# given Clara revision (git archive preserves committed modes; copying from the worktree would pick up the
# environment's 755 filesystem modes and break tree-SHA checks), lays the library out at ai-platform-core/,
# and runs the verifier there. Read-only with respect to the Clara repository (writes only to this scratch dir).
#
# Usage: bash verify-doable-extraction-in-clara-layout.sh [<clara-rev>]   (default: HEAD of the feature worktree)
set -euo pipefail

CLARA_WORKTREE="${CLARA_WORKTREE:-/home/z/my-project/.worktrees/vc}"
REV="${1:-HEAD}"
HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="$HARNESS_DIR/tmp-verify-repo-clara-layout"

rm -rf "$SCRATCH"
mkdir -p "$SCRATCH/arx"
git -C "$CLARA_WORKTREE" archive "$REV" docs/doable-source | tar -x -C "$SCRATCH/arx"
mv "$SCRATCH/arx/docs/doable-source" "$SCRATCH/ai-platform-core"
rmdir "$SCRATCH/arx/docs" "$SCRATCH/arx" 2>/dev/null || true
cd "$SCRATCH"
git init -q .
git config user.email "verify@local"
git config user.name "local-verifier"
git add -A
git commit -qm "archived docs/doable-source @ $REV for verification"

set +e
node ai-platform-core/verification/verify-extraction.mjs > "$HARNESS_DIR/phase7-planning-verification-report.json" 2> "$HARNESS_DIR/phase7-planning-verification-stderr.txt"
EXIT=$?
set -e
echo "verifier exit code: $EXIT (report: $HARNESS_DIR/phase7-planning-verification-report.json)"
node -e '
const r = require(process.argv[1]);
const c = r.checks || {};
const t = c.gitTrees || {};
const fails = Object.entries(t).filter(([k, v]) => v && v.pass === false);
const im = c.immutableSource || {};
console.log("mode:", r.mode);
console.log("overall pass:", r.pass);
console.log("gitBlobs:", c.gitBlobsPass, "| fileFailures:", (im.fileFailures || []).length,
  "(all in mcp-servers:", (im.fileFailures || []).every(f => String(f.path).includes("mcp-servers")) + ")");
console.log("captured/directory trees failing:", Object.values(im.trees || {}).filter(x => x && x.pass === false).length,
  "of", Object.keys(im.trees || {}).length, "| gitTrees failing:", fails.length, "of", Object.keys(t).length);
for (const [k] of fails) console.log("  failing tree:", k);
console.log("requiredFiles:", c.requiredFiles && c.requiredFiles.pass,
  "| requiredDirectories:", c.requiredDirectories && c.requiredDirectories.pass,
  "| packageHardening:", c.packageHardening && c.packageHardening.pass,
  "| externalDependencyInventory:", c.externalDependencyInventory && c.externalDependencyInventory.pass,
  "| uiReferenceFiles:", c.uiReferenceFiles && c.uiReferenceFiles.pass,
  "| capabilityClosure:", c.capabilityClosure && c.capabilityClosure.pass);
' "$HARNESS_DIR/phase7-planning-verification-report.json"
exit $EXIT
