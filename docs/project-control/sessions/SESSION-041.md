# SESSION-041 — Current UI/RBAC/subscription verification checkpoint

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Authorization: User-directed implementation and verification; existing phase/integration boundaries remain binding

## Verified source state
- Latest known feature-branch checkpoint: c524f2914f645f1b88a3537d1c149af7d9365b88.
- The requested UI/RBAC/subscription implementation is present in the current branch.
- Role-aware navigation and direct-route protection use the existing organisation capability model.
- Organisation Members UI exposes the four defined roles; org_admin can assign all defined roles, while project_manager grants remain limited to Editor/Viewer.
- Billing & Plan exposes current plan, status/renewal, live usage, plan entitlements, upgrade/renew/downgrade flows, and billing history.
- Platform AI Platform workspace is exposed only to platform administrators.
- The application manifest and lockfile both contain @e965/xlsx@0.20.3, matching the reference-tree import without changing the immutable snapshot.

## Subscription model verified
- Free: 1 KB, 10 documents/KB, 100 requests/24h, 100 MB; voice/API/branding/SSO disabled.
- Starter: 3 KBs, 50 documents/KB, 1,000 requests/24h, 1 GB; voice/API enabled.
- Pro: 10 KBs, 200 documents/KB, 10,000 requests/24h, 10 GB; voice/API/custom branding and priority support.
- Enterprise: unlimited core quotas; voice/API/custom branding/SSO and enterprise capabilities.
- Expired/past-due/paused/cancelled subscriptions fall back to free limits through the plan guard.
- Quota admission remains atomic and rolling-24h.

## Verification status
- Source review: PASS for the requested UI/RBAC/subscription surface.
- Current-head executable CI: PENDING at this checkpoint.
- Current-head production Docker build: PENDING.
- Browser/current deployment verification: PENDING; recent Vercel feature-branch deployments are cancelled by the connected Hobby build-rate limit.
- Integrations I-1 Gate C/D: PENDING and remains separately bounded.
- No I-2 runtime, OAuth, persistence, credential vault, egress, MCP runtime, or production promotion is authorized.

## Boundary
No new permission model, database/schema/migration, billing architecture, integration runtime, OAuth, outbound network execution, MCP runtime, or D-023 metering semantics are introduced by this checkpoint.
