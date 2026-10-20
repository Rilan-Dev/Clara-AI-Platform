# 28 — Public Website & Growth (Landing, Signup, Pricing, Checkout, Contact, Docs Portal)

> Clara AI Platform feature documentation · Domain: `src/features/platform/` + `src/app/(platform)/` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The public face of Clara AI: everything an anonymous visitor or a prospective customer touches before (and right after) becoming a tenant. This covers the marketing landing page (hero, live chat demo, live voice demo, features, pricing sections), the signup funnel (795-line signup screen + email verification), the plan pricing page, the checkout flow (Stripe + Razorpay gateways with geo-aware default), checkout success, the "Request a demo" contact form (lead capture → support inbox), the in-app developer docs portal (`/docs` with API reference, getting-started guide and React SDK guide), and the legal pages (privacy, terms). Its purpose is acquisition and activation: turn visitors into verified, subscribed tenants, and give developers everything they need to embed Clara.

## 2. Business Logic

- **Landing page** — `landing-screen.tsx:103` (`src/features/platform/screens/`): animated marketing sections; hero CTA → `/signup?plan=free` (`:163`); an inline grounded-chat demo with sample citations (`:202`); the lazy-loaded live voice demo (`DemoVoiceSection` `:13`); pricing section (`:309`); the floating assistant FAB (`src/features/platform/components/DemoAssistantFAB.tsx`, Feature 13).
- **Signup funnel** — `signup-screen.tsx:97`: multi-step registration → `POST /api/auth/register` (`:188`); on success checks `/api/auth/me` for `emailVerified` (`:236`) and routes unverified users to the verify step; `POST /api/auth/resend-verification` (`:299`); `signup-verify-screen.tsx:13` confirms email verification (token flow from Feature 01). Plan is carried via `?plan=` query.
- **Pricing page** — `pricing-screen.tsx:41`: loads live plan catalog via `GET /api/subscriptions/plans` (`:51`); renders per-plan pricing with CTA into `/signup?plan=<id>`; curated empty/error states (`:84-87`).
- **Checkout** — `checkout-screen.tsx` (doc `:12-18`): Stripe path `POST /api/subscriptions/checkout` → `{ url }` redirect; Razorpay path `POST /api/subscriptions/razorpay/order` → Razorpay Checkout.js (`:97`) → `POST /api/subscriptions/razorpay/verify` → `/checkout/success`; gateway defaults to Razorpay when the visitor looks up from India (`isIndia` `:89`); INR/USD currency rendering per gateway (`:55`). `checkout-success-screen.tsx:42` completes the funnel.
- **Contact / Request a demo** — `contact-screen.tsx:13` + `src/lib/contact.ts`: `parseContactLead:43` validates/cleans the lead (name/email/company/plan/message, length-capped); `postContact:74` rate-limits per IP (`CONTACT_RATE:15` — 5/hour), renders the email via `renderContactEmail:58` (HTML-escaped, `escapeHtml` `:28`) and delivers through the platform email provider to `CLARA_SUPPORT_EMAIL`; the visitor sees success only when delivery actually succeeded (the old fake-success behaviour was deliberately removed — file doc `:5-8`).
- **Docs portal** — `/docs` (`docs-screen.tsx:59`), `/docs/api-reference` (`docs-api-screen.tsx:111`), `/docs/getting-started` (`docs-getting-started-screen.tsx:68`), `/docs/sdk` (`docs-sdk-screen.tsx:34`, includes `@clara-ai/react` usage examples with `CodeBlock` `:126`). Pages under `src/app/(platform)/docs/` re-export these screens.
- **Legal** — `privacy-screen.tsx:43`, `terms-screen.tsx:51`.
- **Platform layout** — `src/app/(platform)/layout.tsx` shared shell; `src/app/(platform)/page.tsx` re-exports the landing screen.

## 3. Business Rules

