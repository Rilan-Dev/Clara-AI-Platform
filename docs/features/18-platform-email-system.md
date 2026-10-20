# 18 — Platform Email System

> Clara AI Platform feature documentation · Domain: `lib/email*` + `/api/platform/email*` · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

The platform email system sends every transactional message — verification, welcome, password reset, subscription notifications, onboarding reminders — through one governed pipeline: a template registry with draft/publish/reset lifecycle, managed variables, provider selection (Resend / SMTP / console), and a super-admin editing UI. Its purpose is brand-consistent, auditable, credential-safe email: org end users receive polished messages, and every template change is versioned and reviewable.

## 2. Business Logic

- **Provider transport** — `src/lib/email.ts`: `getEmailConfig:65` resolves provider (`EmailProviderName:42` = resend | smtp | console), `sendPlatformEmail:236` dispatches, `emailFrom:112` / `wrapEmail:192` / `htmlToText:224` handle branding + fallback text, `hasEmailProvider:117` + `getEmailProviderConfigStatus:121` report readiness, `resetEmailTransportCache:164` for tests.
- **Template registry** — `src/lib/email-templates.ts`: `EmailTemplateKey:34`, `TemplateVariable:57`, `EmailTemplateDef:59`, draft types `:70`, rows `:77`, `ManagedEmailVariable:85`, `RenderedEmail:95` — the canonical key→definition map every send site uses.
- **Lifecycle API** — `/api/platform/email-templates` (list) + `/[key]` (GET/PUT draft), `/[key]/publish`, `/discard`, `/reset`, `/audit` — draft → publish → versioned audit; reset returns to platform default.
- **Variables** — `/api/platform/email-variables` (+ `/[name]`) manage the managed-variable catalog injected at render time.
- **Test send** — `/api/platform/email/test` renders + sends a sample to a target inbox for super-admin verification.
- **Notifications** — `src/lib/subscription-notifications.ts:82` `queueNotification` queues template-based sends; admin notification console `/api/admin/notifications` (+ `/retry`) re-drives failures (Feature 21).
- **Cron reminders** — `/api/cron/onboarding-reminders` sends scheduled lifecycle mails.

## 3. Business Rules

- Published templates only are used in production sends; drafts never leak to end users.
- Template variables are validated against the managed catalog — unknown placeholders fail rendering loudly (never sent raw `{{var}}`).
- Provider credentials live in env/platform settings; absence routes to the console provider in non-production (never silently drops in production without an incident).
- Every publish/reset is audited (`/audit` route + audit trail).
- Verification/password mails carry single-use tokens (Feature 01 rules).

## 4. Data Model

- `018_email_settings_and_templates.sql`, `032_email_template_drafts_and_variables.sql`, `049_welcome_email_sent_at.sql`, `026_password_reset.sql` (reset mails), `010_subscription_audit.sql` (billing mails).

## 5. API Surface

| Route group | Files |
|---|---|
| Templates | `src/app/api/platform/email-templates/**` (route, `[key]`, publish, discard, reset, audit) |
| Variables | `src/app/api/platform/email-variables/**` |
| Test | `src/app/api/platform/email/test/route.ts` |
| Notifications | `src/app/api/admin/notifications/**` (+ retry) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/lib/email.ts` | `getEmailConfig:65`, `sendPlatformEmail:236`, `wrapEmail:192`, `htmlToText:224`, `emailFrom:112`, `hasEmailProvider:117` |
| `src/lib/email-templates.ts` | `EmailTemplateKey:34`, `EmailTemplateDef:59`, `EmailTemplateDraft:70`, `ManagedEmailVariable:85`, `RenderedEmail:95` |
| `src/lib/subscription-notifications.ts` | `queueNotification:82`, `getOrgOwnerEmail:152`, `writeSubscriptionAudit:170` |

## 7. UI Reference

- `src/app/(admin)/settings/templates/page.tsx` — template editor with draft/publish/reset.
- `src/app/(admin)/settings/email/page.tsx` — provider settings + test send.
- `src/features/admin/screens/org-settings-screen.tsx` / `settings-screen.tsx` host the email panels.

## 8. Environment Variables

- `RESEND_API_KEY` / `SMTP_*` / from-address vars (see `.env.example` email section).

## 9. Tests

- Email template render tests, provider config status tests, notification queue tests (see `scripts/feature-doc/tests.txt`).

## 10. Cross-links

- Sends verification/welcome/reset mails for **01 Auth**; subscription mails for **17 Payments**; onboarding reminders for **03 Orgs**; incident mails for **21 Platform Health**.
