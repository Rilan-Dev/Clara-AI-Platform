# 30 — Workspace & Onboarding (Guided Setup, Onboarding Gate, Reminders, Notification Center)

> Clara AI Platform feature documentation · Domain: `src/features/workspace/` + `src/modules/organisations/core/workspace.ts` + org onboarding surfaces · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The activation feature set that takes a new tenant from "just signed up" to "successfully using Clara": the platform-admin Workspace Wizard (creates org + admin user + subscription + agent + KB + API key in ONE transactional call), the self-serve signup → verify → subscribe path (Feature 28 funnel), the onboarding gate that blocks feature access until email is verified and the plan is active, the org-user workspace page (daily chat home with KB selection + voice), the workspace ingest page, the onboarding reminder emails (cron), and the org Notification Center + status banner that surface what's blocking activation. Its purpose is activation rate: every blocker (unverified email, pending payment, activation review) is visible, actionable and reminded — never a silent dead end.

## 2. Business Logic

- **Workspace Wizard (admin)** — `src/components/admin/WorkspaceWizard.tsx` (doc `:5-14`): guided 3-phase flow (form → creating → done) for platform admins; creates organisation, admin user, subscription (pinned plan version), agent, knowledge base and API key in one transactional call via `useCreateWorkspace` (admin-ui hooks); optionally points the public landing demo at the new workspace; done-phase shows copyable credentials. Backed by `POST /api/platform/workspaces` → `createWorkspace` (`src/modules/organisations/core/workspace.ts:112`; validation failures `WorkspaceValidationError:97`), guarded by `requireSuperAdmin` (route `:10-13`).
- **Onboarding gate** — `src/features/workspace/components/onboarding-gate.tsx` (type `Status` `:7`): wraps the workspace screen; blocks feature access until `emailVerified` + `featureAccess` + healthy `onboarding` (plan enabled, payment status, activation review reason when present); renders the matching step (verify email / payment / review) with CTAs.
- **Org workspace page** — `src/features/workspace/screens/workspace-screen.tsx` (`/workspace`, `src/app/(platform)/workspace/page.tsx`): the org user's daily chat home — `ChatWindow` + `KbSelectorPanel` (chips on mobile, side panel on lg+), voice modal (dynamic import), greeting intro resolution (`overviewFor(...)?.voiceIntro` `:22`), all inside `OnboardingGate`.
- **Workspace ingest page** — `src/features/workspace/screens/ingest-screen.tsx` (`/ingest`): thin wrapper around `AdminIngestWorkspace` (Feature 06/07 ingest + web-sources UI) for org users.
- **Onboarding reminders (cron)** — `src/app/api/cron/onboarding-reminders/route.ts:18` (GET, `CRON_SECRET`-authorized `:13-16`): selects orgs with pending onboarding (`DISTINCT ON (os.org_id)` join over org_subscriptions/organisations/users `:35`), re-mints email-verification tokens (`createEmailVerificationToken`) and sends reminder emails via the platform email system with a public-origin verify link; scheduled daily (`vercel.json` `30 18 * * *`); also runs on self-hosted via local-cron (Feature 25/26).
- **Notification Center** — `src/components/admin/OrganizationNotificationCenter.tsx` (props `{ orgId }`): bell UI aggregating platform announcements (`GET /api/platform/announcements`, Feature 22) + org onboarding status (`GET /api/orgs/[orgId]/onboarding-status`, `:38-39`); severity-tagged notices with optional action links; dismissal persisted client-side (`clara:org-notification-dismissed:` prefix `:26`); pairs with `OrganizationStatusBanner.tsx` for persistent state display.
- **Onboarding status API** — `/api/orgs/[orgId]/onboarding-status`: server-side gate status (email verified, feature access, plan/payment/activation-review detail) — the single source the gate and center both consume.

## 3. Business Rules

- The wizard's creation is transactional: org/admin/subscription/agent/KB/API-key either ALL succeed or nothing persists (no half-provisioned tenants).
- Wizard plans are pinned to a plan VERSION at creation time (later plan edits never silently change existing tenants — Feature 17 rule).
- Feature access is gated client- AND server-side: the gate is UX; every underlying API independently enforces verification/plan/entitlement checks (Features 01/17/24) — the gate cannot be bypassed by hiding it.
- Reminders are idempotent per verification token lifecycle and only sent while onboarding is genuinely incomplete; cron requires `CRON_SECRET` (401 otherwise).
- Notification center dismissal is per-user client state — platform-critical announcements remain re-surfaceable; action links route to the exact remediation step (verify/pay/review).
- Onboarding status never leaks cross-org (org-scoped route, Feature 02/03 authorization).

## 4. Data Model

- Organisations/users/org_subscriptions + plan versions (Features 03/17, migrations `001/006/050`); email-verification tokens (`048_email_verification.sql`, Feature 01); platform announcements (`052`, Feature 22); billing onboarding gate (`050_billing_onboarding_gate.sql`).

## 5. API Surface

| Route | Role |
|---|---|
| `src/app/api/platform/workspaces/route.ts` | `POST` — transactional workspace provisioning (super-admin) |
| `src/app/api/orgs/[orgId]/onboarding-status/route.ts` | gate status (org-scoped) |
| `src/app/api/cron/onboarding-reminders/route.ts` | reminder emails (CRON_SECRET) |
| `src/app/api/platform/announcements` | notices source (Feature 22) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/organisations/core/workspace.ts` | `WorkspaceValidationError:97`, `createWorkspace:112` |
| `src/components/admin/WorkspaceWizard.tsx` | 3-phase wizard (doc `:3-12`) |
| `src/features/workspace/components/onboarding-gate.tsx` | gate (Status `:8`) |
| `src/features/workspace/screens/workspace-screen.tsx` | org chat workspace |
| `src/features/workspace/screens/ingest-screen.tsx` | org ingest page |
| `src/components/admin/OrganizationNotificationCenter.tsx` | bell + notices |
| `src/components/admin/OrganizationStatusBanner.tsx` | persistent status banner |
| `src/modules/admin-ui/hooks.ts` | `useCreateWorkspace` (API hooks) |

## 7. UI Reference

- `/workspace` and `/ingest` (`src/app/(platform)/{workspace,ingest}/page.tsx` re-export the screens); wizard lives in the platform admin orgs area (Feature 22 screens); notification center + status banner mounted in the admin layout chrome.

## 8. Environment Variables

- `CRON_SECRET` (reminder cron auth); `CLARA_SUPPORT_EMAIL`/email vars (Feature 18) for reminder delivery; public origin for verify links (Feature 26).

## 9. Tests

- Wizard/gate flows covered via `admin-ui` hook tests and org/subscription suites (Features 03/17); cron route covered by its `route.test.ts` siblings pattern (`whatsapp-connection-health/route.test.ts` style); onboarding-status assertions live in org API tests (`session-kb-permissions.test.ts`-adjacent org suites).

## 10. Cross-links

- Funnel in **28 Public Website** (signup/verify/checkout); enforcement in **01/02/03** (auth, RBAC, org) and **17/24** (plan/quota).
- Reminders delivered via **18 Platform Email**; announcements from **22**; workspace chat consumes **27** UI + **08** stream.
