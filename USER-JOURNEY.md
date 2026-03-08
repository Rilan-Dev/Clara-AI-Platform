# Clara AI Platform — Complete User Journey & Testing Guide

> **Document Type:** QA / Tester Reference  
> **Last Updated:** March 2025  
> **Purpose:** End-to-end screen-by-screen walkthrough with exact URLs, click targets, and credentials

---

## 🔑 All Test Credentials

| Role | App | Email | Password | Notes |
|---|---|---|---|---|
| **Platform Super-Admin** | `localhost:3010` | `admin@clara.ai` | `Admin1234!` | Full access to all orgs, billing, settings |
| **Omen Insurance Admin** | `localhost:3001` | `admin@omeninsurance.com` | `Omen1234!` | Pro plan tenant |
| **TechVision Admin** | `localhost:3002` | `admin@techvision.io` | `Tech1234!` | Starter plan tenant |

> **Pre-requisite:** Run `npm run seed` in `clara-backend/` before testing. All credentials above are created by the seed script.

---

## 🌐 App URLs at a Glance

| App | Base URL | Purpose |
|---|---|---|
| Clara Backend | `http://localhost:3010` | Marketing site + Platform Admin + RAG API |
| Omen Insurance | `http://localhost:3001` | Tenant demo — sidebar chat UX |
| TechVision | `http://localhost:3002` | Tenant demo — floating widget UX |

---

---

# JOURNEY 1 — Marketing Site Visitor

> **Who:** A prospective customer discovering Clara AI for the first time  
> **App:** `localhost:3010`

---

## Screen 1.1 — Landing Page (Home)

**URL:** `http://localhost:3010/`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Nav → Logo `Clara AI` | Top-left logo | Click | Refreshes `/` |
| Nav → `Features` link | Top nav, 2nd item | Click | Scrolls to `#features` section on same page |
| Nav → `Pricing` link | Top nav, 3rd item | Click | Scrolls to `#pricing` section on same page |
| Nav → `Sign in` | Top-right, ghost text link | Click | `localhost:3010/admin/login` |
| Nav → `Get started` button | Top-right, indigo button | Click | Scrolls to `#pricing` |
| Hero → `Start free — no card needed` | Large primary CTA button | Click | Scrolls to `#pricing` |
| Hero → `See how it works` | Secondary outlined button | Click | Scrolls to `#features` section |
| Stats bar | `10M+ Queries`, `500+ Orgs`, `99.9%` | Visual only | — |
| Features section | 6 feature cards (RAG, Voice, Security…) | Hover | Card lift animation |
| How it Works | Steps 1–4 with icons | Visual only | — |
| Pricing section | Plan cards (Free / Starter / Pro / Enterprise) | See 1.2 below | — |
| Testimonials | 3 testimonial cards | Visual only | — |
| CTA section | `Get started for free` button | Click | Scrolls to `#pricing` |
| Footer → `Admin` link | Bottom-right footer link | Click | `localhost:3010/admin/login` |

---

## Screen 1.2 — Pricing Page (Full)

**URL:** `http://localhost:3010/pricing`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Billing toggle → `Monthly` | Left pill button, active by default | Click | Shows monthly prices |
| Billing toggle → `Annual (20% off)` | Right pill button | Click | Prices drop by 20% |
| Free plan → `Get started free` | Grey button on Free card | Click | `/signup?plan=free` (sign-up, not yet built) |
| Starter plan → `Get started` | Outlined indigo button | Click | `/signup?plan=starter` |
| Pro plan → `Get started` ⭐ | Indigo filled button (Most Popular badge) | Click | `/signup?plan=pro` |
| Enterprise plan → `Contact sales` | Outlined button | Click | `mailto:sales@clara.ai` |
| FAQ accordion items | `What documents can I upload?` etc. | Click to expand | Reveals answer text |
| `Back to home` or Logo | Top-left nav | Click | `localhost:3010/` |

---

---

# JOURNEY 2 — Platform Super-Admin

> **Who:** Clara AI internal admin managing all tenants  
> **App:** `localhost:3010`  
> **Credentials:** `admin@clara.ai` / `Admin1234!`

