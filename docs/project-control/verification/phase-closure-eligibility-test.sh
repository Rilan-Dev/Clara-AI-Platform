#!/usr/bin/env bash
#
# phase-closure-eligibility-test.sh — deterministic demonstration of the Phase 5 closure rule
#
# Established by Phase 5 — Verification and Phase-Gate System (2026-10-01; plan Phase 5;
# DECISIONS.md D-020). Binding rules: VERIFICATION_STATE.md §"Verification and phase-gate
# contract (durable)". Reusable form + worked examples: docs/project-control/VERIFICATION_CHECKLIST.md.
#
# What this test demonstrates:
#   - A deliberately incomplete verification state (required Gate D missing, while "tests
#     passed" and "developer says complete" are both true) computes closure eligibility = FAIL.
#   - A complete applicable-gate state (all required gates PASS; conditional gates recorded
#     NOT_APPLICABLE; Gate D architect-verified) computes closure eligibility = PASS.
#   - P0 blockers, unhandled P1s, developer-reported "code review", database-applicability
#     mismatches, and open blocking corrections each independently force FAIL.
#
# Properties: read-only (no repository writes, no network, no filesystem changes);
# deterministic (fixed inputs, no clock/randomness — identical output on every run);
# self-contained (fixtures embedded below; bash + standard utilities only); NO application
# or production-runtime dependency. It is a governance artifact, NOT a CI gate, and running
# it is never itself evidence of phase completion.
#
# Usage:   bash docs/project-control/verification/phase-closure-eligibility-test.sh
# Exit:    0 iff every case computes its expected eligibility; 1 otherwise.

set -u

# ---------------------------------------------------------------------------
# Closure-eligibility evaluator (implements VERIFICATION_CHECKLIST.md §8 rules R1–R6;
# R7 — Final State Contract consistency — is a live-repository check performed by the
# phase-close checklist, not a fixture field, and is therefore out of this evaluator's scope).
#
# Fixture format: KEY=VALUE lines. Gate values are STATUS:EVIDENCE-CLASS[:note], where
# STATUS is PASS | FAIL | MISSING | NOT_APPLICABLE. Ignored-by-design fields
# (TESTS_PASSED, DEVELOPER_COMPLETION_CLAIM) exist precisely to demonstrate that they
# cannot influence eligibility.
# ---------------------------------------------------------------------------
evaluate_closure_eligibility() {
    local fixture="$1" line key value
    local -A S=()
    while IFS= read -r line; do
        case "$line" in ''|\#*) continue ;; esac
        key="${line%%=*}"
        value="${line#*=}"
        S["$key"]="$value"
    done <<< "$fixture"

    local surfaces=",${S[CHANGED_SURFACES]:-unknown},"
    local e_required=0 f_required=0
    case "$surfaces" in *,database,*|*,db,*) e_required=1 ;; esac
    case "$surfaces" in *,deployment,*) f_required=1 ;; esac

    local -a reasons=()
    local gate val status

    # R1 — required gates (A, B, C, D) must be PASS
    for gate in A B C D; do
        val="${S[GATE_$gate]:-MISSING}"
        status="${val%%:*}"
        if [ "$status" != "PASS" ]; then
            reasons+=("required Gate $gate is '${status}' (expected PASS)")
        fi
    done

    # R3 — Gate D PASS must be architect-verified (an actual ChatGPT review)
    val="${S[GATE_D]:-MISSING}"
    if [ "${val%%:*}" = "PASS" ]; then
        local dclass="${val#PASS:}"
        dclass="${dclass%%:*}"
        if [ "$dclass" != "architect-verified" ]; then
            reasons+=("Gate D PASS is '${dclass}' — only an actual architect review satisfies Gate D")
        fi
    fi

    # R2 — conditional gates: recorded determination + no applicability mismatch
    val="${S[GATE_E]:-MISSING}"
    if [ "$e_required" -eq 1 ]; then
        if [ "${val%%:*}" != "PASS" ]; then
            reasons+=("Gate E required (database surfaces changed) but is '${val%%:*}' — NOT_APPLICABLE is an applicability lie here")
        fi
    else
        if [ "${val%%:*}" != "NOT_APPLICABLE" ]; then
            reasons+=("Gate E is '${val%%:*}' — a recorded NOT_APPLICABLE applicability assessment is required")
        fi
    fi
    val="${S[GATE_F]:-MISSING}"
    if [ "$f_required" -eq 1 ]; then
        if [ "${val%%:*}" != "PASS" ]; then
            reasons+=("Gate F required (deployment surfaces changed) but is '${val%%:*}' — NOT_APPLICABLE is an applicability lie here")
        fi
    else
        if [ "${val%%:*}" != "NOT_APPLICABLE" ]; then
            reasons+=("Gate F is '${val%%:*}' — a recorded NOT_APPLICABLE applicability assessment is required")
        fi
    fi

    # R4 — P0 count must be 0 (no exception path is defined in the contract)
    if [ "${S[P0_COUNT]:-0}" != "0" ]; then
        reasons+=("P0_COUNT=${S[P0_COUNT]} — P0 unconditionally prevents closure")
    fi

    # R5 — P1 count must be 0, or every P1 must carry a recorded architect-approved exception
    if [ "${S[P1_COUNT]:-0}" != "0" ]; then
        case "${S[P1_EXCEPTION]:-none}" in
            architect-approved:*) : ;;
            *) reasons+=("P1_COUNT=${S[P1_COUNT]} without a recorded architect-approved exception") ;;
        esac
    fi

    # R6 — no unresolved blocking correction
    if [ "${S[BLOCKING_CORRECTION_OPEN]:-no}" = "yes" ]; then
        reasons+=("an unresolved blocking correction is open")
    fi

    if [ "${#reasons[@]}" -eq 0 ]; then
        echo "PASS"
    else
        local joined
        joined="$(printf '%s; ' "${reasons[@]}")"
        echo "FAIL (${joined%??})"
    fi
}

