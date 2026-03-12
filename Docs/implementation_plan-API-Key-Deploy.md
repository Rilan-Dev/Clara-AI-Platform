# API Key Deployment & Consumption — Complete Implementation Plan

Build a production-ready API Key deployment flow so that organisation admins can create API keys (gated by their subscription), embed the Clara AI assistant on any website with a single script tag, and follow clear documentation to get running in minutes.

## Current State (What Already Exists)

| Component | Status | Location |
|-----------|--------|----------|
| `api_keys` + `api_key_usage` DB tables | ✅ Done | [005_api_keys.sql](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/db/migrations/005_api_keys.sql) |
| `subscription_plans` + `org_subscriptions` tables | ✅ Done | [006_subscriptions.sql](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/db/migrations/006_subscriptions.sql) |
| API key CRUD + rate limiting | ✅ Done | [modules/embed/core/api-keys-db.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/api-keys-db.ts) |
| Embed validation middleware | ✅ Done | [modules/embed/core/validate-embed.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/validate-embed.ts) |
| Public embed routes (`/api/embed/chat`, `/config`, `/session`) | ✅ Done | `app/api/embed/` |
| API Keys Manager UI (Deploy tab) | ✅ Done | [components/admin/ApiKeysManager.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/components/admin/ApiKeysManager.tsx) |
| Snippet panel (iframe + script + curl) | ✅ Done | Inside [ApiKeysManager.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/components/admin/ApiKeysManager.tsx) |
| **Subscription enforcement on key creation** | ❌ Missing | — |
| **Embeddable widget script (`clara.js`)** | ❌ Missing | — |
| **Daily quota enforcement** | ❌ Missing | — |
| **Integration docs content** | ❌ Missing | Placeholder pages only |

---

## Phase 1: Subscription Enforcement on API Key Creation

**Goal**: Admins can only create API keys if their subscription plan allows `api_access`. Prevent over-provisioning.

### [NEW] [subscription-guard.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/subscription-guard.ts)

Reusable utility that checks an org's subscription and returns whether they can:
- Create API keys (`api_access === true`)
- How many keys they can have (derive from plan tier: Free=0, Starter=3, Pro=10, Enterprise=unlimited)
- Current key count vs limit

```typescript
export async function checkApiKeyQuota(orgId: string): Promise<{
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
  plan: string;
}>
```

### [MODIFY] [route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/kbs/%5BkbId%5D/api-keys/route.ts)

