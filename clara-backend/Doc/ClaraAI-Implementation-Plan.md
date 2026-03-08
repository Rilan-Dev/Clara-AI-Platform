**CLARA AI PLATFORM**

Production-Grade Implementation Plan

Multi-Tenant RAG + Voice AI · Enterprise SaaS Architecture

Revision 1.0 · March 2025 · For Internal Planning Use

**Executive Summary**

This document defines the complete production-grade implementation plan
for the Clara AI Platform --- a multi-tenant SaaS system that allows any
business to deploy a customised AI knowledge assistant powered by
Retrieval-Augmented Generation (RAG) and real-time voice AI.

The plan addresses five specific issues identified during the current
sprint review:

**✓** Merging the Platform Admin into Clara-AI-RAG as a single unified
application

**✓** Separating demo tenant projects into independent, deployable
repositories

**✓** Replacing all static/mock data with live database-driven content

**✓** Differentiating the two demo tenant UX approaches (floating widget
vs. embedded sidebar)

**✓** Consolidating all projects into a single organised working
directory

The work is structured into 7 sequential phases. Each phase is
independently testable and deployable. The total estimated scope is
8--10 weeks of focused engineering time.

  ----------------------------------------------------------------------------
  **Application**          **URL**               **Tech        **Purpose**
                                                 Stack**       
  ------------------------ --------------------- ------------- ---------------
  Clara AI Backend + Admin localhost:3010 (dev)  Next.js 15 ·  Core RAG
                           / api.clara.ai (prod) PostgreSQL ·  engine, admin
                                                 Qdrant ·      UI, platform
                                                 OpenAI        management,
                                                               subscriptions

  Omen United Insurance    localhost:3001 (dev)  Next.js 15 ·  Tenant demo ---
                           / omen.clara.ai       Tailwind ·    insurance
                           (prod)                Clara API     industry,
                                                               sidebar chat UX

  TechVision Solutions     localhost:3002 (dev)  Next.js 15 ·  Tenant demo ---
                           / techvision.clara.ai Tailwind ·    tech industry,
                           (prod)                Clara Embed   floating
                                                               widget + voice
                                                               popup
  ----------------------------------------------------------------------------

**Current State Audit**

**1.1 What Exists Today**

The following repositories and their current status:

  -----------------------------------------------------------------------------------------------------------
  **Project**                  **Path**                                   **Status**   **Issue**
  ---------------------------- ------------------------------------------ ------------ ----------------------
  Clara-AI-RAG                 Workpace/Clara-AI-RAG                      ✓ Working    Needs to move to 3010;
                                                                          --- port     missing public
                                                                          3001         marketing &
                                                                                       subscription pages

  Clara-Suite/platform         Workpace/Clara-Suite/apps/platform         ⚠ Scaffold   Static mock data only;
                                                                          only         must be merged INTO
                                                                                       Clara-AI-RAG

  Clara-Suite/omen-insurance   Workpace/Clara-Suite/apps/omen-insurance   ⚠ Scaffold   All data is hardcoded;
                                                                          only         must become standalone
                                                                                       repo at 3001

  Clara-Suite/test-org         Workpace/Clara-Suite/apps/test-org         ⚠ Scaffold   Same design as
                                                                          only         omen-insurance; must
                                                                                       use floating widget UX
  -----------------------------------------------------------------------------------------------------------

**1.2 Database Schema (Already Implemented)**

Clara-AI-RAG already has 5 database migrations in PostgreSQL covering:

- 001_foundation.sql --- organisations, projects, knowledge_bases,
  assistant_configs

- 002_users_rbac.sql --- users, roles, permissions, org_members,
  sessions, audit_logs

- 003_documents_queue.sql --- documents, processing queue, chunks

- 004_phase4.sql --- analytics, query_events, kb configuration snapshots

- 005_api_keys.sql --- api_keys, api_key_usage for embed authentication

> **⚠ Note:** A new migration 006_subscriptions.sql must be added to
> support subscription plans, billing, and plan-based feature gating.

**1.3 Issues Being Resolved**

**Issue 1 --- Fragmented Platform & Admin**

The marketing/platform site in Clara-Suite/apps/platform is a separate
standalone app from Clara-AI-RAG. This creates two problems: (a)
duplication of the authentication system, (b) the platform admin cannot
inspect or manage the actual database that Clara-AI-RAG operates
against. The fix is to migrate all platform pages into Clara-AI-RAG
itself, which already has the full admin UI, auth system, and database
access.

**Issue 2 --- Tenant Demos Trapped in Monorepo**

Both tenant demo apps (omen-insurance and test-org) currently live
inside Clara-Suite --- a Turborepo monorepo --- which cannot be
independently deployed to Vercel, Railway, or any other platform without
complex build configuration. Each client-facing demo needs to be its own
Git repository with its own package.json, deployable with a single \'npm
run build\'.

**Issue 3 --- Static / Mock Data Everywhere**

Every dashboard, knowledge base list, analytics panel, and usage meter
in both demo apps is hardcoded with fake data arrays. This means demos
are not convincing and break as soon as a live API is called. All data
must be fetched from Clara-AI-RAG\'s REST API in real-time, including
live streaming chat.

**Issue 4 --- Identical UX Across Both Demos**

Both tenant apps use the same sidebar-style chat layout. For a
compelling demo to different client types, Omen Insurance should keep
the integrated sidebar chat (showing how an internal staff portal
works), while TechVision should use the Clara floating button widget
(showing how a customer-facing website embed works with a pop-up voice
modal), mirroring how a real customer would install Clara on their own
website.

