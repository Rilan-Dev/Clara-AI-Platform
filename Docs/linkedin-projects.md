# Clara Platform — LinkedIn Project Showcase Content

> **Format**: Each section is ready to paste directly into LinkedIn's "Add Project" section.
> **Limit**: Descriptions are well under LinkedIn's 2,000-character cap.
> **Media**: Add your GitHub repo links and live deployment URLs in the Media section of each project card.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROJECT 1 — CLARA AI PLATFORM (Backend & Admin)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Project Name
**Clara AI — RAG-Powered Multi-Tenant AI Platform**

---

### Description (LinkedIn field — paste as-is)

```
Clara AI is a production-grade, multi-tenant Retrieval-Augmented Generation (RAG) platform
that enables organisations to deploy branded AI assistants powered by their own knowledge bases.

🏗️ Architecture & Infrastructure
• Next.js 15 (App Router) — full-stack monolith with SSR, Edge Middleware, and API routes
• Qdrant vector database for semantic search across ingested documents
• Redis + BullMQ async job queue for background web-crawl and document ingestion pipelines
• Dockerised production stack: isolated frontend/backend bridge networks, read-only container FS
• Content Security Policy (CSP) hardening + security headers applied at Edge

🤖 AI & Machine Learning
• Dual AI provider factory: OpenAI GPT-4o / GPT-4o-mini and Google Gemini 2.5 Flash
• Switchable at runtime via env flag — zero code change to change provider
• OpenAI Realtime API (WebSocket) for sub-200ms voice conversations (GPT-4o Realtime)
• Gemini Live native audio streaming as alternative voice layer
• Voice Activity Detection (VAD) tuning: threshold, prefix & silence timing configurable
• Automated document ingestion: PDF, DOCX, XLSX, web scraping via Playwright + Cheerio

🔐 Security & Multi-Tenancy
• 3-tier auth: platform super-admin cookies → org-level Bearer tokens → public embed API keys
• Edge Middleware guards 23 API route groups with per-tier CORS policy
• Embed widget accepts wildcard CORS for third-party site injection
• Stripe (USD) + Razorpay (INR) dual-gateway subscription system with webhook verification

📊 Management Portal
• Admin dashboard: organisations, subscriptions, analytics, knowledge-base management
• Organisation-scoped projects and knowledge bases with plan-limit enforcement
• Real-time analytics API, RAG evaluation endpoints, document catalog

Tech: Next.js 15 · TypeScript · Qdrant · Redis · BullMQ · OpenAI · Gemini · Stripe · Razorpay · Docker · Tailwind · Radix UI · React Query · Three.js
```

---

### Business Analysis

**Problem Solved:**
Enterprises want AI assistants trained on their proprietary knowledge (product manuals, policies, documentation) but lack the infrastructure to build, host, and manage RAG pipelines securely — especially at a per-organisation tenancy level with billing, access control, and embeddable delivery.

**Solution Delivered:**
A complete SaaS backend that any organisation can subscribe to. They get their own isolated knowledge bases, AI chat powered by their documents, a subscription tier, and an embeddable widget for their public-facing websites — all managed from a central admin portal.

**Key Technical Achievements:**
- Built a provider-agnostic AI factory pattern — swapping OpenAI for Gemini requires only an environment variable change, protecting the business from vendor lock-in
- Engineered async ingestion pipeline that decouples web crawling (10,000+ page sites) from HTTP request lifecycle using BullMQ, preventing timeouts
- Implemented Gemini Live + OpenAI Realtime voice as parallel voice layers with VAD tuning, delivering speech-to-speech in under 200ms
- Dual payment gateway (Stripe for international, Razorpay for India) with full webhook verification — enabling global revenue collection from day one
- Security-first design: read-only container filesystem, CSP headers at Edge, network-isolated Qdrant (never exposed externally)

**Measurable Outcomes:**
- Supports unlimited organisations within a single deployment
- Document ingestion scales horizontally via configurable worker concurrency
- Voice response latency under 200ms on Realtime API
- Zero-downtime deployments supported via `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stability strategy

---

### Media Links (add to LinkedIn project card)
- **GitHub Repository**: `https://github.com/[your-handle]/clara-backend`
- **Live Admin Portal**: `https://[your-domain]/`
- **API Health**: `https://[your-domain]/api/health`