- Import `checkApiKeyQuota` in the [POST](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/kbs/%5BkbId%5D/api-keys/route.ts#43-90) handler
- Before creating a key, call `checkApiKeyQuota(orgId)`
- If `allowed === false`, return `403` with upgrade message
- Add `max_api_keys` info to the [GET](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/kbs/%5BkbId%5D/api-keys/route.ts#16-42) response so the UI can show limits

### [MODIFY] [ApiKeysManager.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/components/admin/ApiKeysManager.tsx)

- Show subscription tier badge and remaining key quota
- Disable "New key" button when at limit, show upgrade CTA
- Display plan-specific info banner (e.g. "Starter plan: 3 keys max")

### [NEW] [011_api_key_limits.sql](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/lib/db/migrations/011_api_key_limits.sql)

Add `max_api_keys` column to `subscription_plans`:
```sql
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_api_keys INTEGER NOT NULL DEFAULT 0;
UPDATE subscription_plans SET max_api_keys = 0  WHERE id = 'free';
UPDATE subscription_plans SET max_api_keys = 3  WHERE id = 'starter';
UPDATE subscription_plans SET max_api_keys = 10 WHERE id = 'pro';
UPDATE subscription_plans SET max_api_keys = -1 WHERE id = 'enterprise';  -- unlimited
```

---

## Phase 2: Embeddable Widget Script (`clara.js`)

**Goal**: A single `<script>` tag that auto-injects a floating chat widget on any website. Zero backend setup for the end user.

### [NEW] [clara.js](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/public/embed/clara.js)

Self-contained vanilla JS file (~5KB minified). When loaded:
1. Reads `data-key` (required), `data-position` (default: `bottom-right`), `data-theme` (default: [light](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/validate-embed.ts#136-144)) from its own `<script>` tag
2. Calls `GET /api/embed/config` with `Authorization: Bearer <key>` to fetch branding (name, colors, welcome message, voice enabled)
3. Injects a floating button + expandable chat panel into the page
4. Chat panel streams messages via `POST /api/embed/chat`
5. If `voiceEnabled`, shows a mic button that connects via `/api/embed/session`

**Architecture decisions**:
- Pure vanilla JS — no framework dependency for end users
- Shadow DOM to prevent CSS conflicts with host site
- All API calls go to the same origin as the script `src`
- Graceful degradation if config fetch fails

### [NEW] [route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/embed/clara.js/route.ts)

Next.js route handler that serves the `clara.js` file with correct `Content-Type: application/javascript` and aggressive caching headers. Alternatively, serve from `public/embed/clara.js` directly.

### [MODIFY] [ApiKeysManager.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/components/admin/ApiKeysManager.tsx)

- Update [SnippetPanel](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/components/admin/ApiKeysManager.tsx#206-241) to use the actual deployed base URL for script `src`
- Add a third snippet type: **React/Next.js** component snippet
- Add **WordPress** snippet (simple HTML plugin approach)

---

## Phase 3: Public Embed API Hardening

**Goal**: Enforce subscription-level daily quotas, voice access gates, and provide usage analytics.

### [MODIFY] [validate-embed.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/validate-embed.ts)

- After API key validation, fetch org subscription to check:
  - `max_req_day`: daily request quota (tracked via `api_key_usage`)
  - `voice_enabled`: gate the `/api/embed/session` endpoint
- Add a new helper `checkDailyQuota(keyId, maxReqDay)` in [api-keys-db.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/api-keys-db.ts)

### [MODIFY] [api-keys-db.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/modules/embed/core/api-keys-db.ts)

- Add `checkDailyQuota()` function — sum `api_key_usage.count` for the last 24 hours
- Add `getOrgPlanForKey(keyId)` — joins api_keys → organisations → org_subscriptions → subscription_plans to get plan limits

### [MODIFY] [session route.ts](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/embed/session/route.ts)

- Add voice_enabled plan check before creating realtime session

### [NEW] [usage route](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/api/kbs/%5BkbId%5D/api-keys/usage/route.ts)

- `GET /api/kbs/[kbId]/api-keys/usage` — returns aggregate usage stats + quota info for the dashboard

---

## Phase 4: Integration Docs — Getting Started Guide

**Goal**: Beautiful, clear documentation page at `/docs` with step-by-step guides that make implementation dead simple. Structured in 3 sections with copy-paste code.

### [NEW] [docs-screen.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/features/platform/screens/docs-screen.tsx)

Main docs layout with:
- Sidebar navigation (Getting Started / API Reference / SDK & Snippets)
- Code blocks with syntax highlighting and copy buttons
- Tab switchers for different frameworks (HTML, React, Vue, WordPress)
- Live "Try it" playground section

### [MODIFY] [page.tsx](file:///c:/Users/moham/Documents/MyProjects/Workpace/clara-platform/clara-backend/src/app/(platform)/docs/page.tsx)

Update to export the new docs screen component.

### Docs Content Structure:

#### Getting Started (3-step guide)
1. **Create your Knowledge Base** → link to KB dashboard
2. **Generate an API Key** → link to Deploy tab, screenshot-style illustration
3. **Add to your website** → single `<script>` tag, 2 lines of code

#### API Reference
- `POST /api/embed/chat` — request/response format, streaming protocol
- `GET /api/embed/config` — branding configuration
- `POST /api/embed/session` — voice session creation
- Authentication: `Authorization: Bearer <your-key>`
- Error codes and rate limit responses

#### SDK & Snippets
- **HTML** — script tag (1 line)
- **React / Next.js** — component with `useEffect`
- **Vue.js** — component
- **WordPress** — plugin snippet
- **REST API** — curl examples for custom backend integration

---

## Phase 5: End-to-End Testing & Verification

> [!IMPORTANT]
> There are no existing unit tests in this codebase. All verification will be manual + API-based.

### Verification Plan

#### API Testing (via curl / browser dev tools)

1. **Subscription enforcement test**:
   ```bash
   # Attempt to create API key for a "free" plan org → should get 403
   curl -X POST http://localhost:3000/api/kbs/<kb-id>/api-keys \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Test"}'
   # Expected: { "error": "API access requires Starter plan or above" }
   ```

2. **Key creation success test**:
   ```bash
   # Create API key for a "pro" plan org → should get 201 + raw key
   # Expected: { "key": {...}, "rawKey": "clr_..." }
   ```

3. **Embed chat test**:
   ```bash
   # Use the created key to call embed chat
   curl -X POST http://localhost:3000/api/embed/chat \
     -H "Authorization: Bearer clr_<key>" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"Hello"}]}'
   # Expected: streaming NDJSON response with tokens
   ```

4. **Rate limit test**: Hit the endpoint repeatedly past the limit, verify 429 response

#### Browser Testing

5. **Widget integration test**:
   - Create a simple HTML file with the `<script src=".../embed/clara.js" data-key="clr_...">` tag
   - Open in browser → verify floating button appears
   - Click → verify chat panel opens with correct branding
   - Send a message → verify streaming response

6. **Docs page test**:
   - Navigate to `http://localhost:3000/docs`
   - Verify sidebar navigation works
   - Verify code snippets have copy buttons
   - Verify framework tab switching

#### Manual Verification (User)
7. Deploy to staging and test with a real tenant site (e.g. `clara-omen-insurance`)
