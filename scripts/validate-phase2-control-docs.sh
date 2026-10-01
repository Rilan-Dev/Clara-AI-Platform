#!/usr/bin/env bash
# validate-phase2-control-docs.sh — Phase 2 validation suite (developer-executed, read-only)
# Validates the Z.AI Developer Handoff System (ZAI_HANDOFF.md + template + phase-state reconciliation)
# Usage: bash /home/z/my-project/scripts/validate-phase2-control-docs.sh
set -u
REPO="/home/z/my-project/.worktrees/vc"
cd "$REPO" || exit 2
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS: $1"; }
bad(){ FAIL=$((FAIL+1)); echo "FAIL: $1"; }

ZH="docs/project-control/ZAI_HANDOFF.md"
TP="docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md"

echo "=== 1. Handoff document structure ==="
[ -f "$ZH" ] && ok "ZAI_HANDOFF.md exists" || bad "ZAI_HANDOFF.md missing"
[ -f "$TP" ] && ok "template exists" || bad "template missing"
for s in '### I.1 Purpose' '### I.2 Roles and authority boundaries' '### I.3 Required handoff structure' '### I.4 Phase lifecycle and status vocabulary' '### I.5 Correction protocol' '### I.6 Handoff integrity' '### I.7 Developer evidence and completion report' '### I.8 Review boundary' '### I.9 STOP boundary' '### I.10 Fresh-session usability requirements' '### I.11 Relationship to other control documents' '### I.12 Template and instance management'; do
  rg -q -F "$s" "$ZH" && ok "Part I section: $s" || bad "Part I section missing: $s"
done
for s in '### Phase identity' '### Objective' '### Scope (approved)' '### Non-scope (explicit)' '### Prerequisites' '### Required reading' '### Implementation tasks (numbered, deterministic)' '### Files / components' '### Interfaces / contracts' '### Security constraints' '### Testing requirements' '### Acceptance criteria (pass/fail)' '### Git requirements' '### Evidence requirements' '### Review boundary' '### STOP boundary'; do
  rg -q -F "$s" "$ZH" && ok "Part II section: $s" || bad "Part II section missing: $s"
done
# Part II identity fields
for f in 'Phase number' 'Phase name' 'Current status' 'Repository' 'Branch' 'Baseline commit' 'Architect' 'Developer' 'Handoff date'; do
  rg -q -F "| $f |" "$ZH" && ok "identity field: $f" || bad "identity field missing: $f"
done
# Template mirrors the 16 sections + corrective variant
for s in '## Phase identity' '## Objective' '## Scope (approved)' '## Non-scope (explicit)' '## Prerequisites' '## Required reading' '## Implementation tasks (numbered, deterministic)' '## Files / components' '## Interfaces / contracts' '## Security constraints' '## Testing requirements' '## Acceptance criteria (pass/fail)' '## Git requirements' '## Evidence requirements' '## Review boundary' '## STOP boundary' 'Corrective handoff variant'; do
  rg -q -F "$s" "$TP" && ok "template section: $s" || bad "template section missing: $s"
done