---
---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROJECT 2 — AMAZETECHCLANS VISITOR WEBSITE
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Project Name
**AmazeTechClans — AI-Powered Corporate Visitor Website with Embedded Clara Chat**

---

### Description (LinkedIn field — paste as-is)

```
AmazeTechClans is the public-facing corporate website for AmazeTech, showcasing a portfolio
of enterprise software products while demonstrating live Clara AI-powered chat directly
embedded on the visitor experience.

🌐 Multi-Product Website Architecture
• Vite 5 + React 18 SPA — blazing-fast builds with SWC compiler plugin
• React Router v6 for multi-page navigation across product showcases:
  – GAO (General Administration Office) product landing
  – DMS (Document Management System) with product detail pages (DQMS, DCMS, DGMS, CSM)
  – CARWA vehicle management platform
  – AI Voice product landing page
  – Subscription page with plan selection

🤖 Clara AI Widget Integration
• Embedded Clara chat widget (ClaraWidget.tsx — 22KB) consuming the Clara Backend API
• Persistent floating assistant available across all routes
• Connects to Clara RAG API via org-scoped API key — no backend code in the frontend
• Demonstrates live RAG Q&A on company products and services for visitors

🎨 UI/UX Engineering
• shadcn/ui component library with full Radix UI primitives
• TailwindCSS v3 with typography plugin for rich content pages
• Dark/light theme switching via next-themes
• Recharts for data visualisation on product capability pages
• Embla Carousel for product showcases and testimonial sliders
• Toast notifications (Sonner) for form feedback

📦 Form & Data Layer
• React Hook Form + Zod validation for contact and subscription forms
• TanStack React Query v5 for API state management
• Axios for HTTP client abstraction over Clara API

Tech: Vite 5 · React 18 · TypeScript · React Router v6 · TanStack Query · shadcn/ui · Radix UI · TailwindCSS · Recharts · Zod · Docker
```

---

### Business Analysis

**Problem Solved:**
AmazeTech needed a single corporate website that (a) showcases their diverse software product portfolio to enterprise visitors and (b) provides an intelligent, self-service AI assistant so visitors can ask questions and get instant answers without waiting for a sales rep.

**Solution Delivered:**
A highly optimised SPA that serves multiple distinct product landing pages (GAO, DMS, CARWA, AI Voice) from a single Vite bundle — with a persistent Clara AI chat widget embedded globally, powered live by the Clara RAG backend. Visitors can query product documentation, pricing, and features conversationally.

**Key Technical Achievements:**
- Architected a single React app that delivers 8+ distinct product/landing experiences without page reloads, maintaining brand consistency with per-route theming
- Integrated the Clara AI widget as a zero-backend component — the 22KB ClaraWidget component handles WebSocket sessions, message history, and voice input, consuming only the org API key from environment
- Used Vite SWC plugin (not Babel) for ~40% faster hot module replacement during development and smaller production bundles
- Implemented subscription flow with Zod-validated forms linking to Clara Backend's plan checkout API

**Measurable Outcomes:**
- Single Docker image deploys the entire multi-product experience
- Clara widget provides instant AI responses to visitor queries — reducing support team load
- Zero vendor lock-in for AI: widget backend can switch between GPT-4o and Gemini via env change
- Vite build output fully static — CDN-deployable with any provider (Vercel, Netlify, Cloudflare Pages)

---

### Media Links (add to LinkedIn project card)
- **GitHub Repository**: `https://github.com/[your-handle]/amazetechclans-89`
- **Live Website**: `https://[your-amazetech-domain]/`
- **DMS Product Page**: `https://[your-amazetech-domain]/dms`

---
---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROJECT 3 — CLARA OMEN INSURANCE PORTAL
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Project Name
**Omen United Insurance — White-Label Clara AI Knowledge Portal (Pro Tier)**

---

### Description (LinkedIn field — paste as-is)