**Issue 5 --- Scattered Directory Structure**

Projects are spread across Clara-AI-RAG/, Clara-Suite/, and potentially
others. All production projects should live in a single, organised root
directory --- clara-platform/ --- making it trivial to find, run, and
deploy anything.

**Target Directory Structure**

After all phases are complete, the following structure will be in place.
Each project is an independent Git repository. Only clara-backend is
shared infrastructure.

> clara-platform/ ← Root working directory (no package.json here)
>
> ├── clara-backend/ ← Port 3010 (Clara-AI-RAG + merged Platform Admin)
>
> │ ├── src/
>
> │ │ ├── app/
>
> │ │ │ ├── (admin)/ ← Admin panel (KBs, orgs, docs, settings)
>
> │ │ │ ├── (platform)/ ← Marketing site (landing, pricing, blog)
>
> │ │ │ ├── api/ ← All REST endpoints
>
> │ │ │ ├── embed/ ← Embeddable widget page + JS loader
>
> │ │ │ └── workspace/ ← Internal AI workspace
>
> │ │ ├── modules/ ← Business logic (unchanged)
>
> │ │ └── lib/ ← DB, migrations, utils
>
> │ ├── .env
>
> │ └── package.json
>
> │
>
> ├── clara-omen-insurance/ ← Port 3001 (Omen United Insurance demo)
>
> │ ├── src/
>
> │ │ ├── app/
>
> │ │ │ ├── (auth)/login/ ← Insurance-branded login
>
> │ │ │ ├── (portal)/ ← Protected: dashboard, KBs, chat, analytics
>
> │ │ │ └── api/ ← Proxy routes to clara-backend
>
> │ │ ├── components/ ← Insurance-specific components
>
> │ │ └── lib/ ← API client, auth utils
>
> │ ├── .env.local
>
> │ └── package.json
>
> │
>
> ├── clara-techvision/ ← Port 3002 (TechVision Solutions demo)
>
> │ ├── src/
>
> │ │ ├── app/
>
> │ │ │ ├── (auth)/login/
>
> │ │ │ ├── (portal)/ ← Dashboard + KB management only
>
> │ │ │ └── api/ ← Proxy routes
>
> │ │ ├── components/
>
> │ │ │ ├── FloatingClaraButton/ ← Floating AI button (Clara widget)
>
> │ │ │ └── VoiceModal/ ← Voice AI popup (from Clara-AI-RAG)
>
> │ │ └── lib/
>
> │ ├── .env.local
>
> │ └── package.json
>
> │
>
> └── START-ALL.bat / START-ALL.sh ← One-click launcher for all 3

**Implementation Phases**

Work is divided into 7 phases. Each phase has clear entry and exit
criteria. No phase begins until the previous phase passes its acceptance
tests.

+-------------------------------------------+:----------:+:----------:+
| **PHASE 0**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Directory Reorganisation & Project      | **1--2     | **LOW**    |
| Scaffolding**                             | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Create the target directory layout, set up three independent Git repos,
and configure each with the correct ports, package names, and .env
structures. No code logic changes in this phase --- only structure.

**Tasks**

- Create /clara-platform/ root directory in Workpace/

- Copy Clara-AI-RAG/ → clara-platform/clara-backend/

- Create clara-platform/clara-omen-insurance/ as a new Next.js 15
  project (npx create-next-app)

- Create clara-platform/clara-techvision/ as a new Next.js 15 project

- Delete Clara-Suite/ monorepo (all useful content will be migrated by
  hand)

- Initialise separate Git repositories in each of the three project
  folders

- Write root START-ALL.bat and START-ALL.sh launcher scripts

**Port Assignments**

  ------------------------------------------------------------------------
  **Project**              **Dev Port**    **Env Variable**
  ------------------------ --------------- -------------------------------
  clara-backend            3010            PORT=3010 in .env

  clara-omen-insurance     3001            next dev -p 3001

  clara-techvision         3002            next dev -p 3002
  ------------------------------------------------------------------------

**Environment Variables --- clara-backend**

> PORT=3010
>
> DATABASE_URL=postgresql://\...
>
> QDRANT_URL=https://\...
>
> QDRANT_API_KEY=\...
>
> OPENAI_API_KEY=sk-\...
>
> GEMINI_API_KEY=\...
>
> AUTH_SECRET=\...
>
> ADMIN_USERNAME=admin
>
> ADMIN_PASSWORD=\...
>
> NEXT_PUBLIC_APP_URL=http://localhost:3010

**Environment Variables --- Tenant Apps**

> CLARA_BACKEND_URL=http://localhost:3010
>
> CLARA_ORG_ID=\<uuid from database\>
>
> CLARA_ORG_SLUG=omen-insurance \# or techvision
>
> NEXT_PUBLIC_ORG_NAME=Omen United Insurance
>
> NEXT_PUBLIC_PLAN=pro \# for feature gating in UI
>
> NEXT_PUBLIC_PRIMARY_COLOUR=#0a1628

**Acceptance Criteria**

**✓** All 3 project directories exist with correct package.json names
and port scripts

**✓** Each can run independently via npm run dev on correct port

**✓** START-ALL launches all 3 simultaneously

**✓** Clara-backend connects to database and Qdrant without errors

+-------------------------------------------+:----------:+:----------:+
| **PHASE 1**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Subscription System --- Database &      | **3--4     | **MEDIUM** |
| Backend**                                 | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Add subscription plans to the database. Create backend API endpoints to
read, update, and gate features based on plan limits. This is the
foundation that every subsequent phase depends on.

