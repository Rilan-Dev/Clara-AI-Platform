# 01 — Authentication & Session Management

> Clara AI Platform feature documentation · Domain: `auth` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

Authentication is the front door of the Clara AI platform: every organisation user (owner, admin, member), every platform super-admin, and every embeddable-widget session starts with an identity established here. The feature covers credential login, account registration with email verification, session issuance and revocation, password lifecycle (forgot / reset / change), and login lockout protection. Its purpose is to guarantee that only verified humans reach organisation data, while remaining a single, auditable control point that all downstream features (chat, KB management, billing) depend on.

## 2. Business Logic

- **Login** — `POST /api/auth/login` validates email + password against the `users` table (bcrypt hashes), checks the login-lockout counters (migration `031_login_lockout.sql`), and issues a signed session token; concurrent sessions are tracked per user and listed/revocable via `/api/auth/sessions`.
- **Registration** — `POST /api/auth/register` creates the user, then `POST /api/auth/resend-verification` + `GET /api/auth/verify-email` drive the email-verification handshake (migration `048_email_verification.sql`); unverified users are gated from organisation features.
- **Password lifecycle** — `POST /api/auth/forgot-password` mints a single-use reset token (migration `026_password_reset.sql`); `POST /api/auth/reset-password` consumes it; `POST /api/auth/change-password` requires an authenticated session and re-authenticates the old password before accepting a new one.
- **Session context** — `GET /api/auth/me` returns the current user, roles, and organisation context used by the admin shell to decide which UI to mount; `POST /api/auth/logout` revokes the current session.

## 3. Business Rules

- Wrong-credential attempts are counted per account; exceeding the lockout threshold blocks login for a cool-off window (login lockout, migration 031) — protecting against credential stuffing.
- Email verification is mandatory before an account can act inside an organisation (verification gate, migration 048).
- Password reset tokens are single-use and expire; a consumed or stale token forces the user back to the forgot-password flow.
- Session tokens are bearer credentials; logout revokes the session row so a leaked token cannot be replayed.
- Public errors are curated (no internals leak); lockout/verification specifics never disclose whether an email exists.

## 4. Data Model

- `users` — identity, password hash, verification state (`001_foundation.sql`, `002_users_rbac.sql`, `048_email_verification.sql`).
- `auth_sessions` — issued sessions per user (list/revoke).
- `auth_login_attempts` / lockout counters — `031_login_lockout.sql`.
- `password_reset_tokens` — `026_password_reset.sql`.

## 5. API Surface (handler line anchors)

| Route | Method | Handler anchor |
|---|---|---|
| `src/app/api/auth/login/route.ts` | POST | line 3 → `loginHandler` |
| `src/app/api/auth/register/route.ts` | POST | line 3 → `registerHandler` |
| `src/app/api/auth/me`, `/logout`, `/sessions`, `/change-password`, `/forgot-password`, `/reset-password`, `/resend-verification`, `/verify-email` | POST/GET | thin route delegates under `src/app/api/auth/*` |

## 6. Core Module Files (`src/modules/auth/`)

- The 9 files of `src/modules/auth/` (api + core) hold `loginHandler`, `registerHandler`, session, and password/reset handlers; the route files are one-line delegates.
- Login lockout is enforced in the login handler path with counters from `031_login_lockout.sql`.
- Email verification state machine: `048_email_verification.sql` + welcome-email marker `049_welcome_email_sent_at.sql` (ties into Feature 18 email system).

## 7. UI Reference

- `src/app/login/page.tsx` — login screen.
- `src/app/login/forgot/page.tsx`, `src/app/login/reset/page.tsx` — password reset flow.
- `src/app/login/verify-email/page.tsx` — verification landing.
- `src/app/(platform)/signup/page.tsx`, `src/app/(platform)/signup/verify/page.tsx` — public signup.
- `src/app/(admin)/settings/account/page.tsx` — change password / account settings screen.

## 8. Environment Variables

- `AUTH_SECRET` / session signing secret (see `.env.example` auth section) — required for session issuance.
- Email provider vars for verification mail — Feature 18 (`RESEND_*` / `SMTP_*`).

## 9. Tests

- `src/modules/auth/**/__tests__/` — login/register/lockout/reset regression suites (locate current test files in the module directories; the old generated inventory is not committed inventory).

## 10. Cross-links

- Feeds **02 Identity & RBAC** (roles resolved after login) and **03 Organisations** (membership context in `/api/auth/me`).
- Verification + welcome emails are sent through **18 Platform Email System**.
- Lockout events surface in **20 Analytics & Audit**.
