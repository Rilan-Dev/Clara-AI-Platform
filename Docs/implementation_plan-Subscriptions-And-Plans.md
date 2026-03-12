# Clara AI Platform — Subscriptions, Plans, Integrations & Docs Completion

Complete all incomplete visitor-facing pages, subscription management, payment gateway integrations (Stripe + Razorpay in test mode), documentation hub, signup flow, and production-ready analytics.

## Current State Summary

| Area | Status | What Exists |
|------|--------|-------------|
| **Landing page** | ✅ Complete | Hero, stats, features, pricing preview, testimonials, CTA |
| **Pricing page** | ✅ Complete | Billing toggle, plan cards from DB, FAQ accordion |
| **Features page** | ✅ Complete | 12 feature cards, plan comparison table |
| **Contact page** | ✅ Complete | Contact form, use cases, guarantees |
| **Docs page** | ❌ Dead `#` link | Nav points to `#`, no route or screen exists |
| **Privacy / Terms** | ❌ Dead `#` links | Footer links go nowhere |
| **Signup** | ❌ Missing | No `/signup` route, pricing CTAs go to `/pricing` |
| **Checkout / Payments** | ❌ Missing | Empty `checkout/` API dir, no Stripe/Razorpay code |
| **Webhooks** | ❌ Missing | No webhook handlers for payment events |
| **Billing History** | ❌ Missing | No invoices/events table or UI |
| **Analytics (Admin)** | ⚠️ Partial | KPI cards + plan dist work; health data hardcoded, no charts |
| **Analytics (Tenant)** | ⚠️ Stub | Defined in user-journey but not implemented |
| **Subscription CRUD** | ✅ Works | Plans API, org subscription upsert, admin plan switcher |
| **DB Schema** | ✅ Partial | `subscription_plans`, `org_subscriptions` with Stripe columns |

---

## User Review Required

> [!IMPORTANT]
> **Payment gateways will use TEST MODE keys only.** No real charges will occur. You will need to provide your own Stripe and Razorpay test API keys in [.env](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/.env) before testing checkout flows.

> [!IMPORTANT]
> **Phase ordering matters.** Phases 1–2 (Docs + Signup) are prerequisites for Phases 3–4 (Payments). Phase 5 (Analytics) and Phase 6 (Admin Enhancements) can be done in parallel.

> [!CAUTION]
> This is a **large** body of work (~40+ files). I recommend we implement **Phase by Phase** with verification between each phase. Please confirm if you want all phases implemented at once or one at a time.

---

## Proposed Changes

### Phase 1 — Documentation & Visitor Page Completion

Fills in the dead links in the visitor navigation and footer.

---

#### [NEW] [docs/page.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/(platform)/docs/page.tsx)
Route entry: `export { default } from "@/features/platform/screens/docs-screen";`

#### [NEW] [docs-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/docs-screen.tsx)
Full documentation hub page with sections:
- **Getting Started** — quick-start guide (create org → upload docs → embed)
- **API Reference** — all endpoints from the route map with method, URL, auth, body, response
- **Embed Guide** — iFrame snippet + JS loader code samples
- **SDK Reference** — code examples for `fetch`-based integration
- **Webhooks** — event types and payload schemas
- **FAQ** — developer-focused questions

#### [NEW] [privacy/page.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/(platform)/privacy/page.tsx)
Route entry for privacy policy page.

#### [NEW] [privacy-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/privacy-screen.tsx)
Standard privacy policy page with data handling, cookies, third-party services sections.

#### [NEW] [terms/page.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/(platform)/terms/page.tsx)
Route entry for terms of service page.

#### [NEW] [terms-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/terms-screen.tsx)
Standard terms of service page.

#### [MODIFY] [platform-shell.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/layouts/platform-shell.tsx)
- Change `Docs` nav link from `#` to `/docs`
- Change footer `Privacy` link from `#` to `/privacy`
- Change footer `Terms` link from `#` to `/terms`

#### [MODIFY] [index.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/index.ts)
Add exports for new screens: `docs-screen`, `privacy-screen`, `terms-screen`.