echo "=== 2. Internal references resolve ==="
# Path-like backtick references only: whitespace-free, contain a slash, end in a known extension.
# Slash-less bare filenames (db.ts, ci.yml, CURRENT_PHASE.md, ...) are contextual prose references
# (historical Phase 0 report inventory + sibling-document shorthand; unchanged since Phase 1
# validation) and are out of scope for path resolution.
REFS=$(rg -o --no-filename '`[^[:space:]`]+\.(md|yml|json|ts|mjs|sql)`' docs/project-control/*.md docs/project-control/templates/*.md 2>/dev/null | tr -d '`' | rg '/' | sort -u || true)
# Declared planned / deliberately non-existent (documented in PROJECT_STATE.md index, I-001, I-007)
PLANNED="CHAT_CONTINUITY.md docs/project-control/CHAT_CONTINUITY.md worklog.md docs/project-control/worklog.md docs/project-control/sessions/SESSION-*.md docs/AGENTS.md graphify-out/graph.json src/lib/db/migrations/NNN_description.sql"
# Historical Phase 0 report §4 module-inventory shorthand (brace/glob forms; unchanged since Phase 1 validation)
HIST="providers/{openai,gemini,sarvam,tei}.ts src/lib/{plans,plan-guard,quota-admission,rate-limit}.ts"
MISS=0; UNRES=""
for r in $REFS; do
  case " $PLANNED $HIST " in *" $r "*) continue;; esac
  case "$r" in *YYYY-MM-DD*) continue;; esac
  case "$r" in
    *\**|*\{*)  if bash -c "ls $r" >/dev/null 2>&1 || bash -c "ls docs/doable-source/$r" >/dev/null 2>&1; then continue; fi ;;
  esac
  if [ -e "$r" ]; then continue; fi
  if [ -e "docs/doable-source/$r" ]; then continue; fi   # Phase 0 report: commands run from docs/doable-source/
  UNRES="$UNRES $r"; MISS=$((MISS+1))
done
[ "$MISS" -eq 0 ] && ok "all path-like references resolve (declared-planned exceptions: CHAT_CONTINUITY.md, root worklog.md, sessions/, docs/AGENTS.md, graphify-out/graph.json, migrations NNN pattern; historical Phase 0 §4 shorthand unchanged since Phase 1; bare filenames excluded as contextual prose)" || bad "$MISS unresolved references:$UNRES"

echo "=== 3. No duplicate handoff source ==="
DUP=$(git ls-files | rg -i 'handoff|project-control/templates' | rg -v '^docs/project-control/ZAI_HANDOFF.md$|^docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md$')
[ -z "$DUP" ] && ok "exactly one handoff protocol + one template; no duplicates" || bad "duplicate handoff sources: $DUP"
N3=$(git ls-files | rg -ci 'CHAT_CONTINUITY|(^|/)worklog\.md$' || true)
[ "$N3" -eq 1 ] && ok "no CHAT_CONTINUITY.md / project worklog.md (only library-scoped docs/doable-source/WORKLOG.md)" || bad "unexpected Phase 3/4 artifacts ($N3)"
[ ! -e docs/project-control/sessions ] && ok "no sessions/ records" || bad "sessions/ exists prematurely"

echo "=== 4. Status vocabulary consistency ==="
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE; do
  rg -q -F 'Phase 2 — Z.AI Developer Handoff System' "docs/project-control/$f.md" && ok "$f.md names Phase 2" || bad "$f.md phase mismatch"
done
rg -q -F 'Phase 2 — Z.AI Developer Handoff System' "$ZH" && ok "ZAI_HANDOFF.md names Phase 2" || bad "ZAI_HANDOFF.md phase mismatch"
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE; do
  rg -q 'IN_PROGRESS' "docs/project-control/$f.md" && ok "$f.md status IN_PROGRESS present" || bad "$f.md IN_PROGRESS missing"
done
rg -q -F '**IN_PROGRESS** — developer implementation complete; awaiting architect review' docs/project-control/ZAI_HANDOFF.md && ok "ZAI_HANDOFF.md status IN_PROGRESS awaiting review" || bad "ZAI_HANDOFF.md status wrong"
for st in PLANNED IN_PROGRESS BLOCKED CORRECTION_REQUIRED VERIFIED CLOSED; do
  rg -q "$st" "$ZH" && ok "vocabulary token: $st" || bad "vocabulary token missing: $st"
done
rg -q -F 'Phase 1 — Durable Project-Control Foundation — CLOSED' docs/project-control/VERIFICATION_STATE.md && ok "Phase 1 recorded CLOSED" || bad "Phase 1 closure missing"

echo "=== 5. Role separation / no false verification claims ==="
rg -q -F 'Phase 2 is NOT verified' docs/project-control/VERIFICATION_STATE.md && ok "Phase 2 marked NOT verified" || bad "Phase 2 NOT-verified banner missing"
rg -q -F 'Phase 2 output: NOT YET REVIEWED' docs/project-control/PROJECT_STATE.md && ok "PROJECT_STATE: Phase 2 not-yet-reviewed" || bad "PROJECT_STATE missing not-yet-reviewed"
rg -q -F 'The phase is NOT closed' docs/project-control/CURRENT_PHASE.md && ok "CURRENT_PHASE: phase not closed" || bad "CURRENT_PHASE missing not-closed"
rg -q -F 'must not claim architect approval' "$ZH" && ok "handoff: no-architect-approval rule present" || bad "handoff missing no-approval rule"

echo "=== 6. Explicit STOP boundary ==="
rg -qi -F 'Z.AI MUST STOP' "$ZH" && ok "ZAI_HANDOFF: MUST STOP present" || bad "ZAI_HANDOFF: MUST STOP missing"
for p in 'start the next phase' 'implement unrelated improvements' 'make architectural decisions outside the handoff' 'deploy unless explicitly authorized' 'modify production' 'silently expand scope'; do
  rg -qi -F "$p" "$ZH" && ok "STOP prohibition: $p" || bad "STOP prohibition missing: $p"
done
rg -qi 'Z\.AI then STOPs' docs/project-control/CURRENT_PHASE.md && ok "CURRENT_PHASE stop boundary" || bad "CURRENT_PHASE stop boundary missing"

echo "=== 7. Correction protocol ==="
for f in 'Finding' 'Affected scope' 'Required correction' 'Acceptance criteria' 'Verification requirements' 'Explicit non-scope' 'Stop condition'; do
  rg -q -F "$f" "$ZH" && ok "corrective field: $f" || bad "corrective field missing: $f"
done
rg -q -F 'must NOT independently broaden' "$ZH" && ok "no-independent-broadening rule" || bad "broadening rule missing"

echo "=== 8. Evidence requirements ==="
for f in 'exact changed files' 'implementation summary' 'validation commands' 'remaining issues' 'remaining risks' 'deviations from scope' 'unresolved questions' 'no later phase was started'; do
  rg -qi -F "$f" "$ZH" && ok "evidence field: $f" || bad "evidence field missing: $f"
done

echo "=== 9. Secret scan ==="
SEC=$(rg -n 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' docs/project-control/ || true)
[ -z "$SEC" ] && ok "no credential material in docs/project-control/" || bad "secret-scan match: $SEC"

echo "=== 10. Scope check (git) ==="
CHANGED=$(git status --porcelain=v1 | awk '{print $2}')
UNEXPECT=$(echo "$CHANGED" | rg -v '^docs/project-control/' || true)
[ -z "$UNEXPECT" ] && ok "all changes under docs/project-control/ ($CHANGED)" || bad "out-of-scope changes: $UNEXPECT"

echo "=== 11. Lightweight repository validation ==="
npm run validate:model-config >/tmp/p2val.log 2>&1 && ok "npm run validate:model-config PASS" || { bad "validate:model-config FAILED"; tail -5 /tmp/p2val.log; }

echo ""
echo "RESULT: $PASS PASS / $FAIL FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
