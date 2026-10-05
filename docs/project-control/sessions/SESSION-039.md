# SESSION-039 — UI/RBAC readiness and production Docker verification

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Authorization: User-directed implementation and verification; existing phase/integration boundaries remain binding

## Completed
- Reviewed current role/permission model against the database RBAC source of truth.
- Confirmed the existing UI exposes role-aware organisation navigation and member-management controls without inventing new permissions.
- Confirmed organisation billing UI exposes current plan, renewal state, live usage meters, plan limits/entitlements, upgrade/renew/downgrade flows, and billing history.
- Confirmed platform-admin subscription UI exposes plan management and subscription lifecycle controls.
- Confirmed `/ai-platform` is exposed only to platform administrators.
- Confirmed tenant billing mutations are protected by existing `org:update` permission and the UI redirects non-`org_admin` users away from organisation billing.
- Confirmed the maintained `@e965/xlsx@0.20.3` dependency is present in both `package.json` and `package-lock.json` on the current feature branch, matching the immutable extraction's import.
- Added a dedicated GitHub Actions production Docker build job using the repository `Dockerfile` and `SKIP_AUTH=true` to reproduce the reported Docker build path.

## Role model
- `org_admin`: organisation/member/billing administration plus all existing RBAC permissions.
- `project_manager`: agent/project and knowledge-base operational management; no organisation billing administration.
- `kb_editor`: knowledge-base/document editing; no billing administration.
- `kb_viewer`: read-only access to knowledge-base/document surfaces.
- Platform super-admin: platform-level administration; tenant resource access remains bounded by the existing tenant boundary.

## Subscription enforcement
- Free fallback: 1 KB, 10 docs/KB, 100 requests/24h, 100 MB, text-only; voice/API/branding/SSO disabled.
- Starter: 3 KBs, 50 docs/KB, 1,000 requests/24h, 1 GB, voice/API enabled.
- Pro: 10 KBs, 200 docs/KB, 10,000 requests/24h, 10 GB, voice/API/custom branding and priority support.
- Enterprise: unlimited core quotas, voice/API/custom branding/SSO and advanced enterprise capabilities.
- Expired/past-due/paused/cancelled subscriptions fall back to free limits through the existing plan guard.
- Quota admission remains atomic and rolling-24h.

## Pending
- Fresh executable Docker production build result.
- Browser/deployment verification of the UI on a live/current deployment.
- I-1 Gate-C verification and architect closure review.
- Any future I-2/I-3 integration runtime work remains unauthorized until I-1 is closed.

## Boundary
No database/schema/migration, new permission, billing architecture, OAuth runtime, credential vault, outbound HTTP, MCP runtime, or D-023 metering change was introduced by this session.
