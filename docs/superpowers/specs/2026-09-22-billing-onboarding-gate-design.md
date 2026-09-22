# Billing Onboarding Gate Design

## Problem
Paid-plan registration currently creates an active org subscription before email verification or payment. Checkout endpoints can also create trialing subscriptions and payment callbacks activate without a complete onboarding/payment proof. This allows a user to reach the dashboard and plan-gated APIs after abandoning checkout.

## Goals
- Treat paid plan selection as onboarding intent, never as activation.
- Require verified email before creating/starting checkout.
- Require server-verified successful payment before paid entitlement becomes active.
- Failed, cancelled, abandoned, insufficient-funds, or uncertain payments never activate the paid plan.
- Enforce entitlement server-side for feature mutations and other paid operations.
- Preserve secure, append-only payment history and idempotent gateway events.
- Provide a continuation gate for incomplete onboarding.
- Escalate successful payment with failed/mismatched activation to platform admin/support.
- Send one end-of-day reminder for incomplete onboarding, with daily deduplication.

## State model
Paid onboarding is represented separately from active subscription state:
- email_unverified
- payment_required
- payment_pending
- payment_failed
- payment_cancelled
- payment_review
- active

Existing active/trialing/past_due/canceled subscription states remain valid for already-onboarded organizations. A selected paid plan is stored as pending intent until payment verification succeeds.

## Access rule
Paid organization operations require all of:
1. authenticated session
2. organization membership/permission
3. user email_verified = true
4. org subscription status = active
5. active plan entitlement matches the requested feature

Onboarding and billing-read endpoints remain accessible so the user can recover. Feature POST/PUT/PATCH/DELETE and other mutating paid APIs must fail closed with machine-readable onboarding/payment codes.

## Payment verification
Checkout order/session creation is allowed only after email verification. The server owns orgId/planId association and verifies gateway response/webhook identifiers, amount, currency, plan and organization before activation. Webhooks are idempotent. A successful gateway payment that cannot be safely reconciled or activated is recorded as payment_review and produces an admin/support notification rather than silently activating.

## Existing data reuse
Reuse org_subscriptions and billing_events where possible. Add only the minimum onboarding/payment metadata and audit/reconciliation fields needed for safe state transitions. Never store card/CVV data or raw sensitive payment credentials.

## UX
- Unverified users see verification required and cannot start checkout.
- Verified but unpaid users see Continue payment and the selected plan/status.
- Cancelled/failed payment returns to the continuation gate with retry.
- Direct /dashboard navigation cannot bypass the gate.
- Existing screens may remain navigable where appropriate, but protected mutation APIs enforce the server-side rule.
- Successful payment goes to the normal dashboard only after activation is confirmed.
- Payment-review state shows a support/admin verification message and blocks paid actions.

## Reminder
A daily end-of-day job finds non-active onboarding records, sends the appropriate verification/continue-payment email, and records a deduplication key for organization + calendar day. It skips active, deleted/disabled, and already-reminded records. It must not depend solely on an unavailable Redis queue.

## Failure cases
The implementation must cover browser close, refresh, repeated checkout, duplicate webhook, delayed webhook, delayed verification, payment from another device, amount/currency/plan mismatch, wrong-org payment, webhook/order race, activation failure after payment, direct URL/API access, multi-org users, and retries.

## Migration compatibility
Existing production organizations must not be downgraded or unexpectedly gated. Existing active subscriptions remain active. The migration/backfill must only classify incomplete onboarding where evidence supports it.

## Validation
Unit tests cover state transitions, authorization, idempotency and reminder deduplication. Integration/API tests cover checkout gating and both gateway callbacks. Build/lint/type checks must pass before PR.
