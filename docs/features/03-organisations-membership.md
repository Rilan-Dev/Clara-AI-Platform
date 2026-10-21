# 03 — Organisations & Membership

> Clara AI Platform feature documentation · Domain: `organisations` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The organisation is Clara's tenant boundary: every agent, knowledge base, phone number, integration, and subscription belongs to exactly one organisation. This feature manages tenant lifecycle (create / list / update / delete), the member roster (invite, list, role changes, remove), per-org onboarding state, and the workspace-creation flow that provisions a new tenant with its first agent. It is what makes Clara a multi-tenant SaaS rather than a single-user tool — isolation of tenant data is enforced at this boundary everywhere downstream.

## 2. Business Logic

- **Tenant CRUD** — `src/modules/organisations/api/orgs.ts:25-127` exposes `createOrgHandler`, `listOrgsHandler`, `getOrgHandler`, `updateOrgHandler`, `deleteOrgHandler` over `src/modules/organisations/core/db.ts:71-118` (`createOrganisation` … `deleteOrganisation`, slug resolution at `:101`). Routes: `/api/orgs`, `/api/orgs/[orgId]`.
- **Members** — `/api/orgs/[orgId]/members` (list/create) and `/api/orgs/[orgId]/members/[userId]` (update/remove) manage `organization_memberships`; role changes take effect on next request (guards read live state, Feature 02).
- **Workspace provisioning** — `src/modules/organisations/core/workspace.ts:112` `createWorkspace` (input `:22`, result `:42`, validation `:97`) creates an organisation together with its starter agent — the flow behind the signup wizard. Exposed via `src/app/api/platform/workspaces/route.ts` (platform-side provisioning) and `/api/orgs/[orgId]/dashboard`.
- **Onboarding state** — `/api/orgs/[orgId]/onboarding-status` plus `/api/subscriptions/onboarding-status` drive the continuation banners (which setup step the tenant is on: agent created? KB indexed? billing configured?) — backed by migration `050_billing_onboarding_gate.sql`.
- **Platform view** — `/api/platform/orgs` + `/api/platform/orgs/[id]/*` give the super-admin tenant overview, settings override, and audited impersonation (Feature 22).

## 3. Business Rules

- Org slugs are unique; `getOrganisationBySlug` (db.ts:101) is the canonical lookup.
- Deleting an organisation is a privileged, guarded operation — agents, KBs and subscriptions underneath make it high-blast-radius.
- Members can only be administered by organisation admins or above; membership is required for any org-scoped resource access.
- Onboarding banners and the billing gate block feature surfaces until mandatory setup steps complete.
- The agent roster belongs to the org: `src/modules/organisations/api/agents.ts:12-90` (`createAgentHandler` … `deleteAgentHandler`) enforce org ownership on every agent mutation.

## 4. Data Model

- `organizations`, `organization_memberships` — `001_foundation.sql`, `002_users_rbac.sql`.
- Onboarding gate state — `050_billing_onboarding_gate.sql`.
- Org AI settings / catalog — `013_org_ai_settings.sql`, `008_org_ai_catalog.sql` (Feature 12).

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/orgs/route.ts`, `src/app/api/orgs/[orgId]/route.ts` | orgs.ts:25-127 |
| `src/app/api/orgs/[orgId]/members/route.ts`, `.../members/[userId]/route.ts` | membership handlers |
| `src/app/api/orgs/[orgId]/agents/route.ts` | agents.ts:12-63 |
| `src/app/api/orgs/[orgId]/dashboard/route.ts` | dashboard aggregation |
| `src/app/api/orgs/[orgId]/onboarding-status/route.ts` | onboarding state |
| `src/app/api/platform/workspaces/route.ts` | workspace.ts:112 provisioning |
| `src/app/api/platform/orgs/route.ts`, `src/app/api/platform/orgs/[id]/*` | super-admin tenant console |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/organisations/core/db.ts` | `createOrganisation:71`, `listOrganisations:84`, `getOrganisationById:96`, `getOrganisationBySlug:101`, `updateOrganisation:106`, `deleteOrganisation:118`, `createAgent:125`, `listAgents:211`, `getAgentById:216`, `updateAgent:221`, `deleteAgent:249` |
| `src/modules/organisations/core/models.ts` | `Organisation:3`, `AgentStatus:23` ("draft" \| "published" \| "archived") |
| `src/modules/organisations/core/workspace.ts` | `createWorkspace:112` |
| `src/modules/organisations/api/orgs.ts` / `agents.ts` | HTTP handlers (above) |

## 7. UI Reference

- `src/app/(admin)/orgs/page.tsx` — tenant list.
- `src/app/(admin)/orgs/[id]/page.tsx` — tenant overview; `.../settings/page.tsx`, `.../members/page.tsx`, `.../billing/page.tsx` — tenant admin screens.
- `src/app/(admin)/dashboard/page.tsx` — org dashboard consuming `/api/orgs/[orgId]/dashboard`.
- `src/app/(platform)/signup/page.tsx` → workspace provisioning wizard.

## 8. Environment Variables

- None specific; tenant data lives in Postgres (connection via `DATABASE_URL`, Feature 26).

## 9. Tests

- `src/modules/organisations/core/agent-ai-types.test.ts` and org module suites (locate current test files in the module directories; the old generated inventory is not committed).

## 10. Cross-links

- Membership powers **02 RBAC**; workspace provisioning creates the first **04 Agent**.
- Org AI settings and catalogs belong to **12 AI Settings**; billing to **17 Payments**.
- Platform-side tenant administration is documented in **22 Platform Administration**.