---

### Phase 2 — Signup & Onboarding Flow

Creates the user-facing signup flow that pricing CTAs link to.

---

#### [NEW] [signup/page.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/(platform)/signup/page.tsx)
Route entry for signup page.

#### [NEW] [signup-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/signup-screen.tsx)
Multi-step signup form:
1. **Step 1**: Org name, admin email, password
2. **Step 2**: Plan selection (pre-selected from `?plan=` query param)
3. **Step 3**: Confirmation + redirect to checkout (Phase 3) or dashboard

#### [NEW] [register/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/auth/register/route.ts)
`POST /api/auth/register` — creates organisation + admin user + assigns selected plan. Returns JWT.

#### [MODIFY] [pricing-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/pricing-screen.tsx)
Wire CTA buttons to `/signup?plan=xxx` instead of doing nothing.

#### [MODIFY] [landing-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/landing-screen.tsx)
Wire "Start free" CTAs to `/signup?plan=free`.

---

### Phase 3 — Stripe Integration (Test Mode)

Full Stripe checkout, webhooks, customer portal, and billing events.

---

#### [NEW] [stripe.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/stripe.ts)
Stripe SDK initialisation with `STRIPE_SECRET_KEY` from env. Price/product ID mapping utility.

#### [NEW] [009_billing_events.sql](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/db/migrations/009_billing_events.sql)
```sql
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- checkout.completed, invoice.paid, subscription.updated, etc.
  provider TEXT NOT NULL DEFAULT 'stripe', -- stripe | razorpay
  provider_event_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_events_org_id_idx ON billing_events(org_id);
```

#### [NEW] [checkout/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/checkout/route.ts)
`POST /api/subscriptions/checkout` — creates Stripe Checkout Session with plan price, trial period, and success/cancel URLs.

#### [NEW] [portal/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/portal/route.ts)
`GET /api/subscriptions/portal` — creates Stripe Customer Portal session for self-service billing management.

#### [NEW] [stripe/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/webhooks/stripe/route.ts)
`POST /api/webhooks/stripe` — handles events:
- `checkout.session.completed` → activate subscription
- `invoice.paid` → record billing event
- `customer.subscription.updated` → sync plan changes
- `customer.subscription.deleted` → cancel subscription

#### [NEW] [billing/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/billing/route.ts)
`GET /api/subscriptions/billing?orgId=xxx` — returns billing history from `billing_events` table.

