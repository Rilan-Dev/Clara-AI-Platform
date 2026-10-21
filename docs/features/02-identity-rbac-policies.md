# 02 — Identity, RBAC & Policies

> Clara AI Platform feature documentation · Domain: `auth` core + `api/policies` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

Role-based access control is the authorisation backbone that decides what an authenticated identity may do: which screens render, which API routes accept a call, and which platform-level actions require the super-admin role. It separates three planes — organisation roles (owner / admin / member), platform administration (super-admin console, impersonation), and agent-scoped policies (which members may publish or mutate a given agent). The purpose is least-privilege by construction: route guards and policy rows, not UI hiding, are the enforcement point.

## 2. Business Logic

- **Role resolution** — after login, `/api/auth/me` resolves the user's role set; organisation membership rows (`organization_memberships`, migration `002_users_rbac.sql`) determine org-plane rights, while the platform super-admin flag unlocks the `(admin)/ai-platform` console and the `/api/platform/*` surface.
- **Policy store** — `GET/POST /api/policies` and `GET/PUT/DELETE /api/policies/[id]` manage agent-scoped policy rows consumed by the agent workspace to gate member-level mutation rights (e.g., who may edit a draft or publish a version).
- **Route-level guards** — platform routes verify the super-admin session; organisation routes (`/api/orgs/[orgId]/*`) verify active membership of that organisation; agent routes additionally resolve agent→org ownership before any mutation.
- **Audit of privileged actions** — impersonation and audit reveals are wrapped by the audit system (Feature 20) so every privilege escalation is tamper-evident and reviewable.

## 3. Business Rules

- A user belongs to one or more organisations via `organization_memberships`; actions are only permitted on resources owned by an organisation the caller is an active member of.
- Platform super-admin capabilities (stats, revenue, user unlock, org impersonation) are never reachable from organisation roles.
- Agent policy changes are themselves auditable; policies can only be administered by organisation admins or above.
- Revoked membership removes access immediately — guards read live membership state, never cached roles.

## 4. Data Model

- `users`, role/permission seed tables, `organization_memberships` — `001_foundation.sql`, `002_users_rbac.sql`.
- Agent policies table — served by `src/app/api/policies/*` (backed by `src/modules/admin/api/policies.ts`).
- Audit trail for privileged actions — `027_query_audit.sql`, `030_audit_hardening.sql` (Feature 20).

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/policies/route.ts`, `src/app/api/policies/[id]/route.ts` | Agent policy CRUD |
| `src/app/api/platform/users/[id]/unlock/route.ts` | Super-admin account unlock |
| `src/app/api/platform/orgs/[id]/impersonate/route.ts` | Super-admin impersonation (audited) |
| All `/api/orgs/[orgId]/**`, `/api/agents/**`, `/api/kbs/**` | Membership-guarded surfaces |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/admin/api/policies.ts` | policy handlers backing `/api/policies` |
| `src/modules/organisations/core/db.ts:60` | `AgentValidationError` — org/agent ownership validation class |
| `src/modules/organisations/api/orgs.ts:25-127` | `createOrgHandler` … `deleteOrgHandler` — membership-guarded org CRUD |
| `src/modules/mcp/audit.ts:50,73` | `recordOrgMcpAudit` / `recordPlatformMcpAudit` — privileged-action audit for the MCP plane |

## 7. UI Reference

- `src/app/(admin)/ai-platform/page.tsx` — super-admin platform console (super-admin role only).
- `src/app/(admin)/orgs/[id]/members/page.tsx` — membership management screen.
- `src/app/(admin)/orgs/[id]/agents/[agentId]/page.tsx` — agent detail where policy rows apply.

## 8. Environment Variables

- None specific; relies on session + membership state. Super-admin identification is seeded (see `scripts/seed.ts` / bootstrap, Feature 22).

## 9. Tests

- RBAC regression suites under `src/modules/auth/__tests__/` plus organisation module tests (`agent-ai-types.test.ts` etc. — locate current test files in the module directories; the old generated inventory is not committed).

## 10. Cross-links

- **01 Authentication** establishes the identity this feature authorises.
- **03 Organisations** owns the membership rows consumed here.
- **20 Analytics & Audit** records privileged actions (impersonation, reveals).
