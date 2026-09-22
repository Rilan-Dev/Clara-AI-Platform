# Clara AI Authentication and Onboarding UX Consistency Specification

## Goal
Make every authentication, email-verification, signup, payment, and onboarding screen describe the user's actual next action. Eliminate misleading wording such as “Continue your registration” on a login-origin verification page and prevent copy from claiming payment or activation can occur before email verification.

## User-visible success criteria
1. Login-origin verification uses login/verification language, not registration language.
2. Paid signup verification tells the user to return to signup and continue to payment only after verification.
3. Free-plan signup is never told to continue to payment.
4. Login cannot imply that an unverified user has completed onboarding.
5. Signup, verification, checkout, checkout-success, resend, and onboarding-gate surfaces use consistent terminology.
6. Verification success, already-verified, expired/invalid, and resend states explain the next action.
7. Verification and reminder emails use the same state-aware terminology.
8. Existing authorization remains fail-closed: paid checkout stays blocked until email verification and workspace access keeps its existing onboarding gate.
9. Automated tests cover state-to-copy/action mapping.

## Canonical state model
- signup_pending_verification: account created, email not verified.
- signup_verified_payment_required: email verified, paid plan selected, payment required.
- signup_verified_free_ready: email verified, free plan selected, workspace can continue.
- payment_pending: payment initiated but not confirmed.
- active: existing email/payment/onboarding requirements satisfied.
- login_email_verification_required: authenticated login with unverified email.
- already_verified: verification request is redundant.
- verification_expired_or_invalid: token cannot be used.

## Copy rules
- Use “email verification” or “verify your email”, never “registration” for login-origin verification.
- Use “signup” only when the user is actually in signup.
- Use “payment” only for a paid plan that has passed email verification.
- Never say “plan starts immediately” before required verification/payment.
- CTA text must name the actual next action.
- Verification pages distinguish returning to signup from returning to Clara AI/sign in.
- “Activated” means the existing backend activation criteria are satisfied.

## Scope
Audit and update existing auth/onboarding surfaces rather than introducing another authentication system. Prefer existing onboarding-status APIs and signup polling. Consolidate copy/state decisions in small testable helpers where practical.

## Out of scope
- Subscription prices, plans, payment gateways, authorization policy, or token security changes.
- Replacing the email provider.
- Whole-auth UI redesign.
- Removing routes without evidence they are unused.