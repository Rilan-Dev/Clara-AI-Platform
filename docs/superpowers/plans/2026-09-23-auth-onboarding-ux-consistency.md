# Clara AI Authentication and Onboarding UX Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Clara AI authentication, verification, signup, payment, and onboarding messaging state-accurate and regression-tested.

**Architecture:** Preserve existing auth/payment enforcement and onboarding APIs. Add one small pure state-to-copy contract, then update existing screens/templates to consume it. Do not introduce a second authentication or onboarding system.

**Tech Stack:** Next.js, React, TypeScript, existing auth APIs, email-template system, Vitest/test runner.

**Spec:** docs/superpowers/specs/2026-09-23-auth-onboarding-ux-consistency.md

## Global Constraints
- Work only on Vite-Converted; never directly modify Vercel-Prod.
- Preserve email verification and payment authorization gates.
- No second auth/onboarding state system.
- Production behavior changes require a failing test first.
- Never use registration wording for login-origin verification.
- Paid checkout remains blocked until emailVerified is true.

## Review Focus
- Paid signup after verification must continue to payment.
- Free signup after verification must not mention payment.
- Unverified login must not imply onboarding completion.
- Expired/invalid verification must provide recovery.
- Already-verified accounts must not be told to verify again.

## File Map
- Create: src/modules/auth/core/onboarding-copy.ts — pure state-to-copy/action contract.
- Create: src/modules/auth/core/onboarding-copy.test.ts — state mapping tests.
- Modify: src/app/login/verify-email/page.tsx — remove registration-only language and use context-aware continuation.
- Modify: src/features/platform/screens/signup-screen.tsx — correct plan/verification/payment wording.
- Modify: src/features/platform/screens/signup-verify-screen.tsx — align legacy verification screen.
- Modify: src/features/admin/screens/login-screen.tsx — clarify unverified-login action.
- Modify: src/features/platform/screens/checkout-success-screen.tsx — remove stale flow claims.
- Modify: src/lib/email-templates.ts — correct verification email defaults.
- Modify: src/lib/__tests__/email-templates.test.ts — email-copy regression tests.
- Modify: src/app/api/cron/onboarding-reminders/route.ts — align reminder wording.

## Task 1: Define the state-to-copy contract
**Files:** create src/modules/auth/core/onboarding-copy.ts and src/modules/auth/core/onboarding-copy.test.ts.
- [ ] Write failing Vitest tests for login, paid signup, free signup, expired token, and already-verified states.
- [ ] Run the focused test and confirm it fails because the helper does not exist.
- [ ] Implement VerificationContext and getVerificationCopy returning title, description, nextAction, and destination.
- [ ] Ensure login output never contains registration; paid output names payment; free output does not mention payment.
- [ ] Run the focused test and confirm PASS.
- [ ] Commit: git add src/modules/auth/core/onboarding-copy.ts src/modules/auth/core/onboarding-copy.test.ts && git commit -m "test: define auth onboarding copy contract"

## Task 2: Fix login verification page
**Files:** src/app/login/verify-email/page.tsx and the copy tests.
- [ ] Add a failing regression assertion that login verification copy contains no registration wording.
- [ ] Run the focused test and confirm RED.
- [ ] Replace the hard-coded “Continue your registration” block with context-aware login wording. Login-origin verification must tell the user to return to Clara AI/sign in; signup-origin must remain signup-specific.
- [ ] Preserve existing token verification and resend behavior.
- [ ] Run focused tests and repository typecheck.
- [ ] Commit: git add src/app/login/verify-email/page.tsx src/modules/auth/core/onboarding-copy.test.ts && git commit -m "fix: clarify email verification continuation"

## Task 3: Correct signup plan and verification messaging
**Files:** src/features/platform/screens/signup-screen.tsx and copy tests.
- [ ] Add failing assertions that plan selection does not promise immediate activation and that paid/free verification destinations differ.
- [ ] Run focused tests and confirm RED.
- [ ] Replace “Your selected plan starts immediately.” with accurate sequence wording: verification is required first and paid plans require payment before activation.
- [ ] Keep the existing emailVerified polling/routing mechanism; do not add another routing system.
- [ ] Verify free routes to existing free onboarding and paid routes to existing checkout.
- [ ] Run tests and typecheck.
- [ ] Commit: git add src/features/platform/screens/signup-screen.tsx src/modules/auth/core/onboarding-copy.test.ts && git commit -m "fix: clarify signup plan activation sequence"

## Task 4: Align login and legacy signup verification screens
**Files:** src/features/admin/screens/login-screen.tsx and src/features/platform/screens/signup-verify-screen.tsx.
- [ ] Add failing CTA assertions for unverified login and paid/free signup verification.
- [ ] Run focused tests and confirm RED.
- [ ] Update login interstitial wording so the action explicitly means the user has verified their email; do not change server-side authorization.
- [ ] Update legacy signup verification to use selected plan and avoid unconditional checkout language.
- [ ] Run focused tests and typecheck.
- [ ] Commit: git add src/features/admin/screens/login-screen.tsx src/features/platform/screens/signup-verify-screen.tsx && git commit -m "fix: align login and signup verification CTAs"

## Task 5: Clean checkout-success and reminder copy
**Files:** src/features/platform/screens/checkout-success-screen.tsx and src/app/api/cron/onboarding-reminders/route.ts.
- [ ] Add regression assertions for stale paid-signup wording.
- [ ] Run focused tests and confirm RED.
- [ ] Remove stale comments/user-visible claims that paid signup skips verification if the current flow no longer does so.
- [ ] Keep reminder wording explicit that email verification precedes payment and activation.
- [ ] Run tests and typecheck.
- [ ] Commit: git add src/features/platform/screens/checkout-success-screen.tsx src/app/api/cron/onboarding-reminders/route.ts && git commit -m "fix: clarify onboarding reminder and payment states"

## Task 6: Correct verification email template
**Files:** src/lib/email-templates.ts and src/lib/__tests__/email-templates.test.ts.
- [ ] Write failing tests asserting the verification email asks to verify the email, does not claim activation, and does not unconditionally promise checkout.
- [ ] Run the email-template test and confirm RED.
- [ ] Update the generic verification template CTA to “Verify my email” and keep generic copy independent of plan/payment unless reliable plan context is already supplied.
- [ ] Run the email-template test and confirm GREEN.
- [ ] Commit: git add src/lib/email-templates.ts src/lib/__tests__/email-templates.test.ts && git commit -m "fix: make verification email copy state-accurate"

## Task 7: Full regression verification
- [ ] Search for known contradictory phrases with git grep: “Continue your registration”, “selected plan starts immediately”, “straight from registration”, and “take you to checkout”.
- [ ] Review remaining occurrences of “Continue to Clara AI”, “registration tab”, and “starts immediately” in context; do not mass-replace unrelated text.
- [ ] Run the repository's full test command from package.json.
- [ ] Run the production build/typecheck command from package.json.
- [ ] Run git diff --check and inspect the complete diff against the spec.
- [ ] Confirm Vercel-Prod has not been directly modified.
- [ ] Update/create the PR from Vite-Converted to Vercel-Prod with exact test/build results; do not merge automatically.