---

## Screen 2.1 — Admin Login

**URL:** `http://localhost:3010/admin/login`  
*(Also reachable via:* `localhost:3010/login` *or clicking "Sign in" in nav)*

| Element | Label / Hint | Action |
|---|---|---|
| Email field | Pre-filled: `admin@clara.ai` | Enter / confirm email |
| Password field | Placeholder: `••••••••` | Type password |
| Eye icon | Right side of password field | Click to toggle visibility |
| `Sign in` button | Full-width indigo button | Submit — redirects to `/dashboard` |
| Error state | Red text below password | Shows `Invalid credentials` on wrong password |
| Hint text | `Default: admin@clara.ai / Admin1234!` | Reference for first-time login |

**Expected redirect after login:** `http://localhost:3010/dashboard`

---

## Screen 2.2 — Dashboard Overview

**URL:** `http://localhost:3010/dashboard`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Sidebar → `Dashboard` | Active nav item (indigo highlight) | Already here | — |
| Sidebar → `Organisations` | Building icon nav link | Click | `/orgs` |
| Sidebar → `Subscriptions` | Credit card icon nav link | Click | `/subscriptions` |
| Sidebar → `Analytics` | Bar chart icon nav link | Click | `/analytics` |
| Sidebar → `Settings` | Gear icon nav link | Click | `/settings` |
| Sidebar → `← View public site` | Bottom of sidebar, small grey text | Click | `localhost:3010/` |
| Sidebar → `Sign out` | Red hover, logout icon | Click | Clears cookie → `/login` |
| `Refresh` button | Top-right, small with spin icon | Click | Re-fetches all live data |
| Tab → `Overview` | First tab pill (default active) | Click | Shows KPI cards + recent orgs |
| Tab → `Orgs` | Second tab pill | Click | Shows orgs table |
| Tab → `Subscriptions` | Third tab pill | Click | Shows MRR/ARR + revenue by plan |
| Tab → `Activity` | Fourth tab pill | Click | Shows live query feed |
| **Overview Tab** | | | |
| KPI Cards (8 cards) | Orgs, Users, MRR, ARR, KBs, Docs, Queries/Month, ARPU | Visual / live data | — |
| Plan Distribution chart | Sidebar mini-chart with progress bars | Visual | — |
| Recent Orgs list | Top 5 orgs with plan badge + status icon | Hover rows | — |
| `View all →` link | Top-right of Recent Orgs section | Click | Switches to Orgs tab |
| Recent Queries feed | Shows latest queries with org + KB label | Visual | — |
| `All activity →` | Top-right of queries section | Click | Switches to Activity tab |
| **Orgs Tab** | | | |
| Full orgs table | 9 columns: Org, Plan, Status, KBs, Users, Queries, MRR, Joined, Action | Visual | — |
| `Manage →` link | Last column of each org row | Click | `/orgs/{org-id}` |
| `Full management ↗` | Top-right of table header | Click | `/orgs` (full page) |
| **Subscriptions Tab** | | | |
| Revenue cards | MRR, ARR, Paying Orgs | Visual | — |
| Revenue by Plan table | Enterprise / Pro / Starter / Free breakdown | Visual | — |
| Plan Distribution bars | Same chart style as overview | Visual | — |
| `Manage individual org plans →` | Bottom link | Click | `/subscriptions` |
| **Activity Tab** | | | |
| Full query feed | All recent queries across all orgs | Visual / live | — |

---

## Screen 2.3 — Organisations List

**URL:** `http://localhost:3010/orgs`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Search input | `Search by name or slug…` with magnifier icon | Type to filter | Filters table client-side |
| Table rows | Name, Plan badge, Status dot, KBs, Users, Queries, Created | Visual | — |
| External link icon | Last column of each row | Click | `/orgs/{org-id}` detail page |
| Pagination `← Prev` | Bottom-left | Click | Previous page |
| Pagination `Next →` | Bottom-right | Click | Next page |
| Page info | `Showing X of Y` | Visual | — |