- Success honesty: the contact form only reports success after real email delivery (no fake success); all fields are length-capped and HTML-escaped (injection-safe email body).
- Contact is rate-limited per IP (5/hour) to prevent inbox flooding; plan values are constrained to the known set (`starter|pro|enterprise`, `PLANS` `:17`).
- Checkout currency/gateway is geo-aware but user-overridable; payment verification is server-side (Razorpay signature verify) — the client never marks a subscription active by itself.
- Pricing is always rendered from the LIVE plan catalog (never hardcoded), so plan changes in Feature 22 propagate instantly.
- Signup requires email verification before feature access (ties into the onboarding gate, Feature 30).
- The docs portal documents the public embed/chat APIs only — no internal surface is exposed.

## 4. Data Model

- Users/email-verification tokens (Feature 01, migrations `048`, `049`); subscriptions/checkout objects (Feature 17); platform email (Feature 18); announcements (Feature 22) may surface on public surfaces via the notification center.

## 5. API Surface

| Route | Role |
|---|---|
| `src/app/api/contact/route.ts` | `postContact` (lead capture) |
| `src/app/api/auth/register` / `resend-verification` / `verify-email` | signup funnel (Feature 01) |
| `src/app/api/subscriptions/plans` | live plan catalog for pricing |
| `src/app/api/subscriptions/checkout` | Stripe checkout session |
| `src/app/api/subscriptions/razorpay/order` / `verify` | Razorpay order + verify |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/features/platform/screens/landing-screen.tsx` | `LandingPage:103` |
| `src/features/platform/screens/signup-screen.tsx` | `SignupScreen:97` |
| `src/features/platform/screens/signup-verify-screen.tsx` | `SignupVerifyScreen:13` |
| `src/features/platform/screens/pricing-screen.tsx` | `PricingPage:41` |
| `src/features/platform/screens/checkout-screen.tsx` | `CheckoutScreen:70` |
| `src/features/platform/screens/checkout-success-screen.tsx` | `CheckoutSuccessScreen:42` |
| `src/features/platform/screens/contact-screen.tsx` | `ContactPage:13` |
| `src/features/platform/screens/docs-screen.tsx` (+ api/getting-started/sdk) | `DocsScreen:59`, `DocsApiScreen:111`, `DocsGettingStartedScreen:68`, `DocsSdkScreen:34` |
| `src/features/platform/screens/privacy-screen.tsx` / `terms-screen.tsx` | `PrivacyScreen:43`, `TermsScreen:51` |
| `src/lib/contact.ts` | `CONTACT_RATE:15`, `ContactLead:20`, `parseContactLead:43`, `renderContactEmail:58`, `postContact:74` |

## 7. UI Reference

- All screens above; live demos: `src/features/platform/components/DemoAssistantFAB.tsx`, `DemoVoiceSection.tsx` (+ test), `InteractiveGradientBackground.tsx`; embed demo frames: `src/features/embed/components/DemoWebsiteFrame.tsx` (+ test), `LandingEmbedFrame.tsx`; page routes under `src/app/(platform)/{page,signup,pricing,checkout,contact,docs,features,privacy,terms,workspace,ingest}`.

## 8. Environment Variables

- `CLARA_SUPPORT_EMAIL` (contact inbox); Stripe keys + Razorpay keys (Feature 17); app URL/public origin (Feature 26); demo-config env (Feature 13/22).

## 9. Tests

- `src/features/platform/components/DemoVoiceSection.test.tsx`, `src/features/embed/components/DemoWebsiteFrame.test.ts`, `src/components/ui/layout-primitives.test.ts` (contact/pricing layout primitives); checkout/contact server paths covered by their route/module suites (Features 01/17/18).

## 10. Cross-links

- Signup → **01 Authentication** (register/verify), **30 Workspace & Onboarding** (gate/reminders).
- Pricing/checkout → **17 Payments & Subscriptions**; plan catalog admin in **22**.
- Contact delivery → **18 Platform Email System**.
- Landing demos → **13 Embeddable Widget** (demo mode, FAB); voice demo → **14/15**.
