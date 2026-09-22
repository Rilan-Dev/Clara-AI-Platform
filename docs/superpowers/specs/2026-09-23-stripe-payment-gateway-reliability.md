# Stripe Payment Gateway Reliability Specification

## Goal
Make platform-admin payment configuration runtime-verifiable and make payment failures visible before customers reach a broken checkout.

## Success criteria
1. A Stripe secret saved from Settings is normalized and validated as a server-side `sk_test_` or `sk_live_` key.
2. Checkout trims runtime credentials, requires webhook configuration before creating a paid Checkout Session, and never returns a Stripe secret in an error.
3. `/system-status` performs a real Stripe API connectivity check, verifies the configured Stripe webhook endpoint exists, and validates configured Price IDs.
4. Razorpay receives the same runtime health treatment when configured.
5. Payment gateway failures create persistent platform-health incidents and notify active super-admins without requiring the status page to be open.
6. Stripe checkout failures and webhook failures trigger immediate incident notification.
7. Existing billing state/entitlement rules remain fail-closed; this change does not grant access based on a success redirect.

## Non-goals
- Changing plan prices or payment providers.
- Storing payment secrets in client code.
- Replacing Stripe/Razorpay webhook flows.
- Automatically creating or changing Stripe webhook endpoints.

## Verification
- Unit tests cover missing credentials, malformed Stripe keys, secret redaction, and unconfigured Razorpay.
- CI must pass typecheck, tests, lint, and build before production merge.
