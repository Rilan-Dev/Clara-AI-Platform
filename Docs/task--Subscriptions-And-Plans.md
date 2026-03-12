# Clara Platform — Subscriptions, Plans, Integrations & Docs Completion

## Phase 1: Documentation & Visitor Page Completion
- [ ] Complete the `/docs` page (currently dead `#` link in nav)
- [ ] Create API documentation page with endpoint reference
- [ ] Create getting-started guide page
- [ ] Create SDK/integration guide page
- [ ] Update `platform-shell.tsx` nav to link `/docs` correctly
- [ ] Add privacy policy & terms of service pages (footer links are dead `#`)

## Phase 2: Signup & Onboarding Flow
- [ ] Create `/signup` page with plan pre-selection (`?plan=free|starter|pro`)
- [ ] Create `POST /api/auth/register` org-level signup API route  
- [ ] Wire pricing page CTA buttons to `/signup?plan=xxx`
- [ ] Add email verification placeholder flow

## Phase 3: Stripe Integration (Test Mode)
- [ ] Install `stripe` npm package
- [ ] Create Stripe products/prices mapping utility
- [ ] Create `POST /api/subscriptions/checkout` — Stripe Checkout Session creation
- [ ] Create `POST /api/webhooks/stripe` — Stripe webhook handler
- [ ] Create `GET /api/subscriptions/portal` — Stripe Customer Portal session
- [ ] Add billing history table & `billing_events` DB migration
- [ ] Update org subscription flow to use Stripe checkout
- [ ] Add Stripe test keys to `.env.example`

## Phase 4: Razorpay Integration (Test Mode)
- [ ] Install `razorpay` npm package
- [ ] Create `POST /api/subscriptions/razorpay/order` — Razorpay order creation
- [ ] Create `POST /api/webhooks/razorpay` — Razorpay webhook handler
- [ ] Create `GET /api/subscriptions/razorpay/verify` — payment verification
- [ ] Add payment gateway selector (Stripe vs Razorpay) to checkout flow
- [ ] Support INR pricing alongside USD

## Phase 5: Enhanced Analytics
- [ ] Create `009_analytics_events.sql` migration for analytics tables
- [ ] Create `GET /api/analytics/queries` — time-series query data API
- [ ] Create `GET /api/analytics/revenue` — revenue trend charts API
- [ ] Create `GET /api/analytics/usage` — per-org usage breakdown API
- [ ] Replace hardcoded platform health with real `/api/health` data
- [ ] Add Recharts-based interactive charts to analytics screen
- [ ] Add date range filtering to analytics
- [ ] Add top queries analysis with frequency tracking

## Phase 6: Admin Subscription Enhancements
- [ ] Add billing history/invoices view to admin subscriptions screen
- [ ] Add subscription status management (cancel, pause, resume)
- [ ] Add trial management (convert trial, extend trial)
- [ ] Add subscription event audit logging
- [ ] Add email notification placeholders for subscription events

## Phase 7: Verification & Testing
- [ ] Create Playwright E2E tests for visitor pages
- [ ] Create API integration tests for subscription endpoints
- [ ] Create Stripe webhook handler tests (mock)
- [ ] Verify full signup → checkout → subscription flow
- [ ] Create walkthrough document
