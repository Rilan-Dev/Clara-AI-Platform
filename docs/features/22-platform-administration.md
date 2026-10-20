# 22 — Platform Administration

> Clara AI Platform feature documentation · Domain: `/api/platform/*` + admin console · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The super-admin plane: cross-tenant statistics and revenue, user management (unlock), organisation oversight with impersonation, subscription-plan management, platform AI provider registry (credentials/test/models), platform assistant defaults versioning, announcements, theme, demo configuration, integrations control plane, and platform environment introspection. Its purpose is one console to operate the whole SaaS — everything a platform operator needs, gated to super-admins (Feature 02), audited (Feature 20), and isolated from tenant concerns.

## 2. Business Logic

- **Stats & revenue** — `/api/platform/stats` (line 7) and `/api/platform/revenue` — KPI aggregation over analytics spine.
- **Users & orgs** — `/api/platform/users/[id]/unlock` (account unlock), `/api/platform/orgs` (+ `[id]`, `[id]/impersonate`, `[id]/mcp-override`) — tenant oversight with audited impersonation (Feature 02/20).
- **Subscription plans** — `/api/platform/subscription-plans` — plan catalog administration feeding entitlements (Features 11/17/24).
- **AI provider registry** — `/api/platform/ai/providers` (+ `[providerId]`, `/credentials`, `/test`, `/models`), `/api/platform/ai/usage`, `/api/platform/ai/defaults`, `/api/platform/ai/embedding-default(/test)` — provider CRUD, credential vault, connectivity probes (vendor test calls), model lists (Feature 10/11/12).
- **Assistant defaults** — `/api/platform/assistant-defaults` (+ `/draft`, `/diff`, `/versions`, `/versions/[versionNumber]`) — versioned platform-wide assistant behaviour/branding (Feature 04/12).
- **Announcements** — `/api/platform/announcements` (+ `[id]`) + `052_platform_announcements.sql` — platform-wide notice banners for tenants (onboarding continuation banners lineage).
- **Theme** — `/api/platform/theme` + `039_default_theme_mode.sql` — platform default theme mode.
- **Demo configuration** — `/api/platform/demo-config` — the server-side Demo org/KB/voice selection used by the landing page and widget demo mode (Feature 13).
- **Integrations control plane** — `/api/platform/integrations` (+ `[integrationId]/credentials`, `/oauth-app`), `/api/platform/mcp-servers{,oauth/*,test}`, `/api/platform/mcp-settings` — platform-owned integration + MCP server registry (Feature 23).
- **Environment introspection** — `/api/platform/env` — safe env-derived config surface (runtime flags — Feature 21).
- **Workspaces** — `/api/platform/workspaces` — provisioning (Feature 03).

## 3. Business Rules

- Every platform route requires the super-admin role; impersonation and unlocks are audited.
- Provider credentials are write-only via API (never read back in plaintext — Feature 24 secret hygiene).
- Assistant defaults changes version via draft→diff→publish; tenants' agents adopt consciously (Feature 04).
- Announcements are platform-curated; tenants cannot opt out of critical-level notices.
- Demo configuration must reference a healthy demo org/KB — landing demo degrades honestly otherwise.
- Theme/branding defaults apply only where a tenant hasn't overridden.

## 4. Data Model

- `012_platform_settings.sql`, `015_platform_assistant_defaults.sql`, `039_default_theme_mode.sql`, `052_platform_announcements.sql`, `053_platform_embedding_defaults.sql`, `060-073` integrations/MCP control plane (Feature 23).

## 5. API Surface

- 40+ routes under `src/app/api/platform/**` — full list in `scripts/feature-doc/api-routes.txt`; key anchors: `stats/route.ts:7`.

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/admin-ui/ai-platform-api.ts` | platform console data layer |
| `src/modules/admin/core/catalog.ts` | platform catalog services |
| `src/modules/organisations/core/workspace.ts` | `createWorkspace:112` |
| `src/lib/runtime-flags.ts` | `describeRuntimeFlags:43` (env surface) |

## 7. UI Reference

- `src/app/(admin)/ai-platform/page.tsx` — the super-admin console shell (providers, stats, revenue, defaults, integrations tabs).
- `src/app/(admin)/settings/**` — ai, announcements, appearance, email, embed, environment, integrations, mcp (+ governance), payments, phone, templates.
- `src/app/(admin)/orgs/page.tsx` + `src/features/admin/screens/orgs-screen.tsx` — tenant oversight.

## 8. Environment Variables

- Provider credential vault entries, platform default model vars, `CLARA_ENV` scoping (Feature 26).

## 9. Tests

- admin-ui / platform route suites, assistant-defaults versioning tests, announcements tests (see `scripts/feature-doc/tests.txt`).

## 10. Cross-links

- RBAC — **02**; provider execution — **10**; catalog/entitlements — **11/17**; impersonation audit — **20**; integrations detail — **23**; observability — **21/24**.