---

## Screen 2.4 — Organisation Detail

**URL:** `http://localhost:3010/orgs/{org-id}`  
*(e.g. `/orgs/10000000-0000-0000-0000-000000000001` for Omen)*

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| `← All Organisations` | Top breadcrumb link | Click | `/orgs` |
| Org avatar + name header | Shows initial, name, slug, plan badge, status | Visual | — |
| KPI cards | KBs, Users, Total Queries, MRR (4 cards) | Visual | — |
| **Subscription Plan section** | | | |
| Plan selector buttons | Free / Starter / Pro / Enterprise cards | Click non-active | Calls `PUT /api/orgs/subscription` |
| Active plan indicator | `✓ Active` label + indigo border | Visual | — |
| Success message | `Plan updated successfully` — green text with checkmark | Visual (fades after 3s) | — |
| **Org Info section** | | | |
| ID / Slug / Created / Plan | Read-only grid | Visual / copy | — |

---

## Screen 2.5 — Subscriptions Management

**URL:** `http://localhost:3010/subscriptions`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Revenue KPI cards | MRR / ARR / Paying Orgs / Total Orgs | Visual | — |
| Plan distribution cards | Free / Starter / Pro / Enterprise with mini progress bar | Visual | — |
| `Refresh` button | Top-right of orgs table header | Click | Reloads page |
| Org table | Org name, Current Plan badge, Status text, Change Plan buttons | Visual | — |
| Change Plan buttons | Row of plan name buttons per org | Click to switch | `PUT /api/orgs/subscription` — badge updates live |
| Active plan button | Indigo bg + `✓` check icon | Visual (disabled) | — |

---

## Screen 2.6 — Analytics

**URL:** `http://localhost:3010/analytics`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| `Refresh` button | Top-right | Click | Reloads live data |
| KPI cards | Total Queries / This Month / KBs / Docs Indexed | Visual | — |
| Plan Distribution chart | Progress bars per plan | Visual | — |
| Query Volume breakdown | All Time / This Month / Avg per KB | Visual | — |
| Platform Health panel | Response time, vector search, uptime, error rate | Visual | — |
| Status indicator | `● All systems operational` (green pulse dot) | Visual | — |
| Recent Queries feed | Live table with org + KB + timestamp | Visual | — |

---

## Screen 2.7 — Platform Settings

**URL:** `http://localhost:3010/settings`

| Element | Label / Hint | Action |
|---|---|---|
| **Platform Identity section** | Icon: Globe (indigo) | |
| Platform Name | Input, default `Clara AI` | Edit |
| Support Email | Input, default `support@clara.ai` | Edit |
| Sales Email | Input | Edit |
| Production URL | Input | Edit |
| **Authentication section** | Icon: Key (amber) | |
| Session TTL | Number input, default `7` days | Edit |
| Max failed login attempts | Number input, default `5` | Edit |
| Lockout duration | Number input, default `15` min | Edit |
| **Global Rate Limits section** | Icon: Zap (cyan) | |
| Chat req/min per org | Default `60` | Edit |
| Upload req/min per org | Default `10` | Edit |
| Voice sessions/hour | Default `10` | Edit |
| Embed req/hour per key | Default `1000` | Edit |
| **Notifications section** | Icon: Bell (pink) | |
| Alert recipient email | Input | Edit |
| Security notice | Amber warning box | Read-only info |
| `Save Settings` button | Indigo button bottom-left | Click | Shows spinner → `✓ Saved!` confirmation |

---

---

# JOURNEY 3 — Omen United Insurance Admin

> **Who:** Insurance company employee managing their AI assistant  
> **App:** `localhost:3001`  
> **Theme:** Navy (`#0a1628`) + Gold (`#c8821a`)  
> **Plan:** Pro  
> **Credentials:** `admin@omeninsurance.com` / `Omen1234!`

---

## Screen 3.1 — Login (Omen)

**URL:** `http://localhost:3001/login`  
*(Also: `http://localhost:3001/` redirects here)*