# ---------------------------------------------------------------------------
# Case runner
# ---------------------------------------------------------------------------
TOTAL=0
CORRECT=0

run_case() {
    local name="$1" expected="$2" fixture computed eligibility
    fixture="$(cat)"
    TOTAL=$((TOTAL + 1))
    computed="$(evaluate_closure_eligibility "$fixture")"
    eligibility="${computed%% *}"
    local tests="${TESTS_STATE:-n/a}" claim="${CLAIM_STATE:-n/a}"
    if [ "$eligibility" = "$expected" ]; then
        CORRECT=$((CORRECT + 1))
        printf '[%-46s] tests=%-6s developer-claim=%-4s computed=%-5s expected=%-5s MATCH\n' \
            "$name" "$tests" "$claim" "$eligibility" "$expected"
    else
        printf '[%-46s] tests=%-6s developer-claim=%-4s computed=%-5s expected=%-5s MISMATCH\n' \
            "$name" "$tests" "$claim" "$eligibility" "$expected"
        printf '    computed detail: %s\n' "$computed"
    fi
}

echo "== phase-closure-eligibility-test.sh — deterministic closure-rule demonstration (Phase 5, 2026-10-01) =="
echo "Contract: VERIFICATION_STATE.md §Verification and phase-gate contract (durable) · Form: VERIFICATION_CHECKLIST.md"
echo "Rule under test: 'tests passed' + 'developer says complete' is NEVER sufficient closure evidence;"
echo "closure eligibility is decided by the applicable gates (A–F), the P0/P1 policy, and open corrections."
echo ""

# Case 1 (worked Example 1) — deliberately incomplete: tests passed + developer claims
# complete, but the required Gate D (architect code review) is MISSING.  → FAIL
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-1-incomplete-missing-gate-d" "FAIL" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported:scope-recorded
GATE_B=PASS:developer-reported:requirements-complete
GATE_C=PASS:developer-reported:validation-suite-0-fail
GATE_D=MISSING
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=0
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 2 (worked Example 2) — complete applicable-gate state: every required gate PASS,
# Gate D architect-verified, conditional gates recorded NOT_APPLICABLE.  → PASS
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-2-complete-applicable-gates" "PASS" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported:scope-recorded
GATE_B=PASS:developer-reported:requirements-complete
GATE_C=PASS:developer-reported:validation-suite-0-fail
GATE_D=PASS:architect-verified:chatgpt-review-of-exact-commit
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=0
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 3 — all gates PASS but a P0 blocker is recorded.  → FAIL (P0 unconditionally prevents closure)
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-3-p0-blocker" "FAIL" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:architect-verified
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=1
P1_COUNT=0
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 4 — all gates PASS but an unhandled P1 remains.  → FAIL
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-4-p1-unhandled" "FAIL" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:architect-verified
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=1
P1_EXCEPTION=none
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 5 — one P1 with an explicitly recorded architect-approved exception
# (in real use: an actual DECISIONS.md reference decided by the architect).  → PASS
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-5-p1-architect-approved-exception" "PASS" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:architect-verified
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=1
P1_EXCEPTION=architect-approved:EXAMPLE-DECISIONS-MD-REFERENCE
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 6 — "code review" claimed as PASS but attested only by the developer.  → FAIL
# (only an actual ChatGPT review may produce architect-verified review evidence)
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-6-gate-d-developer-reported" "FAIL" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:developer-reported:developer-self-review
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=0
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 7 — applicability mismatch: database surfaces changed, yet Gate E is claimed
# NOT_APPLICABLE.  → FAIL (a false applicability claim is an evidence problem)
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-7-database-applicability-mismatch" "FAIL" <<'EOF'
CHANGED_SURFACES=docs,database
GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:architect-verified
GATE_E=NOT_APPLICABLE:claimed-no-db-surface-but-migrations-changed
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=0
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

# Case 8 — an unresolved blocking correction remains open.  → FAIL
TESTS_STATE=passed CLAIM_STATE=yes
run_case "case-8-open-blocking-correction" "FAIL" <<'EOF'
CHANGED_SURFACES=docs-only
GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:architect-verified
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
P0_COUNT=0
P1_COUNT=0
BLOCKING_CORRECTION_OPEN=yes
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes
EOF

echo ""
if [ "$CORRECT" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    echo "RESULT: ${CORRECT}/${TOTAL} determinations correct — closure rule demonstrated."
    echo "  case-1 proves: 'tests passed' + 'developer says complete' is insufficient by itself (required Gate D missing)."
    echo "  case-2 proves: a complete applicable-gate state (Gate D architect-verified) is closure-eligible."
    echo "Exit status: 0"
    exit 0
else
    echo "RESULT: ${CORRECT}/${TOTAL} determinations correct — FAILURE: the evaluator diverges from the contract."
    echo "Exit status: 1"
    exit 1
fi
