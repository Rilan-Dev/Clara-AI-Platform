# SESSION-038 — RBAC, subscription-control, and AI Platform UI enablement

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Authorization: User-directed UI/RBAC implementation; Integrations I-1 runtime boundary remains D-031

## Scope
Make the existing Clara workspace UI accurately reflect the database-backed RBAC model and expose the newly implemented AI Platform verification workspace to platform administrators.

## Implementation
- Organisation listing now returns the caller's concrete organisation role from the existing org_members → roles relationship.
- Admin UI auth state now carries the primary organisation role.
- Organisation sidebar navigation is role-aware: org_admin gets Dashboard/Agents/Members/Billing; project_manager gets Dashboard/Agents/Members; kb_editor and kb_viewer get Dashboard/Agents.
- Billing is restricted in the UI to org_admin.
- Direct navigation to organisation billing is redirected for non-org_admin users.
- The existing /ai-platform workspace is now exposed in the platform-admin sidebar and is explicitly super-admin-only.
- The platform-admin AI Platform route is kept outside the tenant workspace assistant shell.
- Subscription checkout and self-serve downgrade/cancel-scheduled-downgrade now require the existing org:update RBAC permission for tenant users; platform super-admins retain their platform-level path.
- Team management UI distinguishes invitation capability from full member-management capability.

## Safety / non-scope
No migration, schema change, new permission, billing architecture, integration runtime, OAuth, credential vault, outbound HTTP, MCP runtime, or deployment was introduced.
The existing role/permission definitions remain authoritative. This change only consumes the existing RBAC model and closes a billing authorization gap.

## Verification status
- Static source review: complete.
- Changed paths are limited to UI/auth-client/org listing/RBAC-protected subscription routes plus this governance record.
- Executable CI for the current feature head is still not exposed through the connected GitHub Actions surface.
- Vercel has no deployment for the current feature head; the latest connected deployment is an older canceled build-rate-limited deployment.
- User-provided Docker evidence established I-019; the TypeScript inclusion-boundary correction is present, but a fresh executable production build remains required.

## Result
UI/RBAC implementation: COMPLETE.
Browser/deployment verification: PENDING.
I-1 Gate C / closure: PENDING.
I-019 build verification: PENDING.