#### [MODIFY] [.env.example](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/.env.example)
Add Stripe env vars:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_ENTERPRISE=price_xxx
```

---

### Phase 4 — Razorpay Integration (Test Mode)

Parallel payment gateway for Indian/international markets.

---

#### [NEW] [razorpay.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/razorpay.ts)
Razorpay SDK initialisation with `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` from env.

#### [NEW] [order/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/razorpay/order/route.ts)
`POST /api/subscriptions/razorpay/order` — creates Razorpay order for selected plan.

#### [NEW] [verify/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/razorpay/verify/route.ts)
`POST /api/subscriptions/razorpay/verify` — verifies payment signature and activates subscription.

#### [NEW] [razorpay/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/webhooks/razorpay/route.ts)
`POST /api/webhooks/razorpay` — handles `payment.captured`, `subscription.activated`, etc.

#### [NEW] [checkout-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/checkout-screen.tsx)
Checkout page with payment gateway selector (Stripe / Razorpay) → processes payment via selected gateway.

#### [NEW] [checkout/page.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/(platform)/checkout/page.tsx)
Route entry for checkout page.

#### [MODIFY] [.env.example](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/.env.example)
Add Razorpay env vars:
```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_STARTER=plan_xxx
RAZORPAY_PLAN_PRO=plan_xxx
```

---

### Phase 5 — Enhanced Analytics

Replace hardcoded data with real metrics and add interactive charts.

---

#### [NEW] [010_analytics_tables.sql](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/db/migrations/010_analytics_tables.sql)
```sql
CREATE TABLE IF NOT EXISTS analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  query_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  UNIQUE(org_id, date)
);
```

#### [NEW] [queries/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/analytics/queries/route.ts)
`GET /api/analytics/queries?orgId=xxx&range=7d|30d|90d` — returns time-series query volume data.

#### [NEW] [usage/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/analytics/usage/route.ts)
`GET /api/analytics/usage?orgId=xxx` — per-KB breakdown, top queries, usage against plan limits.

#### [NEW] [revenue-trend/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/analytics/revenue-trend/route.ts)
`GET /api/analytics/revenue-trend` — monthly revenue trend for admin charts.

#### [MODIFY] [analytics-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/admin/screens/analytics-screen.tsx)
Major enhancements:
- Add Recharts `LineChart` for query volume over time
- Add Recharts `BarChart` for revenue trend
- Replace hardcoded health values with real data from `/api/health`
- Add date range selector (7d / 30d / 90d)
- Add top queries table with frequency counts
- Add per-org usage breakdown table

---

### Phase 6 — Admin Subscription Enhancements

Production-ready subscription management in the admin panel.

---

#### [MODIFY] [subscriptions-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/admin/screens/subscriptions-screen.tsx)
Add:
- **Billing History tab** — shows `billing_events` for each org (date, type, amount, provider)
- **Subscription Actions** — cancel, pause (cancel_at_period_end), resume buttons per org
- **Trial Management** — badge showing trial days remaining, convert-to-paid button
- **MRR Trend** chart using Recharts

#### [MODIFY] [org-detail-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/admin/screens/org-detail-screen.tsx)
Add:
- Billing history section
- Stripe Customer ID display
- Link to Stripe Customer Portal
- Usage against plan limits progress bars

#### [NEW] [cancel/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/cancel/route.ts)
`POST /api/subscriptions/cancel` — sets `cancel_at_period_end = true`.

#### [NEW] [resume/route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/subscriptions/resume/route.ts)
`POST /api/subscriptions/resume` — unsets cancellation.

---

### Phase 7 — Verification & Testing

---

No new features; validation only.

---

## Verification Plan

### Automated Tests

1. **API Integration Tests** (Playwright `@playwright/test`):
   - Already have Playwright in `devDependencies`
   - Create `tests/api/subscriptions.spec.ts`:
     - `GET /api/subscriptions/plans` returns 4 plans
     - `PUT /api/orgs/subscription` changes plan
     - `GET /api/subscriptions/billing` returns array
     - `POST /api/subscriptions/checkout` returns session URL (mocked Stripe)
   - Create `tests/api/auth.spec.ts`:
     - `POST /api/auth/register` creates org + user
   - Create `tests/api/analytics.spec.ts`:
     - `GET /api/analytics/queries` returns time-series data
   - Run: `npx playwright test tests/api/`

2. **Stripe Webhook Mock Tests**:
   - Create `tests/webhooks/stripe.spec.ts`
   - Uses Stripe's test webhook signing to verify event handling
   - Run: `npx playwright test tests/webhooks/`

3. **Browser E2E Tests** (Playwright):
   - Create `tests/e2e/visitor-pages.spec.ts`:
     - Landing page loads, nav links work
     - Pricing page shows plans from API
     - Docs page renders API reference
     - Signup flow reaches confirmation
   - Run: `npx playwright test tests/e2e/`

### Manual Verification

1. **Visitor Pages**: Navigate to `/`, `/features`, `/pricing`, `/docs`, `/privacy`, `/terms` — all should load with no dead links
2. **Signup Flow**: Click "Get started" on pricing → pre-selects plan → fill form → submits
3. **Stripe Checkout**: After signup, click "Upgrade" → redirects to Stripe test checkout. Use Stripe test card `4242 4242 4242 4242` → returns to success page
4. **Razorpay Checkout**: Select Razorpay gateway → opens Razorpay test modal → completes with test card
5. **Admin Analytics**: Login at `/admin/login` → `/analytics` → charts render with real data, date range filter works
6. **Admin Subscriptions**: `/subscriptions` → billing history shows events, cancel/resume buttons work