**New Migration: 006_subscriptions.sql**

Create the following tables in PostgreSQL:

> CREATE TABLE subscription_plans (
>
> id TEXT PRIMARY KEY, \--
> \'free\'\|\'starter\'\|\'pro\'\|\'enterprise\'
>
> name TEXT NOT NULL,
>
> price_usd INTEGER NOT NULL DEFAULT 0,
>
> max_kbs INTEGER NOT NULL DEFAULT 1, \-- -1 = unlimited
>
> max_docs_per_kb INTEGER NOT NULL DEFAULT 10,
>
> max_req_day INTEGER NOT NULL DEFAULT 100,
>
> max_storage_mb INTEGER NOT NULL DEFAULT 100,
>
> voice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
>
> api_access BOOLEAN NOT NULL DEFAULT FALSE,
>
> custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
>
> sso_enabled BOOLEAN NOT NULL DEFAULT FALSE,
>
> analytics_level TEXT NOT NULL DEFAULT \'basic\',
>
> created_at TIMESTAMPTZ NOT NULL DEFAULT now()
>
> );
>
> CREATE TABLE org_subscriptions (
>
> id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>
> org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
>
> plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
>
> status TEXT NOT NULL DEFAULT \'active\'
>
> CHECK (status IN (\'active\',\'trialing\',\'past_due\',\'canceled\')),
>
> current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
>
> current_period_end TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL \'1
> month\',
>
> cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
>
> stripe_subscription_id TEXT,
>
> created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
>
> updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
>
> UNIQUE (org_id)
>
> );

**Plan Seed Data**

  -------------------------------------------------------------------------------------------
  **Plan ID**  **Price**   **KBs**   **Docs/KB**   **Requests/Day**   **Voice**   **API
                                                                                  Access**
  ------------ ----------- --------- ------------- ------------------ ----------- -----------
  free         \$0/mo      1         10            100                No          No

  starter      \$49/mo     3         50            1,000              Yes         Yes

  pro          \$149/mo    10        200           10,000             Yes         Yes

  enterprise   Custom      ∞         ∞             ∞                  Yes         Yes
  -------------------------------------------------------------------------------------------

**New API Endpoints**

  ---------------------------------------------------------------------------------------------
  **Method**   **Route**                             **Description**
  ------------ ------------------------------------- ------------------------------------------
  GET          /api/subscriptions/plans              List all plans (public)

  GET          /api/orgs/:orgId/subscription         Get org\'s current subscription + limits

  PUT          /api/orgs/:orgId/subscription         Update plan (admin only)

  GET          /api/orgs/:orgId/subscription/usage   Daily usage stats (requests used today, KB
                                                     count, doc count)

  POST         /api/subscriptions/checkout           Initiate Stripe checkout session

  POST         /api/webhooks/stripe                  Stripe webhook handler (future)
  ---------------------------------------------------------------------------------------------

**Plan Enforcement Middleware**

Create src/lib/plan-guard.ts --- a server-side utility that any API
route calls before performing a restricted action:

> export async function guardPlan(orgId: string, action: PlanAction):
> Promise\<void\>
>
> // Actions: \'create_kb\' \| \'upload_doc\' \| \'make_request\' \|
> \'use_voice\' \| \'use_api_key\'
>
> // Throws PlanLimitError with HTTP 402 status if limit exceeded

**Acceptance Criteria**

**✓** Migration 006 runs without error on existing database

**✓** Seed data inserts all 4 plans

**✓** GET /api/subscriptions/plans returns correct JSON

**✓** Plan guard blocks KB creation when org is at limit

**✓** Existing functionality (chat, upload, voice) is unaffected

+-------------------------------------------+:----------:+:----------:+
| **PHASE 2**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Platform Marketing Site --- Merge Into  | **4--5     | **MEDIUM** |
| clara-backend**                           | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Migrate all public-facing marketing pages (currently in
Clara-Suite/apps/platform) into clara-backend as a dedicated route
group. The marketing site shares the same Next.js app as the admin panel
but lives under separate route groups with separate layouts.

**Route Group Architecture**

Next.js 15 route groups (parentheses folders) allow different layouts
without affecting the URL:

> src/app/
>
> ├── (platform)/ ← Public marketing --- no auth required
>
> │ ├── layout.tsx ← Marketing nav + footer
>
> │ ├── page.tsx ← Landing page (/)
>
> │ ├── pricing/page.tsx ← Pricing table (/pricing)
>
> │ ├── features/page.tsx ← Features detail (/features)
>
> │ └── contact/page.tsx ← Contact/demo request (/contact)
>
> ├── (admin)/ ← Protected admin --- requires auth
>
> │ ├── layout.tsx ← Admin sidebar layout
>
> │ ├── login/page.tsx ← Admin login (/login)
>
> │ ├── dashboard/page.tsx ← Platform super-admin (/dashboard)
>
> │ ├── orgs/\... ← Org management
>
> │ └── subscriptions/\... ← Subscription management
>
> ├── (workspace)/ ← Existing workspace (unchanged)
>
> └── api/ ← All API routes (unchanged)

**Platform Landing Page --- Dynamic Content**

The pricing section of the landing page must NOT use hardcoded plan
data. It must fetch from the database:

> // src/app/(platform)/pricing/page.tsx --- Server Component
>
> const plans = await fetch(\'/api/subscriptions/plans\');
>
> // Renders plan cards dynamically --- adding a new plan in DB
> auto-appears on site

**Platform Super-Admin Dashboard --- Dynamic Data**

The admin dashboard at /dashboard must display live data from the
database. All MOCK_ORGS arrays must be replaced:

  ------------------------------------------------------------------------
  **Dashboard        **Was (Static)**   **Becomes (Dynamic)**
  Widget**                              
  ------------------ ------------------ ----------------------------------
  Total              Hardcoded \'47\'   SELECT COUNT(\*) FROM
  Organisations                         organisations

  Monthly Revenue    Hardcoded          SUM of active subscription prices
                     \'\$8,420\'        

  Organisation Table MOCK_ORGS array    JOIN orgs + subscriptions + usage

  Plan Distribution  Hardcoded          GROUP BY plan_id on
                     percentages        org_subscriptions

  Recent Activity    None               audit_logs last 50 entries
  ------------------------------------------------------------------------

**New Admin API Routes (Platform Level)**

  ----------------------------------------------------------------------------
  **Route**                            **Returns**
  ------------------------------------ ---------------------------------------
  /api/platform/stats                  Total orgs, users, MRR, total queries

  /api/platform/orgs                   Paginated org list with plan + usage

  /api/platform/revenue                MRR, ARR, churn by plan breakdown

  /api/platform/orgs/:id/impersonate   Admin session for any org (super-admin
                                       only)
  ----------------------------------------------------------------------------

**Acceptance Criteria**

**✓** GET / (localhost:3010) serves the marketing landing page

**✓** GET /pricing shows live plan data fetched from database

**✓** GET /dashboard (admin) shows live org count and MRR from database

**✓** GET /admin/kbs/\... (existing admin) continues to work unchanged

**✓** Login page at /login redirects to /dashboard on success

+-------------------------------------------+:----------:+:----------:+
| **PHASE 3**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Omen United Insurance --- Full Dynamic  | **5--6     | **MEDIUM** |
| Tenant App**                              | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Transform clara-omen-insurance from a static scaffold into a fully
dynamic, production-ready tenant application. All data comes from
clara-backend\'s REST API. The UX is an integrated sidebar chat ---
appropriate for an internal staff portal where employees query insurance
policy documents.

**Application Identity**

  -----------------------------------------------------------------------
  **Property**       **Value**
  ------------------ ----------------------------------------------------
  App Name           Omen United Insurance --- AI Portal

  Colour Scheme      Deep Navy (#0a1628) + Gold (#c8821a)

  Target Users       Insurance staff (internal portal)

  Chat UX            Integrated sidebar --- chat is always visible
                     alongside content

  AI Features        Text chat with citations, voice popup modal,
                     document upload (Pro plan)

  Subscription       Pro Plan --- seeded at startup via CLARA_ORG_ID env
                     variable
  -----------------------------------------------------------------------

**Authentication System**

Omen Insurance uses its own session-based auth backed by
clara-backend\'s user system:

> POST /api/auth/login → clara-backend validates credentials
>
> → Returns JWT token stored in httpOnly cookie
>
> GET /api/auth/me → Returns current user + org membership + plan
>
> POST /api/auth/logout → Clears session

Next.js middleware (middleware.ts) protects all routes under /(portal)/
and redirects unauthenticated users to /login.

**Dynamic Data Endpoints Used**

  ------------------------------------------------------------------------
  **Page**      **Data Source**    **Endpoint**
  ------------- ------------------ ---------------------------------------
  Dashboard     KBs summary        GET /api/kbs/all?orgId=CLARA_ORG_ID

  Dashboard     Requests today     GET /api/orgs/:id/subscription/usage

  Dashboard     Recent queries     GET /api/kbs/:id/analytics?limit=10

  Knowledge     KB list + doc      GET /api/kbs/all?orgId=\...
  Bases         counts             

  KB Detail     Documents list     GET /api/kbs/:id/documents

  AI Chat       Streaming response POST /api/chat (NDJSON stream)

  AI Chat       Voice session      POST /api/realtime/session

  Analytics     Query events       GET /api/kbs/:id/analytics?range=30d

  Settings      Org + assistant    GET /api/kbs/:id/assistant-config
                config             

  API Keys      Embed keys         GET /api/kbs/:id/api-keys
  ------------------------------------------------------------------------

**Page Breakdown with Dynamic Components**

**Dashboard (/dashboard)**

- Stats row: KBs used / plan limit (dynamic), requests today / daily
  limit (dynamic), docs ready (dynamic), avg latency (from analytics)

- Knowledge bases table: fetched live, showing real doc counts and
  processing status with polling

- Recent queries list: last 10 query_events from analytics database

- Usage bar: today\'s requests vs plan daily limit --- turns amber at
  80%, red at 95%

- Quick actions: links to KB management, chat, voice, analytics

**Knowledge Bases (/knowledge-bases)**

- Full CRUD: Create KB (POST /api/kbs), rename, archive, delete

- Per-KB: document list with status badges (pending / processing / ready
  / failed)

- Upload zone: drag-and-drop or click to upload PDFs/DOCX/TXT (POST
  /api/kbs/:id/documents/upload)

- Reprocess button: re-triggers failed documents

- AI Configure tab: edit assistant name, system prompt, voice, colours
  (PUT /api/kbs/:id/assistant-config)

- Deploy tab: API key management with embed snippet generator (existing
  ApiKeysManager component)

- Plan guard: \'Create KB\' button is disabled with tooltip if at plan
  limit

**AI Chat Workspace (/chat)**

- KB selector sidebar: lists all KBs from database, highlights active
  one

- Chat window: full streaming responses with \[S1\],\[S2\] source
  citations

- Voice button: opens VoiceModal (ported from Clara-AI-RAG\'s
  VoiceChatModal)

- Session persistence: conversation stored in React state, cleared on KB
  switch

- Fallback: if backend unreachable, shows friendly error with retry
  button

**Analytics (/analytics)**

- Total queries (all time + this week) from query_events table

- Daily chart: 30-day query volume bar chart

- Top queries: most frequent query texts

- Average latency and source count trends

- Per-KB breakdown table

**Acceptance Criteria**

**✓** Login with real credentials from users table in database

**✓** Dashboard stats reflect real database row counts

**✓** Upload a PDF --- see it appear in document list, status change to
\'ready\'

**✓** Send a chat message --- get real streaming response from
clara-backend

**✓** Analytics page shows real query_events data

**✓** Plan limit: attempting KB creation beyond plan limit shows error

+-------------------------------------------+:----------:+:----------:+
| **PHASE 4**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **TechVision Solutions --- Floating       | **4--5     | **MEDIUM** |
| Widget + Voice AI Demo**                  | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Build clara-techvision as a fundamentally different demo experience from
Omen Insurance. Instead of an integrated sidebar, TechVision\'s website
shows a floating Clara AI button in the bottom-right corner (like a
customer-facing chatbot widget), which opens a chat panel. Voice is
shown as a dedicated voice popup modal. This demonstrates how any
company can add Clara to their public website with minimal effort.

**UX Architecture --- Two Layers**

  -------------------------------------------------------------------------
  **Layer**   **Component**         **Source**          **Description**
  ----------- --------------------- ------------------- -------------------
  Portal /    Standard dashboard +  New (similar to     Internal management
  Dashboard   KB management         Omen but            panel for
                                    tech-branded)       TechVision staff

  Website     Floating Clara        Ported from         Simulates how
  Demo        Button + Chat Panel   Clara-AI-RAG        TechVision\'s
                                    embed/widget        website visitors
                                                        use AI

  Website     Voice AI Modal        Ported from         Pop-up voice
  Demo                              Clara-AI-RAG        assistant on the
                                    VoiceChatModal      floating button
  -------------------------------------------------------------------------

**Floating Button Component**

The FloatingClaraButton component lives in
src/components/FloatingClaraButton.tsx and is rendered on every page in
the TechVision portal layout. It reads the active KB\'s embed API key
from the NEXT_PUBLIC environment:

> // Floats bottom-right, always visible
>
> // Expanded: shows a chat panel (same streaming as embed widget)
>
> // Header: has a \'Voice\' button → opens VoiceModal
>
> // Collapsed: shows animated Clara icon button with pulse ring
>
> // State persists across page navigation (renders in root layout)

**Voice AI Popup Modal**

The VoiceModal component is a direct port of the existing VoiceChatModal
from Clara-AI-RAG. It connects to POST /api/realtime/session on
clara-backend and establishes a WebRTC audio stream via OpenAI Realtime
API. The modal shows:

- Animated waveform visualiser when AI is speaking

- Transcript panel showing conversation history

- Mute button and end call button

- KB selector (user can switch which knowledge base the voice talks to)

**Application Identity**

  -----------------------------------------------------------------------
  **Property**       **Value**
  ------------------ ----------------------------------------------------
  App Name           TechVision Solutions --- AI Portal

  Colour Scheme      Slate (#1e293b) + Sky Blue (#0ea5e9)

  Target Users       Tech company staff + website visitors via widget

  Chat UX            Floating bottom-right button widget (customer-facing
                     style)

  Voice UX           Popup modal over any page

  Subscription       Starter Plan --- voice enabled, 3 KBs, 1,000
                     requests/day
  -----------------------------------------------------------------------

**Dynamic Data --- Same Pattern as Omen**

TechVision uses the same API endpoints as Omen Insurance but connects to
a different CLARA_ORG_ID. The only difference is the UI and the floating
widget component. The KB list, document uploads, and chat all work
identically.

**Demo Website Page**

Add a special /demo-website page to TechVision that renders a fake
company landing page with real product content, so clients can see the
floating Clara button in a realistic context:

> // /demo-website --- looks like a real product website
>
> // Has: hero section, features, testimonials
>
> // Floating Clara button sits in corner
>
> // Clicking opens chat: \'Hi! I\'m Clara, TechVision\'s AI
> assistant\...\'
>
> // Voice button opens voice modal

**Acceptance Criteria**

**✓** Floating button appears on every page bottom-right

**✓** Clicking button opens chat panel with live streaming responses
from clara-backend

**✓** Voice button in chat panel opens VoiceModal with working WebRTC
audio

**✓** Dashboard shows real KB count, request usage from database

**✓** Demo website page renders convincing landing page context

**✓** Starter plan limits displayed correctly (3/3 KBs, 1K req/day)

+-------------------------------------------+:----------:+:----------:+
| **PHASE 5**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Production Data Seeding & Demo          | **2--3     | **LOW**    |
| Content**                                 | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Create deterministic seed scripts that populate the database with
realistic demo data for both orgs. This allows any developer to clone,
run npm run seed, and have a fully functional demo immediately --- no
manual data entry required.

**Seed Script: scripts/seed-demo.ts**

This script is idempotent (safe to run multiple times). It creates:

**Platform Level**

- 4 subscription plans (free, starter, pro, enterprise) --- plan data

- 2 demo organisations: Omen United Insurance + TechVision Solutions

- Admin user: admin@clara.ai / Admin1234! with is_super_admin = true

- Org-level admin users: omen-admin@omeninsurance.com /
  techvision-admin@techvision.io

**Omen United Insurance (Pro Plan)**

- 1 default project: \'Omen Insurance Operations\'

- 3 pre-created Knowledge Bases: Home Insurance Policies, Motor
  Insurance 2024, Life & Health Plans

- Assistant configs for each KB: name=\'Aria\', colour=navy/gold, system
  prompt tailored to insurance

- Sample documents (PDFs from /public/seed-docs/omen/) uploaded and
  processed

- 500 synthetic query_events spread over the last 30 days for realistic
  analytics

**TechVision Solutions (Starter Plan)**

- 1 default project: \'TechVision Product Team\'

- 2 Knowledge Bases: Product Documentation, Engineering Runbooks

- Assistant config: name=\'Sage\', colour=slate/sky, technical tone
  system prompt

- Sample documents (MDX/PDF tech docs) uploaded and processed

- 200 synthetic query_events for the last 30 days

**Sample Documents (Included in Repo)**

  ------------------------------------------------------------------------------------------
  **Document**                        **KB**             **Format**   **Content**
  ----------------------------------- ------------------ ------------ ----------------------
  Home-Insurance-Policy-2024.pdf      Home Insurance     PDF          25-page fictional home
                                                                      insurance policy

  Motor-Insurance-Comprehensive.pdf   Motor Insurance    PDF          20-page motor policy
                                                                      with excesses table

  Life-Health-Plans-Guide.pdf         Life & Health      PDF          18-page health
                                                                      insurance guide

  Product-Docs-Overview.pdf           Product            PDF          12-page SaaS product
                                      Documentation                   documentation

  Engineering-Runbook-v2.pdf          Engineering        PDF          10-page DevOps runbook
                                      Runbooks                        
  ------------------------------------------------------------------------------------------

> **⚠ Note:** Sample documents should be realistic enough to produce
> coherent AI answers but must not contain any real personal data or
> real insurance terms that could mislead end users.

**Seed Run Command**

> cd clara-backend
>
> npm run seed \# Runs scripts/seed-demo.ts via tsx
>
> npm run seed:reset \# Drops demo data and re-seeds (safe for dev)

**Acceptance Criteria**

**✓** npm run seed runs to completion with no errors

**✓** Both organisations appear in platform admin dashboard

**✓** Logging in as omen-admin@omeninsurance.com shows Omen\'s data

**✓** Logging in as techvision-admin@techvision.io shows TechVision\'s
data

**✓** Analytics pages show non-zero query counts (synthetic data)

**✓** Chat with any seeded KB returns relevant answers from seed
documents

+-------------------------------------------+:----------:+:----------:+
| **PHASE 6**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Production Hardening & Security**       | **3--4     | **HIGH**   |
|                                           | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Make the platform safe to demo publicly and ready for a real production
deployment. This phase covers security headers, environment validation,
error handling, rate limiting, CORS, and monitoring.

**6.1 Security**

**Authentication**

- Replace current simple admin token auth with proper JWT + bcrypt
  password hashing

- Session tokens stored in httpOnly Secure SameSite=Strict cookies

- Token refresh endpoint with 15-minute access tokens, 7-day refresh
  tokens

- Rate-limit login endpoint: 5 attempts per IP per 15 minutes

- Account lockout after 10 failed attempts (unlocked by admin)

**API Security**

- All tenant API routes validate that the requesting user belongs to the
  org they\'re querying

- Embed API keys are validated on every request (existing, keep as-is)

- Input validation on all POST/PUT endpoints using Zod schemas

- File upload: MIME type validation, 50MB size limit, virus scan hook

- SQL injection: all queries use parameterised statements (already the
  case --- audit to confirm)

**CORS**

> // next.config.ts --- restrict API access
>
> // Embed endpoints: CORS allowed per api_keys.allowed_origins
>
> // Admin endpoints: same-origin only
>
> // Public endpoints (/api/subscriptions/plans): open CORS

**6.2 Environment Validation**

Create src/lib/env.ts using the t3-env or zod pattern to validate all
environment variables at startup. The application must refuse to start
if required variables are missing:

> // Required at startup --- app crashes with clear error if missing:
>
> DATABASE_URL, QDRANT_URL, QDRANT_API_KEY
>
> AUTH_SECRET (min 32 chars)
>
> OPENAI_API_KEY OR GEMINI_API_KEY (at least one)

**6.3 Error Handling**

- All API routes return consistent JSON: { error: string, code: string,
  status: number }

- Database connection errors show a maintenance page, not a stack trace

- Streaming chat errors emit { type: \'error\', payload: \'\...\' }
  NDJSON event

- Unhandled promise rejections logged to console + (optionally) Sentry

- Plan limit errors return HTTP 402 with { code:
  \'PLAN_LIMIT_EXCEEDED\', upgrade_url: \'\...\' }

**6.4 Rate Limiting**

  ------------------------------------------------------------------------------------------------
  **Endpoint**                    **Limit**                     **Scope**
  ------------------------------- ----------------------------- ----------------------------------
  /api/auth/login                 5 req / 15min                 Per IP

  /api/chat                       60 req / min                  Per org

  /api/embed/chat                 Per                           Per API key
                                  api_key.rate_limit_per_hour   

  /api/kbs/:id/documents/upload   10 req / min                  Per org

  /api/realtime/session           10 req / hour                 Per org
  ------------------------------------------------------------------------------------------------

**6.5 Monitoring**

- GET /api/health --- returns { status, db, qdrant, version, uptime }

- Console structured logging with log levels (info, warn, error)

- Optional: Sentry DSN environment variable for error tracking in
  production

**Acceptance Criteria**

**✓** Application refuses to start if DATABASE_URL is missing

**✓** Login endpoint returns 429 after 5 failed attempts

**✓** User from Org A cannot access Org B\'s knowledge bases

**✓** Uploading a .exe file returns 400 with INVALID_FILE_TYPE error

**✓** GET /api/health returns 200 with db=ok and qdrant=ok

**✓** Stack traces never appear in API error responses

+-------------------------------------------+:----------:+:----------:+
| **PHASE 7**                               | ESTIMATE   | RISK       |
|                                           |            |            |
| **Deployment, CI/CD & Documentation**     | **3--4     | **MEDIUM** |
|                                           | days**     |            |
+-------------------------------------------+------------+------------+

**Goal**

Package all three applications for production deployment. Set up
continuous deployment pipelines. Write operator documentation so anyone
can stand up the entire platform from scratch.

**7.1 Docker Compose (Local / Self-Hosted)**

A single docker-compose.yml at the clara-platform/ root starts the
entire platform:

> services:
>
> postgres: postgres:16-alpine (port 5432)
>
> qdrant: qdrant/qdrant (port 6333)
>
> clara-backend: Built from Dockerfile (port 3010)
>
> omen-app: Built from Dockerfile (port 3001)
>
> techvision-app: Built from Dockerfile (port 3002)

**7.2 Cloud Deployment (Recommended: Vercel + Railway)**

  ----------------------------------------------------------------------------
  **Service**            **Platform**       **Notes**
  ---------------------- ------------------ ----------------------------------
  clara-backend          Railway (Node.js)  Has long-running processes,
                                            WebSockets, cron jobs

  clara-omen-insurance   Vercel             Pure Next.js, no long-running
                                            processes

  clara-techvision       Vercel             Pure Next.js, no long-running
                                            processes

  PostgreSQL             Railway / Supabase Managed Postgres with automated
                                            backups

  Qdrant                 Qdrant Cloud       Existing cloud instance (already
                                            configured)
  ----------------------------------------------------------------------------

**7.3 Environment Configuration per Deployment**

Each Vercel project (omen + techvision) requires these environment
variables set in the Vercel dashboard:

> CLARA_BACKEND_URL=https://api.clara.yourdomain.com
>
> CLARA_ORG_ID=\<production org UUID\>
>
> NEXT_PUBLIC_ORG_NAME=Omen United Insurance
>
> NEXT_PUBLIC_PLAN=pro

**7.4 GitHub Actions CI**

Each repository gets a .github/workflows/deploy.yml:

- On push to main: run ESLint + TypeScript check

- On push to main: run npm run build (catches build errors before
  deploy)

- On PR: run type-check and lint, post results as PR comment

- On merge to main: trigger Vercel/Railway deployment via webhook

**7.5 Documentation**

  --------------------------------------------------------------------------
  **Document**       **Location**             **Audience**
  ------------------ ------------------------ ------------------------------
  SETUP.md           clara-platform/ root     Developer --- full local setup
                                              guide

  DEPLOYMENT.md      clara-platform/ root     Ops --- cloud deployment guide

  API.md             clara-backend/docs/      Developer --- all REST
                                              endpoints

  SEED.md            clara-backend/scripts/   Developer --- seed data
                                              explanation

  TENANT-GUIDE.md    clara-omen-insurance/    Client --- how to use the
                                              portal

  EMBED-GUIDE.md     clara-backend/docs/      Client --- how to embed Clara
                                              on their site
  --------------------------------------------------------------------------

**Risk Register**

  ---------------------------------------------------------------------------------------------
  **Risk**           **Phase**   **Likelihood**   **Impact**   **Mitigation**
  ------------------ ----------- ---------------- ------------ --------------------------------
  Database migration 0,1         Low              High         Run migrations on a database
  breaks existing                                              copy first; keep rollback SQL
  data                                                         

  Qdrant Cloud quota 5           Medium           Medium       Batch seed documents in groups
  exceeded during                                              of 5; add delay between batches
  seeding                                                      

  OpenAI Realtime    4           Medium           High         Test on target demo machine;
  API WebRTC fails                                             have text-only fallback ready
  in demo                                                      

  CORS blocks tenant 3,4         Medium           High         Set ALLOWED_ORIGINS env to
  apps from calling                                            include localhost:3001,3002
  backend                                                      during dev

  Static data left   3,4         High             Medium       Add a test that calls every API
  in tenant apps                                               endpoint and asserts non-empty
                                                               response

  Stripe webhook not 1           N/A              Low          Stripe is optional in Phase 1
  configured for                                               --- plan changes managed by
  billing                                                      admin manually
  ---------------------------------------------------------------------------------------------

**Timeline Summary**

  -----------------------------------------------------------------------------------
  **Phase**   **Name**                 **Duration**   **Dependencies**   **Owner**
  ----------- ------------------------ -------------- ------------------ ------------
  Phase 0     Directory Reorganisation 1--2 days      None               Lead Dev

  Phase 1     Subscription System      3--4 days      Phase 0            Backend Dev

  Phase 2     Platform Marketing Site  4--5 days      Phase 0, 1         Full-stack
              Merge                                                      Dev

  Phase 3     Omen Insurance Tenant    5--6 days      Phase 1, 2         Full-stack
              App                                                        Dev

  Phase 4     TechVision Floating      4--5 days      Phase 1, 2         Full-stack
              Widget App                                                 Dev

  Phase 5     Data Seeding & Demo      2--3 days      Phase 3, 4         Dev +
              Content                                                    Content

  Phase 6     Production Hardening     3--4 days      Phase 5            Backend Dev

  Phase 7     Deployment &             3--4 days      Phase 6            DevOps + Dev
              Documentation                                              

              TOTAL ESTIMATE           25--33 days                       
  -----------------------------------------------------------------------------------

> **ℹ** Phases 3 and 4 can be worked in parallel if two developers are
> available, reducing total time to 18--25 days.

**Pre-Demo Final Checklist**

**Infrastructure**

**✓** clara-backend running on port 3010, connected to PostgreSQL and
Qdrant

**✓** clara-omen-insurance running on port 3001

**✓** clara-techvision running on port 3002

**✓** All 3 accessible from demo machine without VPN or localhost tunnel

**Platform (port 3010)**

**✓** Landing page loads with dynamic pricing from database

**✓** Admin login works with admin@clara.ai

**✓** Dashboard shows real org count, revenue, usage

**✓** Both demo orgs visible in org management table

**Omen Insurance (port 3001)**

**✓** Login with omen-admin@omeninsurance.com

**✓** Dashboard shows real KB stats (not static)

**✓** Sidebar chat responds to insurance policy questions with citations

**✓** Voice modal opens and speaks aloud

**✓** Analytics page shows 30-day query chart

**✓** Uploading a PDF triggers processing and shows ready status

**TechVision (port 3002)**

**✓** Login with techvision-admin@techvision.io

**✓** Dashboard shows real KB stats

**✓** Floating Clara button visible on every page, bottom-right

**✓** Clicking button opens chat panel with streaming responses

**✓** Voice button opens voice popup, connects to OpenAI Realtime

**✓** Demo website page (/demo-website) renders convincingly with widget

**✓** Upgrade to Pro CTA links correctly to platform pricing page

**Appendix A --- Technology Stack**

  ------------------------------------------------------------------------
  **Category**    **Technology**        **Purpose**
  --------------- --------------------- ----------------------------------
  Frontend        Next.js 15 (App       All three applications
                  Router)               

  UI Components   Tailwind CSS +        Styling and accessible components
                  shadcn/ui             

  Database        PostgreSQL 16         All structured data

  Vector Store    Qdrant Cloud          Semantic embeddings for RAG

  AI Provider     OpenAI GPT-4o-mini    Text chat + embeddings

  Voice AI        OpenAI Realtime API   Real-time voice conversation

  Auth            Custom JWT + bcrypt   Session management

  File Parsing    pdf-parse, mammoth,   PDF, DOCX, URL ingestion
                  cheerio               

  Queue           Self-HTTP fetch       Async document processing
                  trigger               

  Deployment      Vercel + Railway      Production hosting

  CI              GitHub Actions        Lint, type-check, deploy
  ------------------------------------------------------------------------

**Appendix B --- File Structure Reference**

**clara-backend --- New Route Groups Added in Phase 2**

> src/app/(platform)/
>
> ├── layout.tsx ← Marketing nav (Home, Features, Pricing, Sign in)
>
> ├── page.tsx ← Landing page --- dynamic pricing fetched server-side
>
> ├── pricing/page.tsx ← Full pricing page with FAQ
>
> └── contact/page.tsx ← Contact / book a demo form
>
> src/app/(admin)/
>
> ├── layout.tsx ← Admin sidebar with platform nav
>
> ├── login/page.tsx ← /login
>
> ├── dashboard/page.tsx ← Platform super-admin overview
>
> ├── orgs/
>
> │ ├── page.tsx ← Org list + management
>
> │ └── \[orgId\]/page.tsx ← Individual org detail
>
> └── subscriptions/page.tsx ← Revenue + plan management

**clara-omen-insurance --- Full Structure**

> src/
>
> ├── app/
>
> │ ├── (auth)/
>
> │ │ └── login/page.tsx
>
> │ ├── (portal)/
>
> │ │ ├── layout.tsx ← Navy sidebar nav
>
> │ │ ├── dashboard/page.tsx
>
> │ │ ├── knowledge-bases/
>
> │ │ │ ├── page.tsx ← KB list
>
> │ │ │ └── \[kbId\]/page.tsx ← KB detail + upload + configure
>
> │ │ ├── chat/page.tsx
>
> │ │ ├── analytics/page.tsx
>
> │ │ └── settings/page.tsx
>
> │ ├── api/
>
> │ │ └── auth/\[\...\]/route.ts ← Proxy to clara-backend auth
>
> │ └── layout.tsx
>
> ├── components/
>
> │ ├── layout/Sidebar.tsx
>
> │ ├── chat/ChatSidebar.tsx
>
> │ └── voice/VoiceModal.tsx ← Ported from Clara-AI-RAG
>
> └── lib/
>
> ├── api-client.ts ← HTTP client for clara-backend
>
> └── auth.ts ← Cookie + session helpers

**clara-techvision --- Key Difference from Omen**

> src/components/
>
> ├── FloatingClaraButton/
>
> │ ├── index.tsx ← Root floating button + collapse state
>
> │ ├── ChatPanel.tsx ← Expanded chat panel (streaming)
>
> │ └── VoiceModal.tsx ← Voice popup modal (ported)
>
> └── layout/
>
> └── RootLayout.tsx ← Renders \<FloatingClaraButton /\> on every page
