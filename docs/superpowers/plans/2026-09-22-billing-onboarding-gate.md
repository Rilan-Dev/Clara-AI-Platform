# Billing Onboarding Gate Implementation Plan

## 1. Inspect and map existing billing/auth paths
- Trace org registration, login, verification, dashboard entry, Stripe checkout/webhook, Razorpay order/verify/webhook, billing history, notification templates and scheduled jobs.
- Identify all shared entitlement/permission helpers and mutation routes that currently rely on subscription status.
- Preserve existing provider behavior and admin-managed subscriptions.

## 2. Add onboarding/payment state persistence
- Add a migration extending the existing organization subscription/billing model with pending plan/onboarding state, payment/order correlation, activation-review state, and reminder deduplication/audit data.
- Add constraints/indexes for idempotency and org lookup.
- Backfill safely so existing active subscriptions remain active.

## 3. Centralize organization access resolution
- Create a server-only resolver that returns email verification, onboarding/payment and entitlement state.
- Expose a reusable mutation guard returning stable error codes.
- Ensure org membership and super-admin rules remain intact.
- Fail closed for paid operations.

## 4. Fix registration
- For paid plans, create onboarding intent but no active subscription.
- Free plan remains active without payment, subject to email verification policy.
- Do not let plan selection activate entitlements.
- Return onboarding state to the client.

## 5. Gate checkout
- Require verified email on Stripe session creation and Razorpay order creation.
- Bind checkout to the server-stored pending plan/order rather than trusting arbitrary client plan changes.
- Mark payment_pending only after a real gateway order/session is created.
- Persist safe provider identifiers and expected amount/currency.

## 6. Harden payment verification and webhooks
- Verify gateway signatures and fetch/validate gateway payment/session data where supported.
- Check organization, plan, amount, currency and order/session correlation.
- Record every meaningful event idempotently.
- Never activate on a frontend success redirect alone.
- Activate only after verified payment and successful state transition.
- On activation failure/mismatch after confirmed payment, record payment_review and create admin/support notification.
- Failed/cancelled payments stay non-active.

## 7. Add dashboard/API entitlement enforcement
- Update dashboard entry to resolve onboarding state.
- Keep recovery/billing/verification screens accessible.
- Apply the shared guard to paid mutations and sensitive feature APIs, prioritizing shared wrappers/call sites to avoid bypasses.
- Return consistent status/code payloads so the UI can show the correct gate.

## 8. Build continuation UI
- Update verification screen so Continue cannot bypass verification.
- Add an onboarding/payment gate for verified-but-unpaid, failed/cancelled, and payment-review states.
- Continue payment uses the persisted org/plan state.
- Successful payment only redirects after activation is confirmed.

## 9. End-of-day reminder
- Reuse existing email template and scheduler infrastructure if present.
- Add a durable daily job/cron endpoint if needed, protected with a secret.
- Send verification reminder or payment continuation reminder according to state.
- Deduplicate per org/day and never rely solely on Redis.
- Add admin/support notification template for payment-review cases.

## 10. Tests and verification
- Unit tests for state resolver and transitions.
- API tests for unverified checkout rejection, cancelled/failed payment, duplicate events, mismatches, successful activation and payment-review.
- Tests for direct dashboard/API access.
- Reminder deduplication and email-provider failure tests.
- Run lint, typecheck, tests and production build.

## 11. Git/PR workflow
- All implementation stays on Vite-Converted.
- Commit coherent changes on that branch.
- Compare against Vercel-Prod and resolve divergence without editing Vercel-Prod directly.
- Create PR Vite-Converted -> Vercel-Prod.
- Run/inspect PR checks, merge the PR, and provide the review/PR URL.