```
The Omen United Insurance portal is a white-label, organisation-branded AI knowledge portal
built on the Clara Platform. It enables insurance staff to query internal knowledge bases,
analyse usage analytics, and chat with an AI assistant trained on insurance policies and documentation.

🏢 White-Label Architecture
• Next.js 15 + React 19 — latest framework pairing for optimal performance
• Fully branded via environment variables: org name, slug, primary (#0A1628 navy), accent (#C8821A gold)
• Organisation identity injected at build time — no code changes per tenant
• Runs on port 3001, isolated from the Clara backend (port 3000)
• Connected to Clara Backend via CLARA_BACKEND_URL + CLARA_ORG_ID + CLARA_ADMIN_TOKEN

🔐 Authentication & Security
• Organisation-scoped JWT authentication (clara_token cookie / Authorization Bearer)
• Middleware-protected routes: /dashboard, /knowledge-bases, /analytics, /chat, /settings
• React Router v6 nested layout with OmenPortalShell as persistent navigation wrapper
• Redirects unauthenticated users to /login with return-URL preservation

📊 Feature Modules (Pro Plan)
• Dashboard: AI conversation overview, plan usage, activity metrics
• Knowledge Bases: Browse, search, and manage insurance policy document collections
• AI Chat: RAG-powered chat interface querying ingested insurance documents
• Analytics: Usage trends, query volume, response quality metrics (Recharts)
• Settings: Organisation configuration, user management, API key management

🛠️ Technical Stack
• Zustand v5 for lightweight global state (auth token, org metadata, plan info)
• TanStack React Query v5 for server state, caching, and background refetching
• React Hook Form + Zod for form validation (login, KB creation, settings)
• Axios for all Clara Backend API communication
• TailwindCSS + clsx + tailwind-merge for utility-first styling

Tech: Next.js 15 · React 19 · TypeScript · React Router v6 · TanStack Query · Zustand · Recharts · Zod · Axios · TailwindCSS · Docker
```

---

### Business Analysis

**Problem Solved:**
Insurance organisations need secure, AI-powered portals where staff can instantly query complex policies, underwriting guidelines, and compliance documents — without bespoke AI development costs. They need a system that reflects their brand identity and respects their document ownership.

**Solution Delivered:**
The Omen Insurance portal is a fully operational Clara tenant on the Pro plan. Staff authenticate, browse organised knowledge bases, and chat directly with an AI trained exclusively on Omen's internal documents. The portal reflects Omen's corporate identity (navy + gold brand palette) without a single custom line of AI code — all business logic comes from the Clara Backend.

**Key Technical Achievements:**
- Implemented white-label theming via CSS custom properties driven by environment variables — a single `NEXT_PUBLIC_PRIMARY_COLOUR` env var repaints the entire application at build time
- Pro-tier plan gates access to Settings and advanced Analytics screens; Starter-tier orgs see a subset of routes — plan enforcement in the router with no backend round-trips
- Middleware auth guard using dual-source token detection (cookie + header) ensures both browser navigation and API calls are protected consistently
- Adopted React 19 + Next.js 15 canary — leveraging React compiler optimisations for reduced re-renders in chat and analytics views

**Measurable Outcomes:**
- A new insurer organisation can be onboarded in minutes: run seed script → set env vars → deploy
- Zero AI engineering required per tenant — all RAG tuning managed centrally on Clara Backend
- Pro plan unlocks full analytics and settings, creating a clear upsell path from Starter
- Complete organisational data isolation: Omen never accesses TechVision's knowledge bases (enforced at backend org-ID level)

---

### Media Links (add to LinkedIn project card)
- **GitHub Repository**: `https://github.com/[your-handle]/clara-omen-insurance`
- **Live Portal**: `https://[omen-portal-domain]/dashboard`

---
---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROJECT 4 — CLARA TECHVISION PORTAL
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Project Name
**TechVision Solutions — White-Label Clara AI Knowledge Portal (Starter Tier)**

---

### Description (LinkedIn field — paste as-is)