| Element | Label / Hint | Action |
|---|---|---|
| Logo + `Omen United Insurance` | Top of card | Visual |
| `Clara AI Powered` badge | Subtitle text | Visual |
| Email input | `admin@omeninsurance.com` | Enter email |
| Password input | `Omen1234!` | Enter password |
| `Sign In` button | Full-width gold/navy button | Submit — redirect to `/dashboard` |
| Error message | Red text below form | Wrong credentials |

---

## Screen 3.2 — Dashboard (Omen)

**URL:** `http://localhost:3001/dashboard`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Sidebar → `Dashboard` | Home icon, active | Already here | — |
| Sidebar → `Knowledge Bases` | Database/brain icon | Click | `/knowledge-bases` |
| Sidebar → `Chat` | Message bubble icon | Click | `/chat` |
| Sidebar → `Analytics` | Bar chart icon | Click | `/analytics` |
| Sidebar → `Settings` | Gear icon | Click | `/settings` |
| Sidebar → `Sign Out` | Logout icon, bottom | Click | Clears cookie → `/login` |
| KPI cards | Total Queries / KBs / Documents / Avg Response | Visual / live | — |
| Recent Activity list | Latest queries with KB name | Visual | — |

---

## Screen 3.3 — Knowledge Bases (Omen)

**URL:** `http://localhost:3001/knowledge-bases`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| `+ New Knowledge Base` | Top-right gold button | Click | Opens create KB modal/form |
| KB cards | `Home Insurance`, `Motor Insurance`, `Life Insurance` | Visual | — |
| KB card → document count badge | e.g. `12 docs` | Visual | — |
| KB card → `Upload Documents` button | On each card | Click | Opens file upload modal |
| File upload area | Drag-and-drop zone or `Browse files` | Drop PDF/DOCX | Triggers `/api/proxy/ingest` |
| Upload progress indicator | Progress bar appears after drop | Visual | — |

---

## Screen 3.4 — Chat (Omen)

**URL:** `http://localhost:3001/chat`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| KB selector dropdown | `Select knowledge base…` top of sidebar | Click | Shows list of available KBs |
| Message input | `Ask a question about your insurance…` | Type message + Enter | Sends to RAG API |
| Send button | Arrow icon right of input | Click | Same as Enter |
| AI response | Indigo-tinted bubble with citations `[S1]` | Visual | — |
| Citation markers | `[S1]`, `[S2]` inline in response | Visual (links to source) | — |
| 🎤 Voice button | Microphone icon (Pro plan only) | Click | Opens Voice Modal |
| Chat history | Left sidebar / conversation list | Click past conversation | Loads history |
| Clear / New chat | Top-right icon | Click | Resets conversation |

---

## Screen 3.5 — Voice Modal (Omen)

**URL:** Still on `/chat` — modal overlay  
*(Triggered by clicking the microphone button)*

| Element | Label / Hint | Action |
|---|---|---|
| Modal backdrop | Dark blur overlay | Click outside = Close |
| `Aria` avatar | Circular AI avatar with animated rings | Visual — speaking indicator |
| `Listening…` / `Speaking…` status | Animated text below avatar | Visual — state indicator |
| Live transcript | Shows your spoken words in real-time | Visual |
| AI response text | Shows what Aria is saying | Visual |
| `End Call` button | Red circle button at bottom | Click — closes modal + stops WebRTC |
| Mute button | Microphone slash icon | Click — toggles mic |

---

## Screen 3.6 — Analytics (Omen)

**URL:** `http://localhost:3001/analytics`

| Element | Label / Hint | Action |
|---|---|---|
| Date range selector | `Last 7 days` / `30 days` / `90 days` | Click to change range |
| Query volume chart | Line/bar chart of daily queries | Hover for tooltip |
| Top queries list | Most common questions ranked | Visual |
| Response time chart | Latency over time | Visual |
| KB usage breakdown | Per-KB query distribution | Visual |

---

## Screen 3.7 — Settings / Assistant Config (Omen)

**URL:** `http://localhost:3001/settings`

