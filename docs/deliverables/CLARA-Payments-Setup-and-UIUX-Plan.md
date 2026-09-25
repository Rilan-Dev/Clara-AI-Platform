# Clara AI — Payment Gateways Setup Guide & Professional UI/UX Plan

> **Bundle:** `clara-payments-setup-and-uiux-plan.md` · created 2026-09-25
> **Scope:** (A) review of the latest code (189 commits, `a0071cc..48764c0`), (B) step-by-step setup of the **two payment gateways — Stripe (USD, international) + Razorpay (INR, India)**, and (C) a professional payment-flow UI/UX plan built with the **UI/UX Pro Max** design-intelligence methodology (79 styles / 192 palettes / 119 UX guidelines), matched to Clara's existing indigo→violet theme.
> **Design stance:** conversion-optimized + trust-first. No gimmicks, no decoration for decoration's sake. Every element earns its place.

---

## Part A — Code review: what landed in the latest pull

### A.1 Overview

`git pull` brought **189 commits** (PRs ~#157–#206), 202 files changed, +6,321/−7,946. Category breakdown: 50 fixes, 36 PR merges, 12 features, 10 test additions, 6 perf, plus realtime-voice hardening work.

### A.2 Payment-relevant changes (the important ones for this task)

| Change | File | Verdict |
|---|---|---|
| **Shared Stripe activation module** (NEW, 184 lines) | `src/lib/stripe-activation.ts` | ✅ Excellent. One activation path used by both the webhook and the success-page verify — they can never disagree. Handles Stripe API-version drift (billing period moved to subscription items after 2025-03-31; invoice subscription moved under `parent.subscription_details`). Idempotent. |
| **Verify-on-return endpoint** (NEW) | `src/app/api/subscriptions/checkout/verify/route.ts` | ✅ Solid. A paid customer is never stuck on "payment pending" when a webhook is misrouted/delayed. Membership check + `cs_(test\|live)_` format validation + orgId metadata binding — payment state read from Stripe, never the client. |
| **Stripe webhook slimmed** | `src/app/api/webhooks/stripe/route.ts` (−120 lines) | ✅ Good refactor — activation logic moved to the shared module. |
| **Success page calls verify** | `checkout-success-screen.tsx` | ✅ Non-blocking by design; falls back to status polling. |
| **Activation tests** (NEW, 82 lines) | `src/lib/__tests__/stripe-activation.test.ts` | ✅ Covers the API-version tolerance paths. |
| **Admin Payment Gateway panel** | `src/components/admin/PaymentGatewayPanel.tsx` | ✅ Well-built: field-level help text, masked secrets, single-save, webhook registration hints, live-effect without restart. |

**One small gap worth noting:** the Razorpay Checkout modal theme is `#6366f1` (indigo-500) while Clara's button-primary is `#4F46E5` (indigo-600) — a 1-tone mismatch. Trivial fix, included in the UI/UX plan (C.4).

### A.3 Non-payment changes (context)

- **Realtime voice hardening** (the bulk): ElevenLabs websocket sessions persisted across upstream closes/turns, Vercel function duration capped at 300s, realtime speech turns pinned to the configured chat model, TTS inactivity timeout tested.
- **RAG fallback fixes**: natural conversation when retrieval has no match (replaced generic fallbacks).
- **Workspace link guards**: agent workspace links guarded during context hydration.
- **CSP**: Vercel preview toolbar iframe allowed.
- **DB**: apostrophe escaping in assistant-defaults migration.
- A 713-line UI/UX revamp plan doc (`docs/superpowers/plans/2026-09-24-clara-elevenlabs-adaptive-uiux.md`) landed — consistent with the sidebar/topbar work already reviewed.

**Overall verdict:** the payments codebase is in good shape to configure and go live. The dual-activation design (webhook + verify-on-return) is exactly how Stripe themselves recommend building it.

---

## Part B — Setting up the two payments

Clara supports **Stripe** (USD — international cards, Apple Pay, Google Pay) and **Razorpay** (INR — UPI, net banking, cards, wallets, EMI). Both are already wired end-to-end in code; setup is configuration work in the two dashboards + Clara's admin panel.

### B.0 Current flow (what you're configuring)

```
Pricing page → /checkout?plan=X&orgId=Y
  ├─ Stripe:   POST /api/subscriptions/checkout → Stripe hosted page → /checkout/success
  │            webhook /api/webhooks/stripe  +  verify-on-return (dual activation)
  └─ Razorpay: POST /api/subscriptions/razorpay/order → Razorpay modal (Checkout.js)
               → POST /api/subscriptions/razorpay/verify (HMAC signature check)
               webhook /api/webhooks/razorpay (payment.captured, subscription.*)
```

### B.1 Stripe setup (USD — international customers)

**Step 1 — Account & keys**
1. Create/verify your account at dashboard.stripe.com (activate it for live mode when ready).
2. Copy the **Secret Key** (`sk_live_…` / `sk_test_…`) from Developers → API Keys.

**Step 2 — Create the two recurring Prices**
In Product catalog → Add product (e.g. "Clara AI Platform"), add two recurring monthly prices:
- Starter — **$49.00 / month** → copy `price_…` ID
- Pro — **$149.00 / month** → copy `price_…` ID

> If you leave the price IDs blank in Clara, checkout falls back to ad-hoc inline pricing — creating proper Price IDs is still recommended (cleaner reporting, easier plan changes).

**Step 3 — Register the webhook**
Developers → Webhooks → Add endpoint:
- **URL:** `https://<your-domain>/api/webhooks/stripe`
- **Events (minimum set):** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Copy the **Signing Secret** (`whsec_…`).
- ⚠️ Register it against your **live domain** (the same one customers use). The verify-on-return path covers you if a webhook is late, but the webhook is the primary activation path.

**Step 4 — Enable payment methods**
Settings → Payment methods: Cards, Apple Pay, Google Pay, Link (Stripe-hosted checkout shows these automatically per the customer's browser/device).

**Step 5 — Configure in Clara**
Admin → Settings → **Payment Gateway** panel → Stripe tab:
- Secret Key, Webhook Secret, Starter Price ID, Pro Price ID → **Save** (takes effect immediately, no restart).

**Step 6 — Test before going live**
- Use test keys (`sk_test_…`) + the test card **4242 4242 4242 4242**, any future expiry, any CVC.
- Verify: checkout completes → `/checkout/success` shows active → subscription row active in DB → webhook received (Developers → Webhooks → delivery log).
- Test a failing card (4000 0000 0000 0002) → expect graceful error handling.

**Step 7 — Go live**
Swap to live keys + live webhook secret in the same panel. (Live and test modes have separate keys AND separate webhook endpoints — register the webhook again in live mode.)

### B.2 Razorpay setup (INR — India customers)

**Step 1 — Account & KYC**
1. Create the account at dashboard.razorpay.com; complete **KYC** (business details + bank account) — required for live settlements.
2. Settings → API Keys → Generate Test Key → copy `rzp_test_…` + secret.

**Step 2 — Register the webhook**
Settings → Webhooks → Active Webhooks → Add New Webhook:
- **URL:** `https://<your-domain>/api/webhooks/razorpay`
- **Events:** `payment.captured`, `payment.failed`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`
- Set the **Secret** — copy it (this is `RAZORPAY_WEBHOOK_SECRET`, used for the HMAC-SHA256 signature check over the raw body).
- Razorpay sends a "test" ping on save — the endpoint ignores unknown events safely.

**Step 3 — Enable payment methods**
Settings → Payment methods: UPI, Cards, Net Banking, Wallets, EMI — enable what you want visible in the modal.

**Step 4 — Configure in Clara**
Admin → Settings → Payment Gateway panel → Razorpay tab (4 fields):
- Key ID (`rzp_test_…` / `rzp_live_…`)
- Key Secret (server-side only, never exposed to browser)
- **Public Key ID (Browser)** — `NEXT_PUBLIC_RAZORPAY_KEY_ID`, same Key ID value, passed to the Checkout.js modal
- Webhook Secret
- Also set the **General** tab → Public Application URL (`https://<your-domain>`) — Stripe redirects and all email links are built from it.

**Step 5 — Test**
- Test mode: UPI test VPA `success@razorpay`, or test card 4111 1111 1111 1111.
- Verify: order created (`/api/subscriptions/razorpay/order`) → modal opens → payment captured → verify passes (signature check) → `/checkout/success` → webhook `payment.captured` activates + emails receipt.

**Step 6 — Go live**
Generate live keys after KYC approval; swap all four values in the panel.

### B.3 Amounts & plan mapping (already in code)

| Plan | Stripe (USD) | Razorpay (INR) |
|---|---|---|
| Starter | $49/mo | ₹4,000/mo (400000 paise) |
| Pro | $149/mo | ₹12,000/mo (1200000 paise) |

### B.4 Setup checklist (print this)

```
STRIPE
[ ] sk_… secret key in panel
[ ] Two recurring Price IDs created and filled (starter + pro)
[ ] Webhook registered on live domain → whsec_ in panel
[ ] Events: checkout.session.completed, subscription.updated/deleted, invoice.paid/payment_failed
[ ] Payment methods enabled (cards/Apple Pay/Google Pay)
[ ] Test payment with 4242… succeeded + activation verified
[ ] Live keys swapped when ready

RAZORPAY
[ ] KYC completed
[ ] Key ID + Key Secret in panel
[ ] NEXT_PUBLIC_RAZORPAY_KEY_ID filled (same Key ID)
[ ] Webhook registered → secret in panel
[ ] Events: payment.captured/failed, subscription.charged/cancelled/halted
[ ] Test UPI/card payment succeeded + signature verified
[ ] Live keys swapped after KYC

GENERAL
[ ] NEXT_PUBLIC_APP_URL set to the public domain
[ ] Both gateway flows tested end-to-end on the preview deployment
```

---

## Part C — Professional payment UI/UX plan

### C.0 Methodology (UI/UX Pro Max applied)

Queried the skill's design intelligence for the relevant product categories:

| Skill rule source | Guidance applied |
|---|---|
| `ui-reasoning.csv` → **Invoice & Billing Tool** | Pattern: **Conversion-Optimized + Trust**. Style: **Minimalism & Swiss Style + Flat Design**. Color: professional base + paid-green + overdue-red + neutral grey. Fast 150ms transitions, **no complex shadows / 3D / excessive decoration**. |
| `ui-reasoning.csv` → **SaaS (General)** | Trust blue/indigo + accent contrast; subtle hover 200–250ms; professional typography hierarchy. |
| `ux-guidelines.csv` priorities 1–10 | P1 Accessibility (4.5:1 contrast, keyboard, ARIA) · P2 Touch (≥44px targets, loading feedback) · P5 responsive (no horizontal scroll) · P8 Forms (visible labels, errors near field) — payment screens are exactly where these get audited by customers. |
| Anti-patterns to avoid | Mixing flat & skeuomorphic randomly; emoji as icons; hidden earnings/pricing; no transaction status; overwhelming decoration. |

**Theme match (Clara today):** primary indigo-600 `#4F46E5`, secondary violet-500 `#8B5CF6`, semantic HSL tokens (`--primary`, `--card`, `--muted-foreground`, emerald for success), shadcn/ui + Tailwind, light + dark parity. The plan below **stays inside this system** — no new palette, no new fonts, no new component library. That is the whole point: Clara already has a clean, professional design language; the payment flow should look like the same product, not a different shop.

### C.1 Design principles for Clara payments (non-negotiable)

1. **One decision per screen.** Pricing = compare plans. Checkout = confirm plan + choose gateway. Success = reassure + next step. Nothing else competes for attention.
2. **Trust is cumulative.** Logo, plan facts, price, security signals, and a gateway-branded button must all be visible **above the fold** on mobile (max-w-md single column — already correct in the code).
3. **Semantic color only.** Primary indigo = action. Emerald = confirmed/paid. Amber = attention. Destructive red = failure. Never use color as the *only* signal (pair with icon + text).
4. **Motion is feedback, not decoration.** 150–250ms ease-out for hover/selection; one check-draw animation on success; spinner + descriptive text for waits. Nothing else animates on a payment screen.
5. **Dark mode parity.** All payment screens already use semantic tokens (`bg-card`, `text-foreground`) — keep it that way; verify contrast in both modes.
6. **Accessibility = conversion.** Keyboard-reachable gateway cards (radio semantics), 44px targets, focus rings preserved, labels on everything.

### C.2 Screen-by-screen plan

#### 1. Pricing page (`/pricing`) — the entry

Current state: solid plan cards (name, price, quota rows, feature list, CTA). Improvements:

| # | Improvement | Why (skill rule) |
|---|---|---|
| P1 | Show **both currencies** compactly on each card: `$49/mo · ₹4,000/mo` (muted second currency) | Customers shouldn't discover INR pricing at checkout — pricing transparency is a trust signal |
| P2 | Keep "Most Popular" badge (primary pill) on Pro — correct pattern | Social-proof/conversion cue |
| P3 | CTA per plan → `/checkout?plan=X` directly for logged-in orgs; `/signup?plan=X` otherwise (current behavior is correct — keep) | Predictable funnel |
| P4 | Quota rows (KBs/docs/requests) rendered as label→value pairs — current pattern is good; align numerals right (already done) | Swiss-style scannable data |
| P5 | FAQ micro-section below plans: "Can I pay in INR?", "Cancel anytime?", "What happens to my data?" | Reduces pre-checkout anxiety (conversion) |

#### 2. Checkout page (`/checkout`) — the conversion point

Current state is already close to right: single column max-w-md, plan summary card with feature chips, 2-card gateway selector, trust strip, gateway-colored button. Upgrades (ordered by impact):

| # | Improvement | Detail |
|---|---|---|
| C1 | **Geo-aware default gateway**: default Razorpay for `en-IN` browsers, Stripe otherwise — manual override stays. One `useEffect` on `navigator.language`. | Customers land on their natural gateway; fewer switches |
| C2 | **Radio semantics on the gateway selector**: wrap in `role="radiogroup"`, each card `role="radio" aria-checked`, arrow-key navigation, 44px min height. Currently they're plain buttons — works with mouse, fails keyboard audit. | Accessibility P1 |
| C3 | **Price block restructure**: big numeral (text-2xl font-black) + `/month` suffix on the same baseline; currency code as muted prefix (`USD` / `INR`); below it a single line "Billed today · renews monthly · cancel anytime". | Removes the current "billed now" ambiguity |
| C4 | **GST line for INR** (when you register GST): `Price ₹4,000 · GST (18%) ₹720 · Total ₹4,720` — only if Clara charges tax-inclusive/exclusive. Even without GST, show `Total ₹4,000` as the final line. | Indian customers expect a total line; prevents abandonment |
| C5 | **Trust strip above the CTA** (currently below selector — fine) + add "256-bit TLS" text and keep PCI badges textual (no fake logo images). | Trust placement |
| C6 | **Button**: keep gateway-colored fill (Stripe = primary indigo, Razorpay = cyan-600 is currently used — **change Razorpay to primary indigo too**; gateway identity is already carried by the card selection + label text. One action color = one visual system). Add the gateway name + amount on the button: `Pay $49 with Stripe` / `Pay ₹4,000 with Razorpay`. | Amount-on-button is a top conversion + error-prevention pattern |
| C7 | **Loading state**: spinner + "Contacting Stripe… / Opening Razorpay…" + disable + "Don't refresh or press back". | P2 loading feedback |
| C8 | **Error pattern**: inline red callout near the CTA (current pattern is correct) + auto-dismiss stale errors on retry. | Errors near the action |
| C9 | Razorpay modal **`theme.color: "#4F46E5"`** (currently `#6366F1`) + `name: "Clara AI Platform"` + same description as plan card. | Brand continuity through the modal |

#### 3. Success page (`/checkout/success`) — the reassurance

| # | Improvement | Detail |
|---|---|---|
| S1 | Single emerald check with one 400ms draw-in animation (reduced-motion safe) — current CheckCircle2 static icon is fine; a subtle scale-in is the only motion needed | Celebration without cheese |
| S2 | **Receipt card**: Plan · Amount (with currency) · Gateway · Date · Transaction ref (Stripe `session_id` short form / Razorpay `payment_id`) · Renewal date | Receipts reduce chargebacks and support tickets |
| S3 | Next-steps block: (1) verify email (existing, good) (2) "Go to dashboard" primary CTA (3) "Email myself a receipt" if available | Guide the exit |
| S4 | Keep the verify-on-return call as-is (non-blocking) — it's invisible and resilient by design | Already correct |

#### 4. Admin — Payment Gateway panel (settings)

Already the best-built settings panel in the codebase (field help, masked secrets, single save, webhook hints). Additions:

| # | Improvement | Detail |
|---|---|---|
| A1 | **Configuration status badges** per gateway: `Not configured` (grey) / `Test mode` (amber, `sk_test_`/`rzp_test_` prefix detection) / `Live` (emerald) | Operators see state at a glance |
| A2 | **"Test connection" button** per gateway: server-side ping (Stripe: retrieve own account; Razorpay: fetch a payment or the key's validity) → green check or the real error | Catches typos before a customer does |
| A3 | **Webhook health hint**: show "last event received" timestamp if the platform already logs webhook deliveries | The #1 silent payment failure is a dead webhook |
| A4 | Keep the existing single-save + masked-secrets pattern exactly as is | Already correct |

#### 5. Org billing screen (admin → billing)

Keep: plan badge, status, renewal, portal link. Add: payment method label ("Visa •••• 4242 via Stripe" / "UPI via Razorpay") and a "Manage payment" button routing to the Stripe portal or Razorpay subscription link. Consistency with A-series: status chips semantic-colored.

### C.3 What NOT to do (anti-patterns, per the skill)

- ❌ Dark-mode-only payment pages or heavy glassmorphism/neon on checkout — trust reads better on the clean light card system Clara already has.
- ❌ Countdown timers / fake urgency on a B2B SaaS checkout ("only 2 left!") — erodes trust; the skill flags urgency colors as e-commerce-only.
- ❌ Embedding card fields yourself — both flows are already gateway-hosted (Stripe hosted page / Razorpay modal). Keep PCI scope minimal. This is a strength of the current code.
- ❌ Two different button colors for the two gateways on the same screen (current cyan/indigo split) — pick one action color.
- ❌ Emoji as icons — stay on lucide SVGs (current code is already correct).
- ❌ Animating anything other than hover/selection states and the success check.

### C.4 Implementation order (smallest diff → biggest win)

1. `C6+C9` — unify action color, amount-on-button, Razorpay modal theme/name (≈15 lines)
2. `C1` — geo-aware gateway default (≈6 lines)
3. `C2` — radio-group accessibility on the selector (≈20 lines)
4. `C3+C4` — price/total block restructure (≈30 lines)
5. `P1` — dual currency on pricing cards (≈10 lines)
6. `S2` — receipt card on success (≈40 lines)
7. `A1+A2` — status badges + test-connection in the admin panel (server + client, ≈120 lines)

Each step is independently shippable, matches the current theme exactly, and needs no new dependencies.

---

## Appendix — Skill provenance

- UI/UX Pro Max v2.13.0 (github.com/nextlevelbuilder/ui-ux-pro-max-skill) — design-intelligence queries used: `ui-reasoning.csv` rows "Invoice & Billing Tool", "SaaS (General)", "E-commerce", "Subscription Box Service"; `ux-guidelines.csv` priority table (Accessibility → Charts); style taxonomy (Minimalism & Swiss Style, Flat Design). Clara's existing theme (indigo→violet, shadcn semantic tokens, light/dark parity) is the binding constraint throughout.
