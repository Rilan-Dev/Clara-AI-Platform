# 17 — Payments & Subscriptions

> Clara AI Platform feature documentation · Domain: `billing` + `/api/subscriptions/*` + webhooks · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

Monetisation: plan catalog, checkout (Razorpay primary, Stripe support), subscription lifecycle (upgrade / downgrade / renewal / expiry), the customer portal, billing history, onboarding gating, and gateway health. Its purpose is a closed payment loop — every tenant's entitlements (Features 11/24 quotas) derive from a verified, auditable subscription state that survives gateway outages and webhook replays.

## 2. Business Logic

- **Plan catalog** — `GET /api/subscriptions/plans` (route line 5) + platform management `/api/platform/subscription-plans`; plan availability by region/segment (`051_plan_availability.sql`); entitlements per plan (`055_plan_ai_provider_entitlements.sql`).
- **Checkout** — `/api/subscriptions/checkout` (+ `/verify`) create and confirm orders; Razorpay path: `POST /api/subscriptions/razorpay/order` (route line 34) creates the gateway order, `/verify` checks payment signature, webhook `/api/webhooks/razorpay` settles async states; Stripe path: `/api/webhooks/stripe` (route line 91) processes events. Signature verification failures are rejected without state mutation.
- **Lifecycle** — `/api/subscriptions/downgrade` schedules/executor (`035_scheduled_downgrades.sql`, expiry sweep `/api/subscriptions/expiry-sweep`); `/api/subscriptions/portal` links the gateway portal; `/api/billing/upgrade` legacy alias; onboarding gate `/api/subscriptions/onboarding-status` (Feature 03).
- **History & audit** — `/api/orgs/billing-history` + `src/lib/subscription-notifications.ts`: `queueNotification:82`, `getOrgOwnerEmail:152`, `writeSubscriptionAudit:170` — every state change emails the owner and writes audit rows (`010_subscription_audit.sql`).
- **Gateway health** — `src/modules/billing/core/health.ts`: `checkStripeGateway:23`, `checkRazorpayGateway:125`, `PaymentGatewayStatus` `:3` — feeds services-status (Feature 21).
- **Payments settings** — category metadata (`063_payment_settings_category.sql`), platform test route `/api/platform/payments/test`; admin UI `src/app/(admin)/settings/payments/page.tsx`.

## 3. Business Rules

- Webhook handlers verify vendor signatures BEFORE any DB mutation; replays are idempotent per event id.
- Entitlement changes take effect from the verified payment state only — never from client-declared plan claims.
- Scheduled downgrades execute via expiry-sweep (cron), with owner notification before and after.
- Payment/PII data is redacted in logs and analytics (Feature 24 redaction: `"payment"` type).
- Gateway outage does not corrupt subscription state: health checks surface the outage (services-status + incidents), and unverified events queue for retry.
- Onboarding gate blocks feature surfaces until billing setup completes for plans that require it (`050_billing_onboarding_gate.sql`).

## 4. Data Model

- `006_subscriptions.sql`, `010_subscription_audit.sql`, `035_scheduled_downgrades.sql`, `051_plan_availability.sql`, `055_plan_ai_provider_entitlements.sql`, `063_payment_settings_category.sql`.

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/subscriptions/plans/route.ts:5` | plan catalog |
| `src/app/api/subscriptions/razorpay/order/route.ts:34` | order creation |
| `src/app/api/webhooks/stripe/route.ts:91` | Stripe events |
| `src/app/api/subscriptions/{checkout,checkout/verify,downgrade,expiry-sweep,portal,onboarding-status}` | lifecycle |
| `src/app/api/orgs/billing-history`, `/api/orgs/subscription` | tenant views |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/billing/core/health.ts` | `checkStripeGateway:23`, `checkRazorpayGateway:125` |
| `src/lib/subscription-notifications.ts` | `queueNotification:82`, `getOrgOwnerEmail:152`, `writeSubscriptionAudit:170`, `NotificationType:21` |

## 7. UI Reference

- `src/app/(platform)/pricing/page.tsx` — plan marketing; `src/app/(platform)/checkout/page.tsx` + `checkout/success/page.tsx` — checkout flow.
- `src/app/(admin)/orgs/[id]/billing/page.tsx` — tenant billing console; `src/app/(admin)/subscriptions/page.tsx` + `src/features/admin/screens/subscriptions-screen.tsx` — platform subscriptions view.
- `src/app/(admin)/settings/payments/page.tsx` — gateway configuration.

## 8. Environment Variables

- `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (see `.env.example` payments section); CSP allows `checkout.razorpay.com` (src/security/csp.ts).

## 9. Tests

- Subscription/notification suites, webhook signature tests, `scripts/e2e-plan-limits.js` (plan limit enforcement e2e).

## 10. Cross-links

- Entitlements gate **11 Catalog** selections and **24 Quotas**; onboarding gate — **03 Orgs**; expiry sweep scheduling — **25 Background Jobs**; revenue analytics — **20/22**.
