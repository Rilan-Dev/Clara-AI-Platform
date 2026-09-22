# Organization Continuation UX and Platform Banner Implementation Plan

1. Make the authentication gate machine-readable while retaining fail-closed authorization.
2. Add an organization-scoped onboarding-status API with exact state and CTA.
3. Add a reusable workspace top banner with payment/email recovery actions.
4. Add platform announcement persistence and APIs.
5. Add platform-admin announcement management under Settings.
6. Surface active announcements in organization workspaces.
7. Preserve existing subscription email/reminder infrastructure.
8. Validate with TypeScript/lint/build and Vercel deployment.
9. Verify production runtime and only then merge to Vercel-Prod.