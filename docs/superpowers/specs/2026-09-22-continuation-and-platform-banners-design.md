# Organization Continuation UX and Platform Banner Design

## Goal
Replace the generic paid-onboarding dead end with an actionable organization continuation experience and add a reusable top-of-workspace notification channel for billing lifecycle events and platform announcements.

## State contract
The server remains authoritative. Organization onboarding status is exposed as:
- email_verification_required
- payment_required
- payment_pending
- payment_failed
- payment_cancelled
- payment_review
- subscription_required
- ready

Protected mutation APIs continue to fail closed. The UI never infers state by parsing an English error string.

## UX
The workspace shell displays a compact top banner for non-super-admin organization users. The banner identifies the exact blocked step and supplies a direct CTA. Verification also provides resend verification.

Payment pending/review messages explain that another payment should not be submitted.

## Platform announcements
A separate announcement store supports:
- info/success/warning/critical severity
- all/paid/trialing audience
- start/end time
- priority
- CTA label and URL
- dismissibility

Platform administrators can create/delete announcements from Settings > Announcements. Active announcements are displayed in the organization workspace without changing the existing sidebar architecture.

## Email
Existing onboarding reminders and subscription notification infrastructure remain the source of truth for email. This change does not duplicate the email queue.

## Performance
Status and announcement requests are no-store, lightweight, and loaded by the existing shell. No blocking server render or new sidebar is introduced.