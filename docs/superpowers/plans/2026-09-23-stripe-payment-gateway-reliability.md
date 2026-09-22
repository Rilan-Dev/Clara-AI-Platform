# Stripe Payment Gateway Reliability Implementation Plan

## Scope
Work only on `Vite-Converted`; merge to `Vercel-Prod` only through PR.

## Tasks
1. Add `src/modules/billing/core/health.ts` with server-side Stripe/Razorpay checks.
2. Add focused Vitest coverage for payment health and secret redaction.
3. Add Stripe/Razorpay health results to `/api/platform/services-status`.
4. Add payment gateway cards and actionable alerts to `/system-status`.
5. Normalize/validate admin-saved payment credentials and Price IDs.
6. Make Stripe checkout fail closed when webhook verification is unavailable and sanitize checkout errors.
7. Notify platform admins immediately from Stripe checkout/webhook failures; keep scheduled system-status monitoring as a second detection path.
8. Run CI; inspect typecheck/test/lint/build results before production merge.

## Acceptance
- Invalid Stripe credentials show as Down on System Status rather than being discovered only by a customer checkout.
- Missing webhook secret or missing enabled `/api/webhooks/stripe` endpoint is Down because paid activation depends on webhook confirmation.
- No secret value is rendered in UI, API error responses, or incident messages.
- Vercel-Prod is not directly modified.
