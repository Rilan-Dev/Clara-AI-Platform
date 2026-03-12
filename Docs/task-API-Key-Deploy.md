# API Key Deployment & Consumption — Complete Feature

## Phase 1: Subscription Enforcement on API Key Creation
- [ ] Add subscription check middleware (`getOrgSubscription` + `canCreateApiKey`)
- [ ] Enforce `api_access` flag in POST `/api/kbs/[kbId]/api-keys`
- [ ] Enforce `max_api_keys` limit (add column to subscription_plans if needed)
- [ ] Return clear subscription upgrade error in API + UI

## Phase 2: Embeddable Widget (`clara.js`)
- [ ] Build `clara.js` — auto-injecting floating chat widget script
- [ ] Serve from `/embed/clara.js` public route
- [ ] Widget loads config via `/api/embed/config`, renders chat UI
- [ ] Support `data-key`, `data-position`, `data-theme` attributes
- [ ] Voice support toggle based on subscription

## Phase 3: Public Embed API Hardening
- [ ] Add subscription-aware rate limits to embed validation
- [ ] Add daily request quota enforcement (`max_req_day`)
- [ ] Add voice access check (`voice_enabled` plan flag)
- [ ] Add usage analytics dashboard data endpoint

## Phase 4: Integration Docs — Getting Started Guide
- [ ] Build docs layout `/docs` with sidebar navigation
- [ ] "Getting Started" page — step-by-step API key + widget setup
- [ ] "API Reference" page — chat, config, session endpoints
- [ ] "SDK / Snippets" page — copy-paste code for React, HTML, WordPress
- [ ] Interactive playground / live preview

## Phase 5: End-to-End Testing & Verification
- [ ] API key creation → subscription enforcement tests
- [ ] Widget embed integration test (browser)
- [ ] Rate limiting / quota verification
- [ ] Docs page rendering verification