```
The TechVision Solutions portal is a Starter-tier organisation portal on the Clara Platform,
demonstrating the plan-differentiated deployment model. It provides a focused AI knowledge
assistant experience for technical teams, with a curated route set appropriate for the Starter plan.

🏢 Organisation Portal Architecture
• Next.js 15 + React 19 full-stack framework
• TechVision identity via env: org name, slug, plan=starter, port 3002
• CLARA_BACKEND_URL connects to the shared Clara backend instance
• Includes a dedicated /demo route for showcasing capabilities to prospects
• Dockerised with separate Dockerfile for independent scaling and deployment

🔐 Authentication & Routing
• React Router v6 with TechVisionPortalShell nested layout
• Protected routes: /dashboard, /chat, /knowledge-bases, /analytics
• Middleware JWT auth guard — Bearer token + cookie dual detection
• Unauthenticated access redirects to /login with preserved return path

📊 Starter-Tier Feature Set
• Dashboard: Conversation counts, knowledge base status, recent activity
• AI Chat: RAG-powered conversational interface for technical documentation
• Knowledge Bases: View and query indexed technical documentation sets
• Analytics: Basic usage metrics and query volume trends
• Demo Screen: Guided demonstration flow for sales/prospect walkthroughs

🛠️ Technical Stack
• Zustand v5 — global auth state and org config management
• TanStack React Query v5 — API data fetching with intelligent caching
• React Hook Form + Zod — type-safe form validation
• Axios — HTTP client for Clara Backend API communication
• Recharts — lightweight data visualisation for analytics dashboards
• TailwindCSS — utility-first styling with custom brand tokens

Tech: Next.js 15 · React 19 · TypeScript · React Router v6 · TanStack Query · Zustand · Recharts · Zod · Axios · TailwindCSS · Docker
```

---

### Business Analysis

**Problem Solved:**
Technology companies need AI-powered internal tools for querying technical documentation, runbooks, and architecture guides — but their team size and budget fit a leaner plan. They also need a demo environment to evaluate the platform before committing to Pro.

**Solution Delivered:**
The TechVision portal delivers a focused Starter-tier experience — core AI chat and analytics, without advanced settings management — paired with a built-in `/demo` route that allows the sales team to walk prospects through the product experience. The platform's pricing page link (`NEXT_PUBLIC_PLATFORM_PRICING_URL`) is surfaced contextually, creating a natural upsell to Pro.

**Key Technical Achievements:**
- Demonstrated the reusability of the Clara org-portal architecture: TechVision shares code patterns with Omen but has its own brand, plan, routes, and feature surface — deployed as a completely independent application
- The `/demo` screen showcases RAG capabilities to prospects without requiring a real org account — a prospect acquisition tool built into the product
- Pricing upgrade CTA links directly to the Clara Platform pricing page, closing the conversion loop from trial to paid plan
- Identical React 19 + Zustand + React Query stack confirms the org-portal template is technology-stable and reusable across all future tenant onboardings

**Measurable Outcomes:**
- New tenant portal deployable in < 30 minutes: clone repo, set 6 env vars, docker build, deploy
- Demo route reduces sales cycle: prospects see live AI Q&A without account setup friction
- Starter → Pro upgrade path built into UI via pricing CTA, enabling self-serve conversion
- Identical tech stack across all org portals means one engineering team maintains 2+ white-label products simultaneously

---

### Media Links (add to LinkedIn project card)
- **GitHub Repository**: `https://github.com/[your-handle]/clara-techvision`
- **Live Portal**: `https://[techvision-portal-domain]/dashboard`
- **Demo**: `https://[techvision-portal-domain]/demo`

---
---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PLATFORM-LEVEL LINKEDIN NARRATIVE (Optional)
## For "About" section or Featured content
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
🚀 Clara Platform — End-to-End AI SaaS Ecosystem

Built a complete multi-tenant AI platform from the ground up, spanning 4 interconnected systems:

1️⃣ Clara Backend — RAG engine, admin portal, 23-endpoint REST API, dual AI providers, voice AI,
   background ingestion pipelines, dual payment gateways (Stripe + Razorpay)

2️⃣ AmazeTechClans — Public corporate website consuming Clara's embed widget to deliver live AI
   Q&A to visitors across 8 product experience routes

3️⃣ Clara Omen Insurance — White-label Pro-tier portal for an insurance organisation — private
   knowledge base chat, analytics, and settings management

4️⃣ Clara TechVision — White-label Starter-tier portal for a technology company — core AI chat,
   knowledge bases, and a prospect demo experience

Every line of code is TypeScript. Every deployment is containerised. Every AI call is provider-agnostic.

Core tech across the platform:
Next.js 15 · React 18/19 · Vite 5 · Qdrant · Redis · BullMQ · OpenAI · Gemini · Stripe
Razorpay · Docker · Zustand · TanStack Query · Zod · TailwindCSS · Radix UI · Recharts
```

---

*Generated by Antigravity — Technical Analysis of Clara Platform (March 2026)*