| Element | Label / Hint | Action |
|---|---|---|
| KB selector | `Configure for: [KB Name]` dropdown | Change to configure per-KB |
| **Identity section** | | |
| Assistant Name | Input, default `Aria` | Edit |
| Avatar/Icon | Upload image or initials | Click to upload |
| **Personality section** | | |
| System Prompt | Textarea | Edit — sets AI behaviour |
| Tone | Dropdown: `Professional / Friendly / Formal` | Select |
| Language | Dropdown: `English / Spanish / French…` | Select |
| **Appearance section** | | |
| Primary Colour | Colour picker, default `#0a1628` (navy) | Click to pick |
| Accent Colour | Colour picker, default `#c8821a` (gold) | Click to pick |
| **Voice section** | | |
| Voice AI enabled | Toggle switch (Pro plan) | Click to enable/disable |
| Voice model | Dropdown: OpenAI Realtime model | Select |
| `Save Configuration` | Gold button at bottom | Click — saves to backend |

---

---

# JOURNEY 4 — TechVision Solutions Admin

> **Who:** Tech company employee using the floating widget embed  
> **App:** `localhost:3002`  
> **Theme:** Slate (`#0f172a`) + Sky Blue (`#0ea5e9`)  
> **Plan:** Starter  
> **Credentials:** `admin@techvision.io` / `Tech1234!`

---

## Screen 4.1 — Login (TechVision)

**URL:** `http://localhost:3002/login`

| Element | Label / Hint | Action |
|---|---|---|
| `TechVision Solutions` logo | Top of card | Visual |
| Email input | `admin@techvision.io` | Enter email |
| Password input | `Tech1234!` | Enter password |
| `Sign In` button | Sky-blue button | Submit → `/dashboard` |

---

## Screen 4.2 — Dashboard (TechVision)

**URL:** `http://localhost:3002/dashboard`

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Sidebar → `Dashboard` | Home icon, active | — | — |
| Sidebar → `Knowledge Bases` | DB icon | Click | `/knowledge-bases` |
| Sidebar → `Chat` | Chat icon | Click | `/chat` |
| Sidebar → `Demo Website` | Globe/monitor icon | Click | `/demo-website` ⭐ |
| Sidebar → `Analytics` | Bar chart | Click | `/analytics` |
| Sidebar → `Sign Out` | Logout | Click | Clears cookie → `/login` |
| KPI cards | Queries / KBs / Documents | Visual / live | — |

---

## Screen 4.3 — Knowledge Bases (TechVision)

**URL:** `http://localhost:3002/knowledge-bases`

| Element | Label / Hint | Action |
|---|---|---|
| KB cards | `Product Documentation`, `Engineering Handbook` | Visual |
| `Upload Documents` | Button on each card | Click — file upload |
| Starter plan notice | Warning if limit reached | Visual |

---

## Screen 4.4 — Chat Page (TechVision)

**URL:** `http://localhost:3002/chat`

> ⚠️ **TechVision uses floating widget UX** — the `/chat` page directs users to use the floating button instead of an embedded sidebar.

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Available KBs list | Shows `Product Docs` + `Engineering Handbook` | Visual | — |
| `Click the floating button ↘` prompt | Large instructional text | Visual hint | — |
| `Go to Demo Website →` button | Sky-blue button | Click | `/demo-website` |

---

## Screen 4.5 — Demo Website (Floating Widget) ⭐

**URL:** `http://localhost:3002/demo-website`

> This is the **flagship demo** — shows how Clara AI embeds into any website.

| Element | Label / Hint | Action | Leads To |
|---|---|---|---|
| Mock TechVision website | Hero section, features, nav etc. | Visual context | — |
| `💬` floating button | Bottom-right corner, sky-blue circle with chat icon | Click | Opens chat panel |
| **Chat Panel (open state)** | | | |
| Panel header | `Sage — TechVision AI` with avatar + close `×` | `×` to close | Closes panel |
| KB selector | Dropdown at top of panel | Click | Switch between KBs |
| Message input | `Ask a question…` | Type + Enter | Sends to RAG API via proxy |
| AI response | Citation-backed response | Visual | — |
| `🎤` Voice button | Mic icon (if voice enabled on plan) | Click | Opens Voice Modal |
| Minimize `—` | Top-right of panel | Click | Collapses to floating button |
| Panel resize handle | Bottom-left drag corner | Drag | Resize panel |

---

## Screen 4.6 — Analytics (TechVision)

**URL:** `http://localhost:3002/analytics`

Same structure as Omen Analytics — scoped to TechVision's org data.

---

---

# JOURNEY 5 — Embed API (Developer)

> **Who:** A developer integrating Clara AI into their own website  
> **Source:** Backend API at `localhost:3010`

---

## Screen 5.1 — Get API Key (in Omen or TechVision portal)

**URL:** `localhost:3001/settings` or `localhost:3002/settings`

| Element | Label / Hint | Action |
|---|---|---|
| **API Keys section** | In Settings page | |
| `Generate API Key` button | Within settings, API section | Click — calls `POST /api/kbs/{kbId}/api-keys` |
| Generated key display | Shown once, copy immediately | Click `Copy` icon |
| Key list | Previous keys with creation date | Visual |
| Revoke button | Red trash icon per key | Click — invalidates key |

---

## Screen 5.2 — Embed Widget (Public)

**URL:** `http://localhost:3010/embed/widget?kbId={kb-id}&orgId={org-id}`

This URL is what developers embed in an iFrame.

| Element | Label / Hint | Action |
|---|---|---|
| Branded chat UI | Org colours + assistant name | Visual |
| Message input | Chat input at bottom | Type + Enter |
| AI response | Streamed with citations | Visual |

---

---

# JOURNEY 6 — API Health & Status Checks

> **Who:** DevOps / QA verifying services are running

| Check | URL | Expected Response |
|---|---|---|
| Backend health | `GET http://localhost:3010/api/health` | `{"status":"ok","db":"connected","qdrant":"connected"}` |
| Platform stats | `GET http://localhost:3010/api/platform/stats` | JSON with `totalOrgs`, `mrr`, etc. |
| Plans list | `GET http://localhost:3010/api/subscriptions/plans` | `{"plans":[{id:"free"...},{id:"starter"...}...]}` |
| Revenue data | `GET http://localhost:3010/api/platform/revenue` | `{"totalMrr":...,"planDist":...}` |
| Orgs list | `GET http://localhost:3010/api/platform/orgs` | `{"orgs":[...],"total":2}` |

---

---

# Complete Route Map

## `localhost:3010` — Clara Backend

```
/ ...................... Marketing landing page
/features .............. Features detail page
/pricing ............... Full pricing page with toggle
/contact ............... Contact form

/login ................. Admin login (alias for /admin/login)
/admin/login ........... Super-admin login form
/dashboard ............. Super-admin dashboard (protected)
/orgs .................. Organisations list (protected)
/orgs/[id] ............. Organisation detail + plan management (protected)
/subscriptions ......... Subscription & billing management (protected)
/analytics ............. Platform analytics (protected)
/settings .............. Platform configuration (protected)

/embed/widget .......... Public embeddable chat widget (iFrame target)

/api/auth/login ........ POST — authenticate user
/api/auth/logout ....... POST — sign out
/api/auth/me ........... GET  — current user info
/api/auth/register ..... POST — create new user
/api/subscriptions/plans GET  — list all plans (public)
/api/platform/stats .... GET  — super-admin stats
/api/platform/orgs ..... GET  — paginated org list
/api/platform/revenue .. GET  — MRR/ARR breakdown
/api/orgs/subscription . PUT  — change org plan
/api/kbs/[kbId] ........ GET/PUT/DELETE — knowledge base CRUD
/api/kbs/[kbId]/documents GET/POST — documents
/api/kbs/[kbId]/config . GET/PUT — assistant config
/api/kbs/[kbId]/api-keys GET/POST — API key management
/api/chat .............. POST — streamed RAG chat
/api/embed/chat ........ POST — public embed chat (API key auth)
/api/embed/config ...... GET  — public widget config
/api/realtime/session .. POST — OpenAI Realtime ephemeral token
/api/health ............ GET  — service health check
/api/ingest ............ POST — document upload + processing
```

## `localhost:3001` — Omen Insurance

```
/ ...................... Redirects to /login
/login ................. Tenant login form
/dashboard ............. Tenant dashboard (protected)
/knowledge-bases ....... KB list + upload (protected)
/chat .................. Sidebar chat interface (protected)
/analytics ............. Usage analytics (protected)
/settings .............. Assistant configuration (protected)

/api/auth .............. POST/DELETE — auth proxy to backend
```

## `localhost:3002` — TechVision

```
/ ...................... Redirects to /login
/login ................. Tenant login form
/dashboard ............. Tenant dashboard (protected)
/knowledge-bases ....... KB list + upload (protected)
/chat .................. Floating widget instructions page (protected)
/demo-website .......... Mock website with embedded floating button (protected)
/analytics ............. Usage analytics (protected)

/api/auth .............. POST/DELETE — auth proxy to backend
```

---

---

# Quick-Start Test Checklist

Use this to verify the full system works end-to-end after `npm run seed`:

```
□ 1.  Visit localhost:3010 — landing page loads with dark theme
□ 2.  Click "Pricing" nav — scrolls smoothly to pricing cards
□ 3.  Visit localhost:3010/admin/login — login form appears
□ 4.  Login: admin@clara.ai / Admin1234! — redirects to /dashboard
□ 5.  Dashboard loads live stats (not dashes/loading spinners stuck)
□ 6.  Click "Orgs" tab — Omen + TechVision rows visible
□ 7.  Click "Manage →" on Omen row — org detail page loads
□ 8.  Change Omen plan from Pro → Starter → back to Pro — success message appears
□ 9.  Click "Subscriptions" tab — MRR/ARR shows numbers > $0
□ 10. Click "Analytics" in sidebar — KPI cards load
□ 11. Click "Settings" — form renders, Save button works
□ 12. Visit localhost:3001 — redirects to /login
□ 13. Login: admin@omeninsurance.com / Omen1234! — navy dashboard loads
□ 14. Click "Knowledge Bases" — 3 KBs listed (Home / Motor / Life Insurance)
□ 15. Click "Chat" — sidebar chat interface loads
□ 16. Select a KB from dropdown, type a message, press Enter — AI responds
□ 17. Click microphone icon — Voice Modal opens (Pro plan)
□ 18. Say "What does my policy cover?" — transcription + AI voice response
□ 19. Click "Analytics" — charts load with seeded data
□ 20. Click "Settings" — assistant config form with Aria's name + colours
□ 21. Visit localhost:3002 — redirects to /login
□ 22. Login: admin@techvision.io / Tech1234! — slate dashboard loads
□ 23. Click "Demo Website" — mock site loads with floating button in corner
□ 24. Click 💬 floating button — chat panel slides open
□ 25. Type a question — Sage AI responds with citations
□ 26. Click × to close panel — collapses back to floating button
□ 27. Visit localhost:3010/api/health — returns {"status":"ok"}
```

---

---

# Troubleshooting Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard shows all `—` / loading forever | Seed not run | `cd clara-backend && npm run seed` |
| Login fails with `Invalid credentials` | Wrong credentials or DB not seeded | Re-run seed, check email/password above |
| `relation "subscription_plans" does not exist` | Migrations not run | Restart `npm run dev` (auto-runs migrations) |
| Floating button not appearing | TechVision app not running | `cd clara-techvision && npm run dev` |
| Voice modal button is disabled | Org not on Pro/Enterprise plan | Change plan in super-admin → `/subscriptions` |
| Omen chat returns 500 | Backend not running on 3010 | Check `localhost:3010/api/health` |
| Pricing page shows "Loading plans…" | Backend not running | Start `clara-backend` first |
| Redirect loop on `/dashboard` | AUTH_SECRET missing in `.env` | Add `AUTH_SECRET=any-long-random-string` to `.env.local` |

---

*Document generated for Clara AI Platform v1.0 — Internal QA Use